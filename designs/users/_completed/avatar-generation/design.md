# Profile picture generation moves to the write seam

`profile.picture` is a gradient-and-initials SVG derived from `given_name`,
`family_name` and `avatar_color`. Today each edit form is responsible for generating it
client-side and posting it in the payload. Four of the seven write paths never do, so their
users have no avatar at all; the three that do can go stale, because a rename that doesn't
pass through a picker recomputes `profile.name` server-side and leaves `picture` showing the
old initials.

This design makes `picture` a **derived field owned by the write**, exactly as `profile.name`
already is, in all three server-side profile write seams.

## Proposed change

1. Add a shared derivation fragment that merges the incoming profile onto the stored one and
   returns the merged bag with `name` and `picture` derived. One implementation, `_ref`'d by
   every seam.
2. Restructure `write-profile.yaml` to read-then-derive-then-write, so both derived fields are
   computed in one place instead of `name` in MQL and `picture` in the client.
3. Apply the same fragment in `contacts`' `create-contact` and `update-contact`, which today
   independently reimplement the same two-stage merge-and-derive-`name` pipeline.
4. Fold colour selection into the derivation — one random draw from the palette when neither the
   payload nor the stored profile carries an `avatar_color`, persisted so it stays stable (D7).
5. Delete the three client-side `generate_avatar` SetState actions, and drop the read-only avatar
   preview from `contacts`' two forms (D9). `generate-avatar-svg.js.njk` is superseded by the new
   derivation fragment, which the colour picker rebinds to for its live preview.
6. Wrap every payload-derived value these stages inject into MQL in `$literal`, in all three seams —
   the profile bag, `email` / `lowercase_email`, `global_attributes` and the derived scalars (D6).
7. Simplify the colour picker to a single state key, so its cursor cannot disagree with the gradient
   on screen (D7a).
8. Close a write-authorization gap in `create-contact` by minting the contact `_id` server-side, so a
   payload can no longer name an existing document to overwrite (D10). Not an avatar change; folded in
   because it lives in the stages being rewritten.

## Current state

### One generator, three of seven callers use it

`modules/shared/profile/generate-avatar-svg.js.njk` is the single implementation — a `_js` body
that reads `state.<prefix>.{given_name, family_name, avatar_color}` and returns a ~800-character
`data:image/svg+xml;charset=utf-8,…` URI. Whether a write actually stores one depends entirely on
whether that form remembered a `generate_avatar` SetState before its `CallAPI`:

| Write path                                          | Picker / preview           | Stores `picture` |
| --------------------------------------------------- | -------------------------- | ---------------- |
| `contacts/pages/new.yaml:91`                        | preview, **random** colour | yes              |
| `contacts/pages/edit.yaml:128`                      | preview                    | yes              |
| `contacts/components/contact-selector.yaml.njk:186` | inline modal               | yes              |
| `user-account/pages/onboarding.yaml`                | picker, colour **index 0** | **no**           |
| `user-account/components/view/modal_profile.yaml`   | picker                     | **no**           |
| `user-admin/components/view/modal_profile.yaml`     | **none**                   | **no**           |
| `user-admin/components/invite_form.yaml`            | **none**                   | **no**           |

This is the correction to F14, which records that nothing anywhere generates a picture. That was
true when written; `contacts` generates now. What remains true is that no path owned by the two
_user_ modules does, which is why the header avatar is blank for anyone who came through onboarding.

### `name` is already server-derived — in all three seams

Every server-side profile write uses the same two-stage shape: stage 1 `$mergeObjects` the incoming
profile onto the stored bag, stage 2 `$set: profile.name` from the merged `given_name` /
`family_name`.

| Seam                                        | Stage 1 / stage 2   | Covers                                                   |
| ------------------------------------------- | ------------------- | -------------------------------------------------------- |
| `modules/shared/contact/write-profile.yaml` | `:42-48` / `:53-61` | user-account self-edit, user-admin operator edit, invite |
| `modules/contacts/api/create-contact.yaml`  | `:52-57` / `:68-76` | contact create                                           |
| `modules/contacts/api/update-contact.yaml`  | `:28-33` / `:44-52` | contact edit                                             |

So the codebase has already decided that name-derived profile fields belong to the write. `picture`
has identical inputs and is the only one that doesn't follow the rule. **That asymmetry is the
defect** — not the absence of a generator call in four forms, which is only its most visible symptom.

The concrete failure: `user-admin/components/view/modal_profile.yaml` has no picker and no generate
step. An operator correcting a surname recomputes `name` and leaves `picture` on the old initials,
permanently, with nothing in the UI to indicate it.

### Colour selection contradicts its own documentation

`docs/shared/avatar-colors.md` states: "A hash of the user id is taken modulo the palette length to
pick an index. Same id → same index → same gradient on every page."

No code does this. `modules/shared/profile/avatar-picker-seed.yaml:15-19` seeds palette index 0
unconditionally, so every user who completes onboarding gets the same red gradient;
`contacts/pages/new.yaml:33-43` and `contact-selector.yaml.njk:169-185` pick randomly on init.

The defect is the index-0 seed and the fact that three files each decide independently, not the absence
of a hash specifically — the requirement is a roughly uniform spread, which random-on-init already
satisfies. D7 keeps the random draw, moves it to the one place that owns the choice, and stores the
result so it stops being re-rolled. The docs page is reworded to match (see Files changed): its
guarantee — same person, same colour everywhere — is what has to hold, and storage delivers it.

## Key decisions

### D1 — `picture` stays stored, and stays a write-time value

Two properties are worth separating, because only one of them is in question:

- **Stored, not derived at read time.** Unchanged and not up for debate. The events timeline reads
  `created.user.picture` off a change stamp, the contacts table binds `profile.picture`, and
  `users.image` is a better-auth column that `resolveAuthentication` reads per request to build
  `_user` — there is no hook that could compute it there. Deriving at read time would also mean
  repeating an expression MQL cannot express (see D3) at every read site.
- **Computed by the write, not by the caller.** This is what changes.

Real photo uploads argue for the write seam rather than against it. Under an upload, `picture` stops
being a function of the name and colour for that user, and something has to know not to regenerate
it. At the seam that is one guard in one file. Distributed across forms it is a rule four of them
must each remember — and user-admin's modal, which has no picker at all, would silently overwrite an
uploaded photo on any rename. No guard is built here (no upload exists yet); the point is only that
the seam is where it would go.

### D2 — Derive `name` and `picture` in the routine, not in MQL

`name` sits in an MQL stage today for one reason: stage 2 sees the post-`$mergeObjects` bag, so a
payload that omits `given_name` still derives from the stored value. The routine only ever holds the
payload. It is a data-availability constraint, not a complexity one — the expression itself is a
`$concat` of two `$trim`s.

Once `picture` has to be computed in the routine regardless (D3), keeping `name` in MQL would leave
two derivation sites for one set of inputs — worse than either extreme. So `name` joins `picture` in
the routine, and the seam reads first to give the derivation the stored bag:

```
1. read_profile_contact MongoDBFindOne — the stored profile
2. (inline in step 3)   derive name, avatar_color and picture from stored + incoming
3. write_contact        pipeline update:
                          stage 1 — $set profile: $mergeObjects [stored, incoming] + change stamp
                          stage 2 — $set profile: $mergeObjects [stage 1's bag, derived keys]
                          stage 3 — $set profile.picture: $$REMOVE when name is null
                          then write_stages
4. reread_contact       MongoDBFindOne
5. denorm_user_profile  UpdateUserProfile (guarded on user_id)
```

Only stage 2's `$concat` / `$trim` disappears. `name` and `picture` can no longer disagree because
nothing computes them separately.

**Stage 1's `$mergeObjects` stays in MQL, deliberately.** The tempting simplification is to merge in
the routine too and write the whole finished bag with one `$set: profile: <derived bag>`. That turns
every seam into a read-modify-write across two round-trips, and MongoDB's atomic per-document merge is
exactly what stops one writer clobbering another's fields. The window is two form saves against the
same person: an operator correcting a surname in user-admin's modal while that user updates their own
phone number, or either racing a `contacts` edit-page save on a contact who is also a user. Under a
whole-bag write the operator reads `{given_name: Jon, phone: 111}`, the user saves `{phone: 222}`, and
the operator's write reverts the phone — a regression today's shape does not have, because the
operator's payload carries only `given_name`.

Keeping the merge in MQL costs nothing: the read is needed either way (the derived values must reflect
the merged bag, and MQL cannot compute them — D3), so the round-trip count is identical, and the
derivation still lives in exactly one place. What stays in MQL is a _merge_, not a derivation. The
same applies to `update-contact`'s `global_attributes` merge, which keeps its atomicity too.

Accepted residual: the three derived scalars are computed from the read snapshot, so if a concurrent
write changes `given_name` in the window and our payload omits it, `name` / `picture` briefly reflect
the older name. Any subsequent write through any seam corrects them, and the blast radius is three
derived fields rather than arbitrary profile data.

The cost is one extra round-trip per seam. `write-profile` goes from three DB operations to four; the
alternative shape (keep MQL `name`, add a second write for `picture` after the re-read) is also four,
so this is not the more expensive option — it is the same price for a simpler pipeline.
`update-contact` goes from one to two, which is a proportionally larger jump on the contacts edit path
but still one indexed `_id` lookup. `create-contact` is unchanged, since it needs no read (see Files
changed).

There is no separate "compute" step type in a routine, so the derivation is inline in step 3's
properties, where its result is used. The denorm continues to read `reread_contact`, so the
expression appears once.

**It must appear exactly once, and that constrains stage 2's shape.** Every occurrence of the `_js`
call is an independent evaluation, so writing one per derived scalar would draw a fresh random
colour for each — the stored `avatar_color` would then disagree with the colour baked into
`picture`. Stage 2 therefore makes a single call that returns all three keys at once, and merges
that object onto stage 1's result:

```yaml
- $set:
    profile:
      $mergeObjects:
        - "$profile"
        - $literal: { <the one derive-profile call> }
```

This is also why the derivation returns **only** the derived keys and not the merged bag (D5).
Merging the whole read snapshot back over stage 1's output would revert a concurrent writer's
untouched fields — the lost update this decision exists to avoid.

### D3 — The derivation cannot live in MQL

Percent-encoding is unavoidable: the palette is hex, so `#` must be escaped, and the payload is XML.
MongoDB has no `encodeURIComponent`. The two workarounds are an eight-deep `$replaceAll` chain, or
`$convert … format: base64`, which requires MongoDB 8.0 and would change the stored URI's format.
Both are worse than computing in the routine. This is settled, not deferred.

### D4 — `reread_contact` stays

Read-first appears to make the re-read redundant. It doesn't. `request_stages.write` is documented
in `user-account/module.lowdefy.yaml:87-93` as "used for **derived fields** or extra transforms
beyond the built-in profile write," so a consumer stage may legitimately modify `profile` after our
`$set`, and the re-read is what guarantees the denorm copies what actually landed.

No in-repo caller passes stages — all three pass the `[]` default — but that is not evidence the slot
is unneeded, and the guarantee is the fragment's existing contract.

### D5 — Share the derivation, not the whole write

"Fold contacts in" is the goal; the question is what the shared unit is. Folding contacts' two APIs
wholesale into `write-profile.yaml` does not work cleanly — the fragment would need four or five new
vars to cover what contacts does and user-account/user-admin don't:

| Need                        | `write-profile`    | `create-contact`            | `update-contact`                |
| --------------------------- | ------------------ | --------------------------- | ------------------------------- |
| Target                      | UpdateOne by `_id` | insert, server-minted `_id` | UpdateOne + extra filter clause |
| `global_attributes`         | no                 | yes                         | yes                             |
| `email` / `lowercase_email` | no                 | yes (insert-only)           | no (immutable)                  |
| `created` stamp             | no                 | yes                         | no                              |
| Denorm to the auth user     | yes                | no (no user row)            | no                              |
| Returns the new id          | no                 | yes                         | no                              |

(The `create-contact` column describes its shape after D10, which turns the client-keyed upsert into a
server-minted insert. The targets differ either way, which is the point here.)

Adding `upsert`, `insert_fields`, `global_attributes` and `extra_filter` vars would turn the shared
fragment into a small framework, and every consumer would pay to learn surface that exists for one
caller. Rejected.

What is actually duplicated and actually drifting is the **derivation** — merge the bags, derive the
name, derive the picture. That extracts cleanly and is the same in all three. So the layering is:

- `modules/shared/profile/derive-profile.js.njk` — **new**. Takes the stored and incoming profile bags
  plus the palette; merges them internally and returns **only the three derived keys** —
  `name`, `avatar_color` (D7) and `picture`. Three args, no contact id. It returns the derived keys
  rather than the merged bag so stage 2 can merge them onto stage 1's result without reverting a
  concurrent writer's fields (D2).
- `modules/shared/contact/write-profile.yaml` — uses it, then writes, re-reads and denorms. It gains
  one required `_ref` var, `avatar_colors` (the palette), which every splice site must now pass.
- `contacts`' two APIs — use it directly, keeping their own write shapes and their own
  `request_stages.write` append.

Each seam keeps its stage 1 `$mergeObjects` and swaps stage 2's MQL `$concat` for a `$mergeObjects`
of the routine-derived keys, followed by stage 3's picture strip (D2, D7b). `write-profile` and
`update-contact` gain a read step to supply the stored bag; `create-contact` does not need one,
because its insert only runs when no contact matched.

`write-profile`'s read step is named **`read_profile_contact`**, not `read_contact`. Routine steps
share one flat namespace across splices, and `create-or-link-contact.yaml:83` already defines a
`read_contact` — `user-admin/api/invite.yaml` splices both fragments into the same routine
(create-or-link at `:76`, write-profile at `:108`). There is no duplicate-step-id validation in the
build (`validateEndpoint.js` checks only cron uniqueness), so a collision would shadow silently:
today's ordering is correct only by coincidence, because both steps resolve the same contact `_id`.
`update-contact` has no sibling fragment and keeps the plain `read_contact`.

### D6 — every payload-derived value in these stages gets `$literal`

All three seams inject payload values directly into an aggregation-pipeline update. In expression
context a string beginning with `$` is a field path, not a literal, so a `given_name` of `$email`
stores the contact's email address instead of the name.

The rule is stated over the stage rather than field by field, so a field added later inherits it:
**anything in these pipeline stages that originates in the payload — or is derived from it — is wrapped
in `$literal`.** That covers, today:

| Site                                                     | Value                                                |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `write-profile.yaml:42-48`                               | the merged `profile` object                          |
| `create-contact.yaml:52-57`, `update-contact.yaml:28-33` | the merged `profile` object                          |
| `create-contact.yaml:39-43`                              | `email`, and `lowercase_email` derived from it       |
| `create-contact.yaml:58-63`, `update-contact.yaml:34-39` | the `global_attributes` merge                        |
| stage 2, all three seams                                 | the derived-keys object from `derive-profile.js.njk` |

Stage 1 keeps injecting the payload bags (D2), so it needs the wrapper exactly as today. Stage 2's
derived scalars need it too, being payload-derived strings: a `given_name` of `$email` makes the derived
`name` begin with `$`.

The sibling fields are not a lesser case. `global_attributes` is arbitrary consumer-supplied data, so a
`$`-prefixed value in it is unremarkable; and `$` is legal in an email local-part under RFC 5322, so
`$profile@example.com` is a deliverable address that would write the profile bag into `email`. Closing
all of it costs nothing beyond writing `$literal`, and is done here rather than left as a separate
finding because every line it touches is being rewritten anyway.

### D7 — Colour selection joins the derivation: random once, then stored

Colour selection moves into `derive-profile.js.njk`, which resolves the gradient as
`incoming.avatar_color ?? stored.avatar_color ?? randomPick(palette)` and **persists the result**. The
requirement for the initial colour is only a roughly uniform spread across the palette, and one
random draw satisfies that; stability afterwards comes from having stored it.

This makes the two current divergences impossible rather than merely fixed —
`avatar-picker-seed.yaml`'s index 0 for every onboarded user, and `contacts`' independent
random-on-init in two files — because one expression in one file owns the choice for every seam.

**Not a hash of the contact `_id`.** A hash was the other way to get the same spread, and would let the
colour go unstored, since it is reproducible from the id. It was rejected for what that costs: `_id`
would have to be threaded to the derivation at all three seams _and_ into `avatar-picker.yaml`, and the
picker's two consumers would each pass it — a lot of plumbing to avoid storing one field. A UUID hash
and a random draw are equally uniform, so the machinery buys distribution nothing.

`profile.avatar_color` therefore means "the gradient for this contact", chosen or defaulted, rather
than "the user picked this". That loses no information anything uses: the field has exactly two
consumers, both client-side — `avatar-picker.yaml` writes it and the generator reads it — and nothing
else in the repo reads it.

`avatar-picker-seed.yaml` survives, with its `index: 0` replaced by a random palette entry. The picker
still needs a seeded value in state rather than letting the derivation draw: its preview re-evaluates
on every keystroke in the name fields, and an unseeded draw would re-roll the gradient each time. Its
"Change colour" button still writes an explicit `profile.avatar_color`, which the derivation honours
ahead of both the stored value and a fresh draw.

**Accepted cost — a palette change does not migrate.** Because a resolved `{from, to}` pair is stored,
a consumer who later changes the `avatar_colors` var leaves existing contacts on their old colours
permanently; only contacts with no stored pair pick from the new palette. Clearing
`profile.avatar_color` in a migration is the escape hatch. The hash alternative would have recoloured
each contact on its next write, which is the one thing it was better at, and no consumer is paying for
it today. Either way the rendered avatar is a stored SVG (D1), so nothing recolours until it is
rewritten — `docs/shared/avatar-colors.md`'s "same gradient on every page" is a stability guarantee,
which storage keeps, not a claim about read-time resolution.

The palette is a module var (`avatar_colors`), declared already in all three modules
(`user-account/module.lowdefy.yaml:32`, `user-admin/module.lowdefy.yaml:188`,
`contacts/module.lowdefy.yaml:103`), so the value exists and only has to be threaded to the derivation.

For `write-profile.yaml` that means a new **required `_ref` var**, not a `_module.var` read inside
`shared/`. The file's header states it is var-free precisely so it resolves in any consumer, and a
fragment spliced into three different modules' routines should not reach for the host's vars. (The rule
is not uniform across `shared/` today — `avatar-picker.yaml:78` reads `_module.var: avatar_colors`
directly — but that is a block fragment resolved in one module's page tree, not a routine fragment
shared across three.) `contacts`' two APIs read `_module.var: avatar_colors` directly, as they already
do for `request_stages.write`.

### D7a — the colour picker keeps no cursor

`avatar-picker.yaml`'s Change-colour button does not read the gradient it is changing. It bumps a
separate page-state integer, `avatar_color_index` (`:67-83`), then resolves that index against the
palette and writes the result to `profile.avatar_color` (`:84-92`). Two keys must agree, and they are
seeded in two different places — `avatar-picker-seed.yaml` sets the colour, while both host pages set
`avatar_color_index: 0` inline (`onboarding.yaml:30`, `modal_profile.yaml:27`). With D7's random
seed they disagree from the first render: the preview shows a random entry while the cursor reads 0, so
the first click jumps to entry 1 — a visible backwards jump, and nothing warns, because
`validateStateReferences.js` catches an unwritten key rather than two keys that simply disagree.

The cursor is deleted. `profile.avatar_color` becomes the only state the button reads: one SetState
whose `_js` finds the current `{from, to}` pair's index in the palette and returns the next entry,
wrapping at the end. Both host pages drop their `avatar_color_index` seeding.

This is a case where `_js` beats operator chaining: the palette's `from` values are not unique
(`#c62828` at indexes 0 and 15, `#6a1b9a` at 2 and 17, and five more pairs), so recovering the position
means matching both fields. One state key that cannot desync is worth more than keeping the lookup in
plain operators.

### D7b — an unnamed profile gets no picture and a null name

`user-admin/api/invite.yaml` takes `profile?` as optional (`:22`) — an operator can invite by email
alone — and splices `write-profile` at `:108` with `profile: {_payload: profile}`. So the derivation
must handle an empty bag, and this is the one case where today's behaviour is worth preserving rather
than replacing.

**`picture` is left unset when both `given_name` and `family_name` are empty after trimming.** The
generator's current fallback is `?` initials (`generate-avatar-svg.js.njk:9`), which in a gradient
circle reads as a deliberate identity. An invitee who has not onboarded has no identity to show yet, and
`user-avatar.yaml:15` already renders the Avatar block's `AiOutlineUser` icon when `src` is empty — the
honest signal. Once they onboard and supply a name, the seam derives a real avatar on that write.

**The strip happens in the seam, not in the derivation**, because the picker's live preview reads
`picture` off the same call (D8) and wants the opposite. On `onboarding.yaml` both name fields start
empty — the page seeds `profile: {_user: profile}`, which carries no names for an email-signup user —
so a derivation that omitted the key would leave the preview an empty circle, and "Change colour"
would appear to do nothing, since the gradient is only visible through the SVG. So the derivation
always returns a `picture`, keeping the `?` fallback for the preview, and each seam adds one MQL stage
that removes it when the derived `name` is null:

```yaml
- $set:
    profile.picture:
      $cond:
        if:
          $eq:
            - $ifNull: ["$profile.name", null]
            - null
        then: "$$REMOVE"
        else: "$profile.picture"
```

One extra stage per seam, no second `_js` evaluation, and the "unnamed profiles carry no picture"
policy sits at the write seam that owns the stored value — where D1 argues this class of decision
belongs.

**`name` is `null`, not `" "`.** Today's MQL `$concat` returns null when either input is null, so an
unnamed profile stores a null name. A JavaScript derivation that concatenates two empty strings would
store a single space instead — truthy, so it renders as blank text at every name display rather than
letting a fallback show. The derivation must return null for this case explicitly.

`avatar_color` is still drawn and stored for an unnamed profile. It costs nothing and means the colour is
fixed from the invite onward, so the avatar does not change colour when the invitee finally supplies a
name.

### D8 — One `_js` implementation, via the `args` form

The completed [`avatar-svg-js`](../../../_completed/avatar-svg-js/design.md) design removed server-side
generation (its Decisions 1 and 2) because at the time it meant five copies of a ~30-line nested
`_nunjucks` template across five API files. That premise no longer holds, in both halves.

`_js` accepts an object form, `{ fn, args }`, where `args` are resolved by the operator parser
**before** the function runs. A body that reads only `args` never calls `state()` or `step()`, so it
is context-independent: the same file works client-side and server-side, and only the `args:`
bindings differ. Verified in the installed packages:

- `build/dist/build/buildJs/jsMapParser.js` hashes `fn` and passes `args` through untouched.
- `build/dist/build/buildJs/writeJs.js` emits both `clientJsMap.js` and `serverJsMap.js`; the server
  prototype is `{ args, item, lowdefyApp, payload, secret, state, step, user }`.
- `build/dist/build/buildJs/generateJsFile.js` emits plain arrow functions — no `vm`, no sandbox — so
  `encodeURIComponent` is available server-side.

So server-side generation now means one shared file plus a small `args:` block per caller. The
completed design's Decision 3 — shared via a text template, no deeply nested `_nunjucks` — is
preserved exactly; only its Decision 1 is reversed, on a premise that has since changed.

Two consequences. The file loses its `prefix` var — `prefix` exists only to build the
`state('<prefix>.given_name')` string that the `args` form removes — but it **keeps the double
`.js.njk` extension**, because that extension is what makes `_ref` yield source text at all.
`getRefContent.js:35-39` branches on the extension before any content parsing: a path ending `.js`
goes to `getUserJavascriptFunction`, which does a dynamic `import()` and returns the module's default
export — a function object, resolved relative to the app's config dir, not the referencing file. That
is the ref-resolver hook, not a text loader, and `_js` would reject the result. With `.njk`,
`parseRefContent.js:54-67` renders nunjucks (a no-op with no vars) and then reads the _sub_-extension
`js`, which is neither `yaml`/`yml` nor `json`, so the content stays a string. The file carries a
one-line comment saying the `.njk` suffix is load-bearing for exactly this reason, since with no vars
left it otherwise reads as vestigial.

And it returns an object of derived keys rather than a bare URI, so the picker's preview binds
`src` through `_get … key: picture` against the same call. One implementation, two call shapes.

### D9 — `contacts`' forms drop the avatar preview

`modules/shared/profile/avatar-preview.yaml` is a display-only Avatar block. Its only consumer is
`contacts/components/form_profile.yaml:8`, which `new.yaml:54` and `edit.yaml:96` both `_ref`. Neither
page has a picker — `avatar-picker.yaml`, the fragment carrying the "Change colour" button, is used
only by `user-account`'s onboarding page and profile modal. So on both `contacts` forms the preview is
a 100px circle the author cannot influence: `?` on a random gradient until both name fields are
filled, then initials on that same random gradient. On `edit.yaml` it is also now redundant with the
page-title avatar, which renders the same person from the stored `picture` a few pixels above it. (The
`contacts` changelog records an earlier round of the same duplication being removed from `new.yaml`.)

Both forms drop it and `avatar-preview.yaml` is deleted. Two things follow:

- Nothing on the create path needs to anticipate the colour the write will choose, so no form has to
  know the contact `_id` before the write. That leaves D10 free to take the id away from the client
  entirely.
- The create form gives no preview of the avatar the contact will get. Acceptable: it was never
  influenceable, and the stored picture is visible on the contact's pages immediately after save.

### D10 — `create-contact` mints the contact id server-side

Not an avatar concern, but it is closed here because the same stages are being rewritten and the
alternative is shipping a known write-authorization gap.

`create-contact`'s `insert` step upserts on `filter: {_id: {_payload: _id}}` with `upsert: true`
(`:17-30`), while its `skip` fires only when `check-existing` matched — and `check-existing` queries
`lowercase_email` (`:4-15`). So a payload carrying a **known** `_id` with a **novel** email walks past
the guard, the upsert filter matches that existing document, and the `$set` overwrites its `email`,
`lowercase_email`, `profile` and `global_attributes`. Only `_id` and `created` survive, via their
`$ifNull` preserves. Contact ids appear in detail and edit page URLs, so a target is obtained by
observation rather than guessing.

The filter takes a server-minted id instead: `{_id: {_uuid: true}}`, which `_uuid` supports server-side
(`build/plugins/operators/server.js:11,40`). The filter can then never match an existing row, so the
step always inserts and the payload's `_id` is never read. This removes the capability rather than
guarding one route through it.

Nothing downstream depends on the client's id. Both callers already read the authoritative value from
the response — `contact-selector.yaml.njk:230` and `new.yaml:128` both use
`_actions: create_contact.response.response.contactId`, which `:147-159` resolves from
`insert.upsertedId` or the matched contact. Retry safety is unaffected: it comes from `check-existing`'s
email match, not from the upsert, so a retried create still converges on one contact rather than
duplicating.

Three cleanups follow, all in code this design already touches: `new.yaml`'s inline
`_id: {_uuid: true}` (`:106-107`) and `contact-selector`'s `generate_id` SetState (`:157-165`) are
deleted, and the `$ifNull` preserves on `_id` and `created` (`:35-38`, `:46-51`) become dead once the
step can only insert.

`contact-selector`'s `appendContact` call needs no change, despite the state bag it passes no longer
carrying an `_id`. The block builds its row as `{contact_id, name, email, verified}` from the separate
`contactId` **arg** plus `contact.profile.given_name` / `.family_name` / `contact.email`, and never
reads `contact._id`
(`plugins/modules-mongodb-plugins/src/blocks/ContactSelector/hooks/contactActions/appendContact.js:34-41`).
The same contract means dropping client-side picture generation costs the picker's list nothing — the
row never rendered `profile.picture` either.

The upsert-matching path is also what produced the null-redirect bug the `contacts` changelog records:
`insert.upsertedId` is populated only on a real insert, so a matched upsert returned a null
`contactId`. That failure mode goes with it.

## Breaking changes

1. **A payload's `profile.picture` is ignored.** Every seam recomputes it. Any consumer posting a
   picture directly is silently overridden — correct, but a behaviour change.
2. **Colour assignment changes for existing users with no stored `avatar_color`.** They move from grey
   (the generator's fallback) or index 0 to a random palette entry, which is then stored and stays put.
   This happens **on their next write through a seam, not at upgrade time** — `picture` is stored, so
   nothing recolours until it is rewritten. Users with a stored colour are unaffected, including those
   whose stored colour is onboarding's index-0 red: they keep it. Clearing `profile.avatar_color` in a
   migration is what would redistribute them (D7).
3. **`create-contact` ignores a payload's `_id`.** The contact id is minted server-side (D10). A
   consumer that posted an `_id` and assumed the created contact would carry it must read `contactId`
   off the response instead — which both in-repo callers already do. This is the security fix, so the
   old behaviour is not preserved behind a flag.

`request_stages.write` is unaffected: the caller's stages still come after the derived `$set`, so a
consumer stage that overrides `profile.name` or `profile.picture` still wins — which is what D4's
re-read guarantee depends on.

Note for `docs/user-account/how-to/migration.md` and `docs/contacts/index.md`, plus a changeset for
each of `user-account`, `user-admin` and `contacts`. All three are pre-1.0, so these are minors.
(`modules/shared/` is not a published package — there is no `package.json` — so it gets no changeset;
its changes ride in the three consuming packages'.)

## Files changed

**Shared**

- `modules/shared/profile/derive-profile.js.njk` — **new**; merge, derive `name`, resolve the gradient
  (incoming `avatar_color`, else stored, else a random palette draw — persisted, D7), derive `picture`.
  Args: `stored`, `incoming`, `palette`. Returns exactly `{name, picture, avatar_color}` — the derived
  keys only, never the merged bag (D2). Returns `name: null` for a profile with no `given_name` and no
  `family_name`, and keeps the `?` initials fallback for `picture`, which the seams strip in stage 3
  (D7b). The initials branches and the SVG are a verbatim port of the file it supersedes.
- `modules/shared/profile/generate-avatar-svg.js.njk` — **delete**; superseded, and its `prefix`
  var no longer has a purpose (D8).
- `modules/shared/profile/avatar-picker-seed.yaml` — **kept**; replace the unconditional `index: 0`
  (`:15-19`) with a random palette entry (D7). Its skip guard, which seeds only when
  `profile.avatar_color` is absent, is unchanged.
- `modules/shared/profile/avatar-picker.yaml` — its preview binds `derive-profile.js.njk` through
  `_get`. No new vars: the seed supplies `profile.avatar_color` before the preview reads it (D7).
  Replace the two-action `cycle_avatar_color_index` / `set_avatar_color` pair (`:67-92`) with one
  SetState that advances `profile.avatar_color` directly, and drop the `avatar_color_index` note from
  its header comment (D7a).
- `modules/shared/profile/avatar-preview.yaml` — **delete** (D9); `contacts`' forms were its only
  consumer.
- `modules/shared/contact/write-profile.yaml` — read-first restructure (D2): add
  `read_profile_contact`; keep stage 1's atomic `$mergeObjects` (its payload bag now
  `$literal`-wrapped), replace stage 2's `$concat` with a `$mergeObjects` of the one
  `derive-profile.js.njk` call's keys, and add stage 3's `picture` strip (D7b); keep
  `reread_contact`, the caller's `write_stages` last, and the guarded denorm. Adds a required
  `avatar_colors` `_ref` var to its header var block; notes that `read_contact` is taken by the
  sibling `create-or-link-contact` fragment.

**write-profile splice sites** — all three must pass the new `avatar_colors` var:

- `modules/user-account/api/update-profile.yaml:30-44`
- `modules/user-admin/api/update-profile.yaml:14-26`
- `modules/user-admin/api/invite.yaml:108-119`

**contacts**

- `modules/contacts/api/create-contact.yaml` — derive through the shared fragment; keep the
  insert-only fields, the `check-existing` guard and stage 1 as-is. **No read step is needed here**:
  `insert` is skipped whenever `check-existing` matched (`:19-22`), so it only ever runs for a
  genuinely new contact and the stored bag is always empty. The derivation runs against the payload
  alone, with `stored: {}`. Stage 2's `$concat` becomes the `$mergeObjects` of the derived keys, plus
  stage 3's `picture` strip. `$literal`-wrap
  `email`, `lowercase_email`, `global_attributes` and the profile bag (D6). Separately
  (D10): the filter becomes `{_id: {_uuid: true}}` so the step can only insert, and the now-unreachable
  `$ifNull` preserves on `_id` (`:35-38`) and `created` (`:46-51`) are dropped.
- `modules/contacts/api/update-contact.yaml` — add `read_contact`, querying on `_id` alone (the
  `apps.<slug>.is_user` clause stays on the write, where it decides whether the row is written at all);
  keep stage 1's `$mergeObjects` for `profile` and `global_attributes` (both `$literal`-wrapped, D6),
  replace stage 2's `$concat` with the derived keys and add stage 3's `picture` strip. Keep the
  `apps.<slug>.is_user` filter clause.
- `modules/contacts/components/form_profile.yaml` — drop the `avatar-preview.yaml` `_ref` at `:8` and
  its comment (D9). This is the only change either `contacts` form needs for the avatar to disappear.
- `modules/contacts/pages/new.yaml` — delete `generate_avatar` and the random `profile.avatar_color`
  init (`:33-43`); delete the payload's inline `_id: {_uuid: true}` (`:106-107`), now server-minted
  (D10). The post-create redirect already reads `contactId` off the response (`:128`) and is unchanged.
- `modules/contacts/pages/edit.yaml` — delete `generate_avatar`. Keeps its page-title avatar, which is
  what renders the contact after D9.
- `modules/contacts/components/contact-selector.yaml.njk` — delete `pick_avatar_color` and the inline
  picture generation; delete the `generate_id` SetState (`:157-165`, D10). `appendContact` (`:221-230`)
  is left as-is — the block reads the id from the separate `contactId` arg, never from the `contact`
  bag (D10).

**user-account / user-admin**

- `modules/user-account/pages/onboarding.yaml` — drop the inline `avatar_color_index` seeding
  (`:30`, D7a). Its `avatar-picker-seed` and picker refs are unchanged — the seed file changes, not
  the call site.
- `modules/user-account/components/view/modal_profile.yaml` — same (`:27`).
- `modules/user-account/components/user-avatar.yaml` — the comment at `:12-14` claims the icon fallback
  "rarely fires" because every user has a stored SVG. That stays false after this change, for a
  different reason: D7b leaves `picture` unset for a profile with no name, so the fallback is what
  renders for an invitee who has not onboarded. Rewrite it to say that, rather than to assert the claim.
  The `icon: AiOutlineUser` behaviour itself is unchanged.
- `modules/user-admin/components/view/modal_profile.yaml` — no config change; gains a correct avatar
  because the seam now derives one. Worth a verification note, not an edit.

**Docs**

- `docs/shared/avatar-colors.md` — **rewrite the "How modules pick a color" section** (`:31`). Its
  "hash of the user id … modulo the palette length" no longer describes the behaviour and never did;
  replace it with: the write seam draws one random palette entry when the profile has no
  `avatar_color`, stores it, and honours an explicit pick ahead of it. Keep the guarantee it is really
  making — same person, same colours everywhere — and add that a palette change does **not** migrate
  existing contacts, because both the colour and the rendered `picture` are stored (D7).
- `docs/user-account/concepts/write-pathways.md` — `:42-43` describes the fragment as pairing "two
  writes in one routine" and `:65` enumerates the `_ref` vars each caller passes. Both are now wrong:
  four DB operations, and the new `avatar_colors` var.
- `docs/user-account/how-to/migration.md`, `docs/contacts/index.md` — the breaking-change notes above,
  including that `create-contact` now mints the `_id` and a payload's is ignored (D10).
- Changesets for `user-account`, `user-admin`, `contacts`.

**Demo**

- `apps/demo/pages/user-components-demo.yaml` already exercises `user-avatar`; confirm it renders a
  generated picture rather than the icon fallback once a demo contact is saved through the new seam.

## Verification

`pnpm ldf:b` proves the config compiles and that the `_js` bodies land in `serverJsMap.js`. It cannot
prove the derivation runs, because that needs a real write against a real database. The end-to-end
check — save a profile through each of the four write paths and confirm `user-contacts.profile.picture`,
`users.profile.picture` and `users.image` all carry the same fresh URI — is a `/r:dev-test` step.

Three things specifically worth testing, because they are the cases that are broken today: renaming a
user through user-admin's modal (no picker) should update the initials; an invited user should have an
avatar before their first login; and `create-contact` should ignore a payload `_id` — post a known
contact's `_id` with a fresh email and confirm a new contact is created and the named one is untouched
(D10). The last needs a real request, so it belongs in the same `/r:dev-test` pass.

Also worth confirming under D10 that both create paths still land on the right record, since they now
depend entirely on the returned `contactId`: `new.yaml`'s post-create redirect, and
`contact-selector`'s `appendContact`.

## Non-goals

- **Photo upload.** D1 explains why the seam is the right home for it. Nothing is built here.
- **The picker's aesthetics.** Already done — F9 in
  [`../_completed/05-ui-rework/findings.md`](../05-ui-rework/findings.md), which shipped the
  labelled 64px row this design's D7a rewires. F9 deliberately left the write-path half to this design.
- **Where the avatar renders in the shared page header.** It pairs with this one (a header avatar needs
  a stored picture to show) but it is a separate call about the shared page-title contract: whether the
  shared component renders the signed-in user's avatar itself, or exposes a slot pages opt into.
- **Folding contacts' writes into `write-profile.yaml`.** D5 explains why only the derivation is
  shared. If the two write shapes converge later, the fragment is the place to revisit.
- **A wider write-authorization audit.** D10 closes the one gap in the stages this design rewrites. It
  does not review whether `update-contact`, which necessarily operates on a client-supplied `_id`, is
  adequately authorized — that is a separate question about endpoint permissions, not about how the
  create path mints ids.

## Related

- **F14** — the originating finding, retired from `../04-planning/findings.md` when this design was
  written, because this design is its resolution. Its "no generator anywhere" claim was already stale;
  Current state carries the correction.
- [`designs/_completed/avatar-svg-js/design.md`](../../../_completed/avatar-svg-js/design.md) — D8
  reverses its Decision 1 and explains why the premise changed.
- [`../_completed/table-row-contract/design.md`](../table-row-contract/design.md) — D2 there strips
  `profile.picture` from the wire row in favour of the top-level `picture` alias. This design
  strengthens that: once the write recomputes `picture`, a payload's copy is ignored entirely, so the
  `$mergeObjects` round-trip argument stops being load-bearing.
- [`designs/user-account-better-auth/design.md`](../user-account-better-auth/design.md) —
  Decisions 6 and 8 define the write-profile fragment and the denorm this design restructures.

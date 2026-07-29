# Review 1

The core argument holds up: `picture` has the same inputs as `profile.name`, `name`
is already server-derived at all three seams, and the asymmetry is the defect. D8's
three claims about the installed packages are all correct — I verified
`jsMapParser.js` passes `args` through untouched, `writeJs.js` emits the server
prototype `{ args, item, lowdefyApp, payload, secret, state, step, user }`, and
`generateJsFile.js` emits plain arrow functions with no sandbox. Runtime arg
resolution also checks out: `serverParser.js` parses with a `serializer.copy`
reviver, which is depth-first, so nested operators inside `args:` are evaluated
before `_js` is called. The line references in Current state are accurate.

The findings below are mostly about the mechanics of getting there.

## Blocking

### 1. `_ref` on a `.js` path imports a module — it does not return source text

> **Resolved (auto).** Verified in the installed build: `getRefContent.js:35-39` routes a `.js` path
> to `getUserJavascriptFunction` (dynamic `import()`, returns the default export), while
> `parseRefContent.js:54-67` renders `.njk` then reads the sub-extension, leaving `js` content as a
> string. The file keeps the double extension — `derive-profile.js.njk` — renamed throughout D5, D7,
> D8 and Files changed. D8 now records why the `.njk` suffix is load-bearing and calls for the
> in-file comment saying so.

D8 and Files changed both specify `modules/shared/profile/derive-profile.js` as
"a plain `.js` text file". That will not build.

`getRefContent.js` branches on the extension before any content parsing:

```js
} else if (type.isString(refDef.path) && getFileExtension(refDef.path) === 'js') {
    return getUserJavascriptFunction({ context, filePath: refDef.path });
}
```

`getUserJavascriptFunction` does a dynamic `import()` and returns
`(await import(fileUrl.href)).default` — a JS function object, resolved relative to
`context.directories.config` (the app's config dir), not relative to the referencing
file. It is the ref-resolver/transformer hook, not a text loader. So
`_js: { fn: { _ref: { path: ../shared/profile/derive-profile.js } } }` would hand
`_js` a function object, and `jsMapParser.js` would throw
`_js operator expects a JavaScript string or { fn: string, args?: object }`.

The reason `generate-avatar-svg.js.njk` works today is the `.njk` extension, not the
`prefix` var: `parseRefContent.js` renders nunjucks, then takes
`getFileSubExtension` (`js`), which is neither `yaml`/`yml` nor `json`, so `content`
stays a **string**. Any extension outside `{js, yaml, yml, json, njk}` returns raw
text the same way.

**Fix:** keep the double extension — `derive-profile.js.njk`, `_ref`'d with no vars.
D8's substantive point (the `prefix` var is no longer needed) survives; only the
rename is wrong. Worth a one-line comment in the file saying the `.njk` suffix is
what makes `_ref` yield text, since with no vars left it otherwise looks vestigial
and someone will "clean it up".

### 2. `write-profile.yaml`'s var list is not unchanged — it needs the palette, and three splice sites need updating

> **Resolved (auto).** The contradiction is removed: D5 and Files changed now state that
> `write-profile.yaml` gains one required `avatar_colors` `_ref` var, and Files changed lists all
> three splice sites (`user-account/api/update-profile.yaml:30-44`,
> `user-admin/api/update-profile.yaml:14-26`, `user-admin/api/invite.yaml:108-119`) as needing to
> pass it. D7 now argues the `_ref`-var choice explicitly and notes `avatar-picker.yaml:78` as the
> non-uniform case — a block fragment in one module's page tree, not a routine fragment shared across
> three.

D5 says "Its var list is unchanged" and Files changed repeats "Var list unchanged".
But D7 says "The palette is a module var (`avatar_colors`), so each seam passes it as
an argument", and `write-profile.yaml:10-11` is explicit that it is a var-free file
where "every input is an `_ref` var (NEVER `_module.var`)". Those cannot all be true:
the fragment gains a required `avatar_colors` (or `palette`) `_ref` var, its header
var block needs the entry, and **every** splice site has to pass it.

Files changed lists none of the three splice sites:

- `modules/user-account/api/update-profile.yaml:30-44`
- `modules/user-admin/api/update-profile.yaml:14-26`
- `modules/user-admin/api/invite.yaml:108-119`

All three modules already declare an `avatar_colors` var
(`user-account/module.lowdefy.yaml:32`, `user-admin/module.lowdefy.yaml:170`,
`contacts/module.lowdefy.yaml:103`), so the value exists — it just has to be threaded.

Note the alternative: `modules/shared/profile/avatar-picker.yaml` already reads
`_module.var: avatar_colors` directly from inside `modules/shared/`, so the "var-free"
rule is not uniform across `shared/` today. Passing an `_ref` var is still the right
call for a fragment spliced into three routines, but the design should say so rather
than assert the var list doesn't change.

### 3. `read_contact` collides with an existing step id in the invite routine

> **Resolved (auto).** Confirmed: `create-or-link-contact.yaml:83` defines `read_contact`, and
> `invite.yaml` splices create-or-link (`:76`) and write-profile (`:108`) into one routine.
> `write-profile`'s read step is named `read_profile_contact` in D2's step list, D5 and Files changed,
> with D5 recording the collision and the absent build validation. `update-contact` has no sibling
> fragment and keeps the plain `read_contact`.

D5 and Files changed add a `read_contact` step to `write-profile.yaml`.
`modules/shared/contact/create-or-link-contact.yaml:80` **already** defines a step
called `read_contact`, and `modules/user-admin/api/invite.yaml` splices both fragments
into the same routine — create-or-link at `:80`, write-profile at `:108`. Routine
steps share one flat namespace (`user-admin/api/update-profile.yaml:12-13` notes
`runRoutine` recurses into the spliced array), and I found no duplicate-step-id
validation in the build — `validateEndpoint.js` only checks cron uniqueness.

Today's ordering happens to be benign: `find_user` (`invite.yaml:82`) reads
`_step: read_contact._id` before write-profile runs, and `invite_member` reads the same
`_id` afterwards from the shadowing step — the same contact, so the same `_id`. It is
correct by coincidence, silently, with no build error to catch a reorder.

**Fix:** name write-profile's step distinctly — `read_profile_contact` — and say in the
fragment header that `read_contact` is taken by the sibling fragment.

### 4. The new-contact page cannot compute the hashed colour, so its preview will disagree with what's written

> **Resolved**, but not by the proposed fix. The finding is correct — `new.yaml` mints `_id` inside the
> CallAPI payload (`:105-106`) and never holds one in state, so a client-side hash is impossible there.
> Minting it into state was rejected: it would make the design depend on the client knowing the contact
> `_id` before the write, hardening a pre-existing weak spot rather than avoiding it.
>
> Instead the preview goes away (new **D9**). Screenshotted both pages: the preview is display-only —
> `avatar-picker.yaml`, which carries the "Change colour" button, is used only by `user-account`, so on
> `contacts`' two forms it renders a 100px `?` on a random gradient the author cannot influence, and on
> `edit.yaml` it duplicates the page-title avatar a few pixels above it. `avatar-preview.yaml` is deleted
> and `form_profile.yaml:8` drops the ref; `new.yaml`'s `_id` handling is untouched.

D7's justification is that determinism makes "the picker's preview and the write agree".
On the create path it does the opposite.

`contacts/pages/new.yaml` mints the contact id **inside the CallAPI payload** —
`_id: { _uuid: true }` at `:105-106` — so no `_id` ever exists in page state. The page
does render a live preview: `components/form_profile.yaml:8` refs
`../shared/profile/avatar-preview.yaml`. With the random `profile.avatar_color` init
deleted (`new.yaml:33-43`) and the colour now hashed from `contact_id`, the client has
no id to hash, so the preview cannot reproduce the gradient the server will store.
That is exactly the preview-vs-stored drift this design exists to remove.

`contact-selector.yaml.njk:157-165` already gets this right — a `generate_id` SetState
mints `_uuid` into state before use. `pages/edit.yaml` has `_id` in state.

**Fix:** mint `_id` in `new.yaml`'s init SetState alongside the other seeds and send
`_state: _id` in the payload. Add it to Files changed.

### 5. The shared picker/preview fragments have no input for the contact id

> **Rejected — premise removed.** The finding held only while the colour came from a hash of the
> contact id. Two changes dissolved it: D9 deletes `avatar-preview.yaml`, removing two of the four call
> sites in the table, and D7 replaced the hash with a random draw, so no fragment needs a contact id at
> all. `avatar-picker.yaml` gains no vars — `avatar-picker-seed.yaml` seeds `profile.avatar_color`
> before the preview reads it, exactly as it does today.
>
> (A `contact_id` `_ref` var was chosen for the picker while the hash was still in place; that decision
> is void along with the hash.)

D8 says "only the `args:` bindings differ", but `avatar-picker.yaml` and
`avatar-preview.yaml` are themselves shared `_ref` fragments with hardcoded state
paths, and the id they now need lives somewhere different in every consumer:

| Consumer                                | Contact id available as    |
| --------------------------------------- | -------------------------- |
| `contacts/pages/new.yaml` (via preview) | `_state: _id` (see #4)     |
| `contacts/pages/edit.yaml`              | `_state: _id`              |
| `user-account/pages/onboarding.yaml`    | `_user: profile.contactId` |
| `user-account/.../modal_profile.yaml`   | `_user: profile.contactId` |

So both fragments need a new `contact_id` `_ref` var, and all four call sites need to
pass it. Files changed says only "preview binds `derive-profile.js` through `_get`" —
the var and the four bindings are missing.

### 6. Read-then-replace drops the atomic merge

> **Resolved.** Adopted the narrower shape. D2 now keeps stage 1's atomic `$mergeObjects` in MQL and
> replaces only stage 2's `$concat` with a `$set` of the three routine-derived scalars — same
> round-trip count, same single derivation site, non-derived fields (and `update-contact`'s
> `global_attributes`) keep their atomicity. The cited invite-vs-signup-hook window does not actually
> exist: the signup hook only splices `create-or-link-contact.yaml`, whose write is `$setOnInsert`-only
> and never touches `profile`. The real window is two form saves against the same person (user-admin
> operator edit vs user-account self-edit vs a `contacts` edit-page save), and D2 records that concrete
> lost-update scenario as the reason the merge stays in MQL. The residual — the three derived scalars
> computed from the read snapshot can briefly reflect an older name — is stated as an accepted
> trade-off. Consequence: Breaking change 3 was false under either shape (the caller's `write_stages`
> have always come last) and is replaced with a note that `request_stages.write` is unaffected.

Today every seam merges inside the update — `$mergeObjects: [{$ifNull: ["$profile", {}]}, <payload>]`
— which is atomic per document. D2's shape reads the stored bag in step 1, merges it in
the routine, and writes `$set: profile: {$literal: <derived bag>}`, i.e. a whole-document
read-modify-write across two round trips. Two concurrent profile writes to the same
contact now lose the earlier one's fields instead of merging them.

The invite flow is the concrete window: `invite.yaml` runs create-or-link → `find_user`
→ write-profile against a contact that a signup hook can be touching at the same time
(that race is real enough that create-or-link has a duplicate-key `:catch` for it at
`:33-79`).

The design should either accept this explicitly as a trade-off, or consider the narrower
shape it doesn't currently weigh: keep stage 1's atomic `$mergeObjects` of the incoming
bag, and `$set` only the three derived scalars (`profile.name`, `profile.picture`,
`profile.avatar_color`) from the routine. Same single derivation site, same round-trip
count, and non-derived fields keep their atomic merge. Either way it belongs in D2 —
right now the atomicity change isn't mentioned at all.

## Half-fixes and consistency

### 7. D6 wraps `profile` in `$literal` but leaves the identical bug on three sibling fields

D6 is correct that a payload string beginning with `$` is read as a field path. But the
same rewritten stages inject other payload values into expression context:

- `create-contact.yaml:39-43` — `email: {_payload: email}` and
  `lowercase_email: {_string.toLowerCase: {_payload: email}}`
- `create-contact.yaml:58-63` and `update-contact.yaml:34-39` — `global_attributes`
  merged from `_payload: global_attributes`

An email of `$profile` stores the profile bag; a `global_attributes` value of
`$lowercase_email` stores the email. D6's own argument — "every line it touches is being
rewritten anyway" — applies verbatim. Wrap all of them, or say why `profile` alone.

### 8. Dropping the `avatar_color_index` seed leaves the cursor unbacked and out of sync

Files changed says onboarding and `user-account/.../modal_profile.yaml` "drop
`avatar_color_index` seeding and the `avatar-picker-seed` ref"
(`onboarding.yaml:30-31`, `modal_profile.yaml:27-28`). But `avatar-picker.yaml:74-96`
still reads `_state: avatar_color_index` for its Change-colour cursor. Two consequences:

- `validateStateReferences.js` emits a `state-refs` build warning on both pages (a
  warning, not an error — but the repo is warning-clean today).
- The cursor no longer tracks what's displayed. The gradient comes from a hash of the
  contact id (say index 4); the cursor starts absent, so `_sum: [null, 1]` → the first
  click jumps to index 1, which can look like a no-op or a backwards jump.

**Fix:** either seed the cursor from the derived colour's palette position, or delete the
cursor and derive the next gradient from `profile.avatar_color`'s index in the palette —
one state key fewer, and it can't desync.

### 9. Two internal contradictions

> **Resolved (auto).** Proposed change 5 reworded — the generator file is superseded, and the picker
> and preview rebind to the new derivation fragment. Breaking changes now asks for changesets for
> `user-account`, `user-admin` and `contacts` only, noting that `modules/shared/` has no
> `package.json` and rides in the three consuming packages'.

- Proposed change 5 says "The shared `_js` file stays, used by the avatar picker for its
  live preview only", while Files changed deletes
  `modules/shared/profile/generate-avatar-svg.js.njk`. D8 makes the intent clear (the new
  file supersedes it and the picker rebinds), so item 5 is stale — reword it.
- Breaking changes calls for "a changeset for each of `user-account`, `user-admin`,
  `contacts` and `shared`". There is no `modules/shared/package.json` — `shared/` is not a
  published package, and changesets key on package names. Files changed correctly lists
  only three; fix the Breaking changes line.

### 10. Persisting the hashed colour makes it write-once, and the docs note doesn't cover it

> **Resolved**, by removing the hash rather than the persistence. The finding correctly identified that
> hashing-plus-storing is incoherent — you get to pick one. It was resolved first by dropping the
> storage, then reopened: the hash was only ever a source of uniform spread, and the requirement is
> just a roughly even initial distribution, which one random draw gives equally well. So D7 now reads
> `incoming.avatar_color ?? stored.avatar_color ?? randomPick(palette)`, persisted. That deletes the
> `contact_id` plumbing the hash needed at three seams and in the picker, and keeps
> `avatar-picker-seed.yaml` (with `index: 0` replaced by a random entry) instead of deleting it.
>
> `profile.avatar_color` consequently means "the gradient for this contact", chosen or defaulted. The
> earlier objection — that this makes a default indistinguishable from a deliberate pick — was checked
> and dropped: the field has exactly two consumers, both client-side (the picker writes it, the
> generator reads it), and nothing depends on the distinction.
>
> The finding's second point is recorded as an accepted cost, and is now stronger than it was: a
> consumer who changes the `avatar_colors` var gets no migration at all, because the stored
> `{from, to}` pair wins on every subsequent write. Clearing `profile.avatar_color` in a migration is
> the escape hatch. Breaking change 2 says the colour lands on next write rather than at upgrade, and
> the `docs/shared/avatar-colors.md` entry now calls for rewriting the "How modules pick a color"
> section outright, since its hash wording never described real behaviour.

D5 says the derivation "returns the merged bag with `name`, `avatar_color` and `picture`
set", so the hashed colour is **stored** into `profile.avatar_color`. Combined with D7's
"an explicit `avatar_color` wins", the hash then never applies again — after the first
write, the resolved colour is indistinguishable from a user's deliberate pick.

Two things follow that the design should state:

- Breaking change 2 ("their avatar colour changes once") is only true on their next write
  through a seam, not at upgrade time.
- A consumer who changes the `avatar_colors` var will see **no** change to existing
  avatars — palette resolution is now a write-time act, not a read-time one, which is the
  opposite of what `docs/shared/avatar-colors.md` currently implies with "same gradient on
  every page". The docs bullet ("add where the derivation runs and that an explicit
  `avatar_color` wins") should also say the palette applies at write time only.

If the intent is that the hash stays live, the derivation must not persist
`avatar_color` — and then the picker needs another way to mark a pick as deliberate.
Either answer is fine; the design currently implies one and argues the other.

### 11. Two docs targets are missing or unnamed

> **Resolved (auto).** `docs/user-account/concepts/write-pathways.md` added to the Docs list, naming
> both stale claims (`:36-56`'s "two writes in one routine", and the enumerated `_ref` vars). The
> `docs/contacts/` references now name `index.md`.

`docs/user-account/concepts/write-pathways.md:36-56` describes the fragment as pairing
"two writes in one routine" and enumerates the `_ref` vars each caller passes. Both
become wrong (four DB ops, plus the palette var from #2). It isn't in the docs list.

"`docs/contacts/`" should name the file — that folder is only `index.md` +
`reference/vars.md`, and `vars.md` is generated.

### 12. The cost accounting omits `update-contact`

> **Resolved (auto).** D2's cost paragraph now gives all three seams: `write-profile` three → four,
> `update-contact` one → two, `create-contact` unchanged.

D2's "four DB operations against today's three" is right for `write-profile`. It doesn't
mention that `update-contact.yaml` goes from one DB op to two — a 100% increase on the
contacts edit path, still cheap, but the design's own framing invites the number.

### 13. Unstated behaviour for an empty name

`user-admin/api/invite.yaml:108-119` passes `profile: {_payload: profile}`, and the
invite payload's profile is optional (`invite.yaml:22`). Today that derives
`profile.name` to `null` (`$concat` over missing fields) and stores no picture. After the
change the derivation produces something for a nameless profile — the current generator's
fallback is `?` initials, so an invitee with no captured name gets a `?` avatar rather
than the Avatar block's person icon. Decide and record which it should be; the derivation
returning `undefined` for `picture` on an empty name is probably the better answer, and it
matters because `user-avatar.yaml:11-14`'s fallback (which Files changed already plans to
rewrite) is what renders instead.

# Review 4

Scope: the two review follow-up tasks — `20-invite-profile-persist.md` and
`21-passkey-auth-method.md` — checked against the current module source
(`modules/user-admin/`, `modules/shared/contact/`) and design Decisions 3/5/7.

## Routine wiring

### 1. The invite routine will carry two steps with `id: read_contact`

> **Resolved.** Task 20 §1 now renames `write-profile`'s re-read step `read_contact`
> → `reread_contact` (+ its internal `denorm_user_profile` refs), so the invite
> routine keeps only `create-or-link-contact`'s `read_contact` as the canonical
> contact its later steps reference. **Correction to this finding:** the rename is
> _not_ transparent to all other callers — `user-account/api/update-profile.yaml`
> renders its audit `on.user` from `_step: read_contact` (an external reference the
> finding missed; `user-admin`'s update-profile audit reads `_payload`/`_user` and is
> unaffected). Task 20 §1 + Files now cover updating that line to `reread_contact`.

Task 20 §4 splices `write-profile.yaml` into `api/invite.yaml` after the existing
`create-or-link-contact` splice. Both fragments define a step with the same id:

- `create-or-link-contact.yaml` — `id: read_contact` (find the contact by
  `lowercase_email`).
- `write-profile.yaml` — `id: read_contact` (re-read the contact by `_id` after
  the profile write, so the re-denorm copies the derived `name`).

`update-profile.yaml` splices `write-profile` **alone**, so this collision has
never occurred before — the invite routine is the first to inline both fragments
in one step array. After the splice the routine has two `read_contact` steps, and
every later reference resolves by that id: `invite_member` (`profile.contactId:
{_step: read_contact._id}`), the `audit` step (`contact_ids: [{_step:
read_contact._id}]`), and the final `:return` (`contactId: {_step:
read_contact._id}`). Today the two reads return the same contact `_id`, so the
values happen to coincide — but the shadowing is fragile (any reorder breaks it)
and duplicate step ids in one routine are at best a smell and at worst a
build/run error.

**Fix:** rename `write-profile.yaml`'s re-read step (e.g. `reread_contact`) and
update its own internal reference (`denorm_user_profile` reads `_step:
read_contact.profile` / `.name` / `.picture`). This is safe for the other caller
— `update-profile.yaml` passes only vars into the fragment and never references
`read_contact` externally. Call this out in task 20 §1 (the same task already
touches `write-profile`) so the rename ships with the guard change.

### 2. The `write-profile` guard must treat a _missing_ `user_id` as absent, not just `null`

> **Resolved (auto).** Task 20 §1 now specifies the guard as an absence/truthiness
> test (`_if_none`, or coalesce to `null` before comparing) explicitly rejecting a
> bare `_ne: [user_id, null]`, so the no-match `undefined` and explicit-`null` cases
> both no-op. §4's parenthetical corrected from "null when no user" to "`undefined`
> when no user matches."

Task 20 §4 resolves the target user with a `MongoDBFindOne` over `users` and
passes `user_id: {_step: find_user._id}`, then §1 guards the `UpdateUserProfile`
re-denorm on "`user_id` non-null". When no user matches, `find_user` returns no
document and `{_step: find_user._id}` evaluates to `undefined`, not `null`. A
guard written as `_ne: [user_id, null]` would pass on `undefined` and fire
`UpdateUserProfile` with no `userId`. Specify the guard as an
absence/truthiness test (`_if_none` fallback, or `_ne` after coalescing to
`null`) so both the no-match (`undefined`) and explicit-`null` cases no-op.

## Acceptance criteria

### 3. Task 20's observable ("the `all` members list shows the invited person's name") is not verifiable pre-acceptance

> **Resolved (auto).** Confirmed against source: `invitations_base.yaml` joins `users`
> (inviter) but not `user-contacts`, and matches `status: pending` only, so no pre-accept
> `user-admin` UI shows the persisted name. Task 20's last acceptance criterion is replaced
> with a pre-accept-verifiable one — the `user-contacts` row carries the entered `profile`
> with `profile_created` unset — plus a note that the members list shows the name only
> after acceptance. Build-compile check kept as its own line.

The last acceptance criterion and the task rationale lean on the members list
showing the invited person's name. But an invited-not-yet-accepted person has
**no `user-members` row** — they exist only as a `user-invitations` row and
surface on the _Invitations_ tab, not the Members tab. And `invitations_base.yaml`
joins `users` (for the inviter) but **not** `user-contacts`, so the Invitations
tab renders the invitee's _email_, never the persisted contact name. So nothing in
the `user-admin` UI shows the persisted name before the invite is accepted.

The persistence is still worth doing — the real payoffs are (a) **post-accept**,
where the minted member row joins the now-populated contact and
`members_base.yaml`'s `name: $ifNull [$contact.profile.name, $user.name]` shows
the real name immediately instead of a fallback/blank until onboarding; (b) the
onboarding prefill; and (c) the immediate re-denorm when the email already maps to
a suite user. Reword the criterion to something verifiable against the persisted
state, e.g. "the `user-contacts` row carries the entered `profile` (given/family/
derived `name`/phone/job) with `profile_created` unset; **after acceptance** the
members list shows that name without waiting for onboarding." As written it can't
be checked without first accepting the invite, which is out of the module's flow.

## Design consistency

### 4. Invite-time contact write drops the `request_stages.write` extension

> **Resolved.** Chose one write seam over every contact write. Task 20 §4 now passes
> `write_stages: {_module.var: request_stages.write}` on the invite splice (matching both
> `update-profile` routines) instead of `[]`, so a consumer's denormalized fields land at
> invite-time mint, not only at first post-accept edit. Decision 8 extended to say the
> write seam covers every contact write, and that consumer write stages must tolerate a
> pre-accept invitee (a `user-contacts` row with no `user` row yet) — the same assumption
> the guarded re-denorm already makes.

Task 20 §4 splices `write-profile` with `write_stages: []`, whereas
`update-profile.yaml` passes `write_stages: {_module.var: request_stages.write}`.
A consumer that extends the contact write (e.g. denormalizing extra fields onto
`user-contacts`) via `request_stages.write` gets those stages on a profile _edit_
but **not** on the contact minted/updated at invite time — so an invited contact
is missing the consumer's denormalized fields until the first post-accept profile
edit runs them. Decision 8 does scope `request_stages.write` to "the profile
routine," so `[]` is defensible, but the divergence is now real and silent.
Decide explicitly: either pass `{_module.var: request_stages.write}` here too (one
write seam over every contact write, "one correct way"), or keep `[]` and add a
one-line note in the task/design that the invite-time write intentionally skips
the consumer write seam. Don't leave it as an unremarked `[]`.

## Task 21

### 5. Pin the passkey `$lookup` placement and the count field into the existing flat `$addFields`

> **Resolved (auto).** Task 21 §2 now pins the `$lookup` (`localField: userId`,
> `foreignField: userId`, `as: passkeys`) **before** the terminal flat `$addFields`,
> folds `passkey_count` into that same stage (so it lands before `$limit: 1`), and
> explicitly forbids appending after `$limit: 1` or adding a second `$addFields`.
> Count-vs-boolean latitude retained; the collection-name/`userId` confirmation note
> stands.

`get_user_detail.yaml` ends with a single `_build.array.concat` whose last
element is `[$addFields {…flat shape…}, {$limit: 1}]`. Task 21 §2 says to add a
`$lookup` from `user-passkeys` and an `$addFields` count "projected into the flat
detail shape" — but an implementer could append the stages _after_ `$limit: 1`
(where they still run but read oddly) or add a second competing `$addFields`.
Make the task concrete: insert the `$lookup` (`localField: userId`, `foreignField:
userId`, `as: passkeys`) **before** the terminal flat `$addFields`, and add
`passkey_count: {$size: {$ifNull: ["$passkeys", []]}}` **into that same
`$addFields`** so it lands before `$limit: 1`. The root is `user-members`, so
`userId` (the member's) is present throughout — the join key is correct. The
task's own note to confirm the adapter collection name (`user-passkeys`) and the
passkey `userId` field against the running engine stands; both match the
better-auth passkey plugin schema and the `user-`-prefixed adapter naming.

---

**No blocking issues** — tasks 20 and 21 are well-scoped fixes that correctly
diagnose the underlying gaps (silent profile drop; passkey read connection
missing from the module surface). #1 and #2 are concrete correctness fixes to fold
into task 20 before implementation; #3 corrects a criterion that can't be verified
as written; #4 is a decision to make explicit; #5 is placement precision for
task 21.

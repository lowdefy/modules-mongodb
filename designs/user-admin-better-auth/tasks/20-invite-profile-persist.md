# Task 20: Persist invite-time profile (fix)

## Context

Post-implementation design review found the invite flow captures profile fields
but silently drops them. The invite form (`invite_form.yaml`) renders a **required
`full_name`** plus phone / job title and sends them in the `invite` payload, but
`api/invite.yaml` + the shared `create-or-link-contact` fragment mint the contact
**bare** — the captured profile is discarded. A required field that is silently
dropped is the one indefensible state.

Two problems compound:

1. **Wrong capture shape.** The invite form invented a single `full_name` →
   `profile.name` TextInput. The canonical name model (Decision 3) is `given_name`
   - `family_name` (both required) with `profile.name` **derived** (`write-profile`
     recomputes `$concat(given, family)`). So a directly-typed `full_name` is
     self-clobbering: the first profile edit through `modal_profile` (which requires
     first/last) recomputes `profile.name` and wipes it. Every other name capture in
     the module and the **old** module's invite page use the shared `form_core`
     (first/last + optional honorific).
2. **Dropped write.** `create-or-link-contact` was implemented as a bare
   `$setOnInsert` upsert, dropping the **optional `profile` seed the task 2 contract
   specified**. Nothing persists the captured profile.

Resolution (design Decision 7, as revised by the review): the invite **captures the
canonical profile and persists it**, reusing `form_core` + `fields.profile` for
capture (identical to the profile edit modal) and `write-profile` for the write —
with the `UpdateUserProfile` re-denorm **guarded on the target user existing** so
the same fragment is safe before the invitee has a `user` row.

Design section: Decision 7 (invite flow) + Decision 3 (name model, write-profile
guard). Use the `lowdefy-docs` MCP for request/routine schemas.

## Task

**1. `write-profile` fragment — rename the re-read step, then guard the re-denorm on
user presence.**

_Rename first._ Task 20 §4 splices `write-profile` into `api/invite.yaml` after
`create-or-link-contact`, and both fragments end in a step `id: read_contact`, so
the invite routine would carry two — with `invite_member` / `audit` / `:return` all
resolving `_step: read_contact._id` against whichever wins (fragile, and a duplicate
id in one routine at best a smell). Rename `write-profile`'s re-read step
`read_contact` → `reread_contact` and update its two references: the internal
`denorm_user_profile` step (`_step: read_contact.profile` / `.name` / `.picture` →
`reread_contact.*`), **and** the external one in
`modules/user-account/api/update-profile.yaml` — its audit event renders
`on.user: {_step: read_contact}`, which must become `reread_contact`. (`user-admin`'s
own `update-profile.yaml` audit reads `_payload`/`_user`, not the step, so it's
unaffected; `create-or-link-contact`'s own `read_contact` is left as the canonical
contact the invite routine's later steps reference.)

_Then guard._ Wrap the `denorm_user_profile` (`UpdateUserProfile`) step so it only
runs when `user_id` is **present**. Write the guard as an absence/truthiness test, not
`_ne: [user_id, null]`: the invite flow resolves `user_id` from `{_step:
find_user._id}`, and on a no-match `find_user` returns no document so that
expression is `undefined`, not `null` — a bare `_ne null` would pass on
`undefined` and fire `UpdateUserProfile` with no `userId`. Use `_if_none` (or
coalesce to `null` before comparing) so both the no-match (`undefined`) and
explicit-`null` cases no-op. All existing callers (`update-profile`, `user-account`
self-service) always pass a `user_id`, so their behaviour is unchanged; the guard
exists so the invite flow can reuse the fragment before acceptance. Update the
fragment header to document that `user_id` may be absent (pre-accept invite) → denorm
no-ops, guarantee vacuous.

**2. Invite form — canonical capture.** In `components/invite_form.yaml`, replace
the bespoke `full_name` / `profile.phone_number` / `profile.job_title` block with
the shared `form_core.yaml` (`show_honorific: {_module.var: fields.show_honorific}`)

- `_module.var: fields.profile` — mirroring `modal_profile.yaml`. Fields bind
  `state.profile.*`. Update the submit payload to send `profile: {_state: profile}`
  (the whole bag) instead of the hand-mapped name/phone/job fields.

**3. `resolve_email` action — seed for `form_core`.** Drop the now-unused
`full_name` SetState (the existing `profile: check_invite.response.contact.profile`
seed already prefills `profile.given_name` / `profile.family_name` for the
existing-contact outcome).

**4. `api/invite.yaml` — persist + conditional denorm.** After `create-or-link`
resolves `read_contact._id`, and before `InviteMember`:

- Resolve the target user (if any): a `MongoDBFindOne` over the `users` connection,
  `query: { profile.contactId: {_step: read_contact._id} }`, projection `_id`.
- Splice the `write-profile` fragment (`_ref` by relative path) with
  `connection_id: {_module.connectionId: user-contacts-collection}`,
  `contact_id: {_step: read_contact._id}`, `user_id: {_step: find_user._id}`
  (`undefined` when no user matches — see §1's absence guard), `profile: {_payload:
profile}`, `write_stages: {_module.var: request_stages.write}` — the same consumer
  write seam both `update-profile` routines pass, so a consumer's denormalized fields
  land on the contact at invite time, not only at first post-accept edit (one write seam
  over every contact write). Consumer write stages must tolerate a pre-accept invitee
  (no `user` row yet), the same assumption §1's re-denorm guard already makes.
- Leave `profile.profile_created` unset (do **not** set it) — a new invitee still
  onboards.
  Keep the stale-expired reconciliation, `InviteMember`, and the final audit event
  as they are. `create-or-link-contact` stays a bare upsert — do **not** re-add a
  `profile` seed there; `write-profile` owns the profile write.

## Acceptance Criteria

- Invite form captures first name + last name (both required) + honorific (when
  `fields.show_honorific`) + `fields.profile`, identical to `modal_profile`; no
  `full_name` field remains.
- Submitting an invite for an **unknown** email creates the contact **with** the
  entered profile (given/family/derived name/phone/job title) and leaves
  `profile_created` unset.
- Submitting for an **existing contact** updates that contact's profile with edited
  values (admins may edit names).
- When the resolved contact already maps to a `user` (e.g. a member of another app),
  the rename re-denorms that user's `user.profile` / `user.name` in the same routine;
  when no user exists, the routine completes with no `UpdateUserProfile` call.
- `write-profile`'s existing callers are unchanged (they always pass `user_id`).
- Verifiable pre-accept: the `user-contacts` row carries the entered `profile`
  (given/family/derived `name`/phone/job) with `profile_created` unset. (An
  invited-not-yet-accepted person has no `user-members` row, and `invitations_base.yaml`
  joins `users` but not `user-contacts`, so no `user-admin` UI shows the persisted name
  until acceptance — after which `members_base.yaml`'s
  `name: $ifNull [$contact.profile.name, $user.name]` shows it immediately, without
  waiting for onboarding.)
- `pnpm ldf:b` compiles.

## Files

- `modules/shared/contact/write-profile.yaml` — rename re-read step `read_contact`
  → `reread_contact` (+ its internal `denorm_user_profile` refs); guard the
  `UpdateUserProfile` step on `user_id` presence; update header comment
- `modules/user-account/api/update-profile.yaml` — update the audit `on.user`
  reference `_step: read_contact` → `reread_contact` (follows the rename above)
- `modules/user-admin/components/invite_form.yaml` — swap bespoke profile block for
  `form_core` + `fields.profile`; send `profile` bag on submit
- `modules/user-admin/actions/resolve_email.yaml` — drop the `full_name` seed
- `modules/user-admin/api/invite.yaml` — resolve target user + splice `write-profile`
  before `InviteMember`
- `modules/shared/contact/create-or-link-contact.yaml` — no functional change; if the
  header comment claims the bare mint is a deliberate "onboarding fills profile"
  decision, correct it (the profile is now persisted by the caller via `write-profile`)

## Notes

- This is the review resolution of the implementer's flagged item ("invite form vs
  write path mismatch"). The chosen direction (persist, canonical capture, denorm
  when a user exists) matches the old module and the original task 2 contract.
- The `create-or-link-contact` / signup path (`user-account`) is untouched — it
  passes no profile and stays bare, so the shared fragment and the merge-on-signup
  hook keep their behaviour.
- Per the repo comment rule, do not leave "used to send forward-compatibly / routine
  now persists" journey comments — state only the current behaviour.

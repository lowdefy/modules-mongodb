# 06 — `create-or-link-contact` shared fragment

**Context**: Merge-on-signup (Decision 7) links or creates the contact for a new
signup. Both this module (signup hook) and user-admin (invite) run the same
match-and-write semantics against the same key, so it must be a single shared
fragment they both `_ref` — otherwise the semantics drift and two concurrent
first-touches for one email mint two contacts.

**Task**: Author the shared `create-or-link-contact` fragment
(`modules/shared/contact/create-or-link-contact.yaml`) — an
**upsert keyed on `lowercase_email`**, run in system context:

1. Match the contact by lowercased email.
2. **Link** (`contactId`) when found; **insert** (change-stamped, system context)
   when absent.
3. **Reconcile to the existing row on a duplicate-key error** (the unique
   `lowercase_email` index from task 03 is the guard) — closes the race with
   user-admin's invite flow.
4. **Write-back branches on binding point** (the caller passes which fired):
   - `user.create.before` (pre-write) — set `profile.contactId` inline by returning
     the mutated record (`:return`).
   - `email.verified` (synthetic post-write) — write `profile.contactId` through the
     `UpdateUserProfile` step (can't mutate inline post-write).
5. On **create**, mint the contact **bare** — no name copied from the signup/OAuth
   payload, `profile.profile_created` unset — so first login routes through
   onboarding (Decision 5/7).

**Acceptance Criteria**:

- Upsert on `lowercase_email` with link/insert/reconcile-on-dup-key paths.
- Write-back branch selects inline `:return` vs `UpdateUserProfile` by binding point.
- Created contacts are bare (no name, `profile_created` unset).
- Authored as a var-free `modules/shared/contact/create-or-link-contact.yaml` file,
  `_ref`'d by **relative path** — **not** a manifest export (parameterized via
  `_ref` vars so user-admin's invite `_ref`s the same fragment without a dependency
  edge on user-account).
- Resolves in `pnpm ldf:b`.

**Files**:

- `modules/shared/contact/create-or-link-contact.yaml`

**Notes**:

- Same canonical file as user-admin
  [task 02](../../user-admin-better-auth/tasks/02-shared-contact-fragments.md) —
  **one shared spec** (this design's Decision 7 + user-admin's). Whichever task set
  ships first authors it; the other reuses the identical file. Do not fork the
  semantics.
- Depends on 01 only for a buildable module to consume it (08) — the fragment lives
  outside the module. Also depends on 03 (unique `lowercase_email` index for the
  reconcile-on-dup-key path).
- The `users` partial-unique `profile.contactId` index does NOT guard this — it's
  one user per contact, not one contact per email (Decision 7).
- Consumed by the hook endpoint in task 08.
- Use the `lowdefy-docs` MCP / `/lowdefy-config` for API routines; see `docs/shared/change-stamps.md` for the change stamp.

# 05 — `write-profile` shared fragment

**Context**: Contact profile data is written by TWO modules — this one
(self-service) and user-admin (operator editing another user). A bare contact
write leaves the target's `user.profile` bag and its `name`/`image` display copies
stale. The fix is a shared fragment that pairs the contact write with the
`UpdateUserProfile` re-denorm so neither module can write profile data without
re-denormalizing in the same routine (design.md — Decisions 6 & 8, upstream ask 5).

**Task**: Author the shared `write-profile` fragment
(`modules/shared/contact/write-profile.yaml`) that, in one routine:

1. Writes the contact profile fields to `user-contacts` (change-stamped —
   `_ref: change_stamp.yaml`).
2. Calls the engine's **`UpdateUserProfile`** step to write the contact's `profile`
   fragment onto `user.profile` **and** the `name`/`image` display copies onto
   top-level `user.name` / `user.image` for the target user.
3. Is parameterized so each caller supplies its own target ids, audit event, and
   `request_stages.write` extensions, passed as `_ref` vars (**never** `_module.var`)
   — this module and user-admin both `_ref` it by relative path.

Because `resolveAuthentication` reads the target's `user` row per request, a
re-denormalized bag is fresh on the target's next request with no `UpdateSession`
needed (the caller's own `UpdateSession` refresh is the caller's routine's job, not
the fragment's — see task 07).

**Acceptance Criteria**:

- Fragment pairs the change-stamped contact write with `UpdateUserProfile` in one
  routine; the two cannot be separated by a caller.
- Parameterized (via `_ref` vars, no `_module.var`) for target ids + audit event +
  write-stage extensions.
- Authored as a var-free `modules/shared/contact/write-profile.yaml` file, `_ref`'d
  by **relative path** — **not** a manifest export. This avoids forcing a
  `user-admin → user-account` dependency edge (user-admin does not depend on
  user-account).
- Resolves in `pnpm ldf:b`.

**Files**:

- `modules/shared/contact/write-profile.yaml`

**Notes**:

- Same canonical file as user-admin
  [task 02](../../user-admin-better-auth/tasks/02-shared-contact-fragments.md) —
  **one shared spec** (this design's Decisions 6/8 + user-admin's). Whichever task
  set ships first authors it; the other reuses the identical file. Do not fork the
  semantics.
- Depends on 01 only for a buildable module to consume it (07) — the fragment itself
  lives outside the module. The `lowercase_email` index (03) is irrelevant here
  (`write-profile` only updates existing contacts, never inserts).
- This is the cross-module freshness invariant of Decision 6 — "one correct way",
  enforced mechanically.
- Use the `lowdefy-docs` MCP / `/lowdefy-config` for API routines; see `docs/shared/change-stamps.md` for the change stamp.

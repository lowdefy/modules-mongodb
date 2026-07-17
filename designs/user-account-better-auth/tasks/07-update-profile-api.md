# 07 — `update-profile` API

**Context**: The profile tile, edit modal, and onboarding all save through one API
(design.md — Decision 5/6). It writes contact fields and re-denormalizes onto the
caller's `_user`, built on the shared `write-profile` fragment (task 05).

**Task**: Author the `update-profile` API endpoint:

1. Target the caller's own contact via `_user.profile.contactId` (upstream ask 3,
   delivered as `_user.profile.contactId`).
2. `_ref` the shared `write-profile` fragment by relative path
   (`modules/shared/contact/write-profile.yaml`, task 05) — change-stamped contact
   write + `UpdateUserProfile` re-denorm — wrapped with **this module's audit event** (via
   the `events` dependency) and the `request_stages.write` append (Decision 8).
3. After the write, refresh the caller's `_user` with **`UpdateSession`** so the
   header/avatar/menus pick up the new profile without a reload (Decision 6).
4. Onboarding's save additionally sets `profile.profile_created: true` — accept an
   input/flag so the onboarding page task (17) can request that on completion
   (Decision 5). (The marker is set by onboarding's call, not unconditionally.)

**Acceptance Criteria**:

- Writes via `write-profile`; change stamp present; audit event logged.
- `request_stages.write` appended.
- Caller `_user` refreshed via `UpdateSession`.
- Supports the onboarding completion path (`profile_created` set on request).
- Registered in the manifest `api:` list; resolves in `pnpm ldf:b`.

**Files**:

- `modules/user-account/api/update-profile.yaml`
- Manifest `api:` entry (stub from task 01)

**Notes**:

- Depends on 05 (`write-profile`).
- Consumed by the onboarding page (17) and account page (18).
- Payload, not state (CLAUDE.md). Use the `lowdefy-docs` MCP / `/lowdefy-config` for API routines.

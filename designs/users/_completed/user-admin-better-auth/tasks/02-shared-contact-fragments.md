# Task 2: Shared contact fragments (create-or-link + write-profile)

## Context

Two write concerns are shared between this module and the sibling
`user-account` module, so they live as `modules/shared/` files `_ref`'d by
relative path — **not** module exports and **not** dependencies (they carry no
module vars; each caller wraps them with its own ids and audit event). This
matches the existing shared-file pattern under `modules/shared/` (see
`modules/shared/profile/`, `modules/shared/layout/`). These fragments do not
exist yet — this task creates them under `modules/shared/contact/`.

Design sections: Decision 7 (`create-or-link-contact`) and Decision 3 (the
"Why profile save is `write-profile`" paragraph). Use the `lowdefy-docs` MCP
for API-routine / request-type schemas and `docs/shared/change-stamps.md` first.

## Task

Create `modules/shared/contact/`:

**`create-or-link-contact.yaml`** — a generic email-keyed contact upsert. Keyed
on `lowercase_email`, reconcile-on-duplicate-key (the contact-uniqueness
invariant is backed by a unique index on the contact's `lowercase_email`). Given
an email + optional profile fields, it resolves to the existing contact or
creates one, returning the `contactId`. It must be idempotent so a retry
converges (Decision 3 partial-failure semantics). No module vars — the caller
passes ids/fields and owns its own audit event. Change-stamp the write
(`_ref` the events module change stamp).

**`_var` interface** (caller-injected — keeps the fragment `_module`-free):

- `connection_id` — the scoped contact connection id (caller resolves it, e.g.
  `_module.connectionId: user-contacts-collection`, and passes it in).
- `email` — the email to key on (the fragment lowercases it for `lowercase_email`).
- `profile` (optional) — profile fields to set on create.
- Returns `contactId`.

**`write-profile.yaml`** — pairs a change-stamped `contact` write over the app
connection **with an `UpdateUserProfile` re-denorm** of the _target's_
`user.profile` bag, in one routine. Profile fields live on the app-owned
`contact` (source of truth), but the auth `user` row carries a denormalized
`profile` copy plus `name`/`image` display copies that feed `_user.*`, the
header, avatar, and menus the target sees. A bare contact write would leave the
target's `user.profile` stale, so this fragment makes it impossible to write
profile data without re-denorming it. The re-denorm targets the **edited** user
(never the admin), so it is floored by `auth.userAdminRole` like every other
admin write.

**`_var` interface** (caller-injected — keeps the fragment `_module`-free):

- `connection_id` — the scoped contact connection id.
- `user_id` — the **target** user whose `user.profile` bag `UpdateUserProfile`
  re-denorms (never the admin).
- `contact_id` — the contact to write.
- `profile` — the profile fields.
- `write_stages` (default `[]`) — pipeline update stages appended to the contact
  write; this **is** the `request_stages.write` seam, passed in by the caller.

The seam lives on the fragment as the `write_stages` `_var`, not as a
`_module.var` inside the fragment: `user-admin`'s caller routine (task 3) passes
`write_stages: {_module.var: request_stages.write}`, while `user-account` passes
nothing (defaults to `[]`). Same for `connection_id`
(`{_module.connectionId: user-contacts-collection}` from the `user-admin`
caller). All `_module.*` resolution happens in the **caller's** routine, never in
the shared file.

## Acceptance Criteria

- `modules/shared/contact/create-or-link-contact.yaml` and
  `modules/shared/contact/write-profile.yaml` exist, `_ref`-able by relative
  path, carrying no module (`_module.*`) references — all module-scoped values
  (connection id, `write_stages`) arrive through the `_var` interface above.
- `create-or-link-contact` keys on `lowercase_email`, reconciles on duplicate
  key, and is safe to re-run (idempotent).
- `write-profile` performs the change-stamped contact write **and** the
  `UpdateUserProfile` re-denorm of the target user, and appends the caller's
  `write_stages` `_var` (the `request_stages.write` seam) to the contact write.
- Both are change-stamped on the contact write.
- `pnpm ldf:b` still compiles (fragments are referenced by the write routines in
  tasks 3 and 5; if not yet referenced, confirm they at least parse).

## Files

- `modules/shared/contact/create-or-link-contact.yaml` — create
- `modules/shared/contact/write-profile.yaml` — create

## Notes

- The sibling `user-account` design currently frames these as _exported by_
  `user-account`; the settled decision is the shared folder. Author them here as
  the canonical home; `user-account` will `_ref` them later.
- Keep them free of module vars so they resolve in any consuming module without a
  dependency edge.
- The `UpdateUserProfile` step self-target exemption (admin Decision 1) is never
  hit here — this module's profile writes always target the edited user.

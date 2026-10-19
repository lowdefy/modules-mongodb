# 08 — `link-contact-on-signup` hook endpoint + bindings

**Context**: The module ships the merge-on-signup endpoint (Decision 7, upstream
ask 4 delivered) — an `InternalApi` endpoint running in system context, bound at
`email.verified` (email/password signups) and `user.create.before`
(verified-provider OAuth). The upstream hook is link-only; the create half is this
module's extension. The `create-profile` API is retired (done in task 01).

**Task**: Author the `link-contact-on-signup` `InternalApi` endpoint:

1. Run in system context; `_ref` the shared `create-or-link-contact` fragment by
   relative path (`modules/shared/contact/create-or-link-contact.yaml`, task 06),
   passing which binding point fired so the fragment picks the correct write-back
   mechanic (inline `:return` vs `UpdateUserProfile`).
2. Bind it at **both** `email.verified` and `user.create.before` via the manifest's
   module-exported hook bindings (ask 4 — one endpoint, multiple points).
3. Ensure every user has a contact by first session (link when matched, create bare
   when not) so workspace/onboarding never handle a missing record.

**Acceptance Criteria**:

- `InternalApi` endpoint in system context, delegating to `create-or-link-contact`.
- Manifest declares the endpoint bound at `email.verified` AND `user.create.before`.
- Registered in the manifest `api:` list; resolves in `pnpm ldf:b`.

**Files**:

- `modules/user-account/api/link-contact-on-signup.yaml`
- Manifest `api:` + hook-binding entries (stub from task 01)

**Notes**:

- Depends on 06 (`create-or-link-contact`).
- Under `invite-only` the binding is harmless-to-helpful; uniform behaviour, no knob
  (Decision 7).
- Fallback if module-exported bindings unavailable: two documented app-side
  `auth.hooks` entries with the scoped endpoint id (ask 4).

# Task 5: Invite routines (invite, check-email, cancel, resend)

## Context

The `invite` page is email-first: the admin enters an email, a check routine
resolves it to one of four states before the form opens, then submit creates the
invitation. The scaffold (task 1) stubbed these endpoints; this task implements
them. The `create-or-link-contact` shared fragment (task 2) is required for
submit. The invitation email is sent by BetterAuth through `auth.email` — the
module ships **no email endpoint, hook, or binding** (Decision 7).

Design section: Decision 7 (invite flow). Use the `lowdefy-docs` MCP for
API-routine / request-type schemas and `docs/events/` first.

## Task

Implement four endpoints:

**`check-invite-email`** — resolves an email to one of four outcomes (this is a
read, but co-owned with the invite write flow): **already a member** (native read
over `user-members` joined to `users`/`user-contacts`), **pending invitation**
(native read over `user-invitations`, `status: "pending"` and future `expiresAt`),
**existing contact, no membership** (contact exists on `lowercase_email` but no
member row → return prefill profile fields), **unknown** (nothing found → blank
form). Preserves the one-contact-per-email invariant the old `check` page existed
for.

**`invite`** — submit: **reconcile stale expired invitations first** → create-or-link
`contact` (via the shared `create-or-link-contact` fragment — pass its `_var`
inputs per the task 2 contract: `connection_id: {_module.connectionId: user-contacts-collection}`,
`email`, optional `profile`) → `InviteMember` with `profile: { contactId }`

- roles + **member attributes** (captured on the form; stored on the invitation
  via `invitation.additionalFields` and applied to the minted member at accept by
  the engine's `afterAcceptInvitation` hook — admin Decision 5). Final step: audit
  event. Partial-failure: the two-step chain (create-or-link → InviteMember) is safe
  because create-or-link reconciles on duplicate key, so retry converges; an
  unknown-email invite that fails at `InviteMember` may leave an orphan contact the
  next check resolves to "existing contact, no membership".

  **Stale-expired reconciliation (verified against BetterAuth 1.6.23):**
  `InviteMember`→`createInvitation` guards against re-invites via
  `findPendingInvitation`, but that helper **excludes expired rows** (`expiresAt >
now`). So an expired-but-`pending` invitation is invisible to the guard and a
  fresh `InviteMember` would create a **duplicate** `pending` row beside the stale
  one (and `resend: true` only refreshes a _non-expired_ row, so it doesn't help
  here). Before `InviteMember`, the routine must therefore natively find any
  `pending` invitation(s) for the lowercased `(email, organizationId)` with
  `expiresAt < now` and `CancelInvitation` each by id (cancel accepts expired rows
  — it has no expiry/status guard), then create the fresh invitation. Non-expired
  pending never reaches submit — `check-invite-email` routes it to Resend — so this
  only ever cancels genuinely-stale rows. Cancel-then-invite is idempotent: with no
  stale row it is a no-op.

**`cancel-invitation`** — `CancelInvitation`. Final step: audit event.

**`resend-invitation`** — `InviteMember` with native `resend: true` (re-renders
through the same `auth.email` send path; refreshes stored attributes). Final
step: audit event.

## Acceptance Criteria

- `check-invite-email` returns a discriminated result covering all four states
  and does the `status: "pending"` + `expiresAt` filtering itself (it reads
  `user-invitations` directly, bypassing org-plugin helpers).
- `invite` cancels any expired `pending` invitation(s) for the `(email, org)`
  before inviting (so re-inviting an Expired row leaves **no** duplicate pending
  row), uses the `create-or-link-contact` fragment, calls `InviteMember` with
  `profile.contactId` + roles + member attributes, and fires its audit event last.
- `cancel-invitation` / `resend-invitation` drive `CancelInvitation` /
  `InviteMember(resend)` with a final audit event each.
- No email endpoint/hook/binding is shipped (invite email rides `auth.email`).
- All endpoints role-gated by the module admin-roles var; `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/api/check-invite-email.yaml` — implement (four-state resolve)
- `modules/user-admin/api/invite.yaml` — implement (create-or-link + `InviteMember`)
- `modules/user-admin/api/cancel-invitation.yaml` — implement (`CancelInvitation`)
- `modules/user-admin/api/resend-invitation.yaml` — implement (`InviteMember` resend)
- request/stage sub-files as needed under `modules/user-admin/`

## Notes

- These feed both the `invite` wire task (task 17 — check + submit + cancel/resend)
  and the `all` wire task (task 9 — Invitations-tab resend/cancel row actions).
- Member attributes ride the invitation (admin Decision 5, already delivered
  upstream) — do not build a post-accept attribute-apply step; the engine hook
  handles it.
- No `expired` invitation status exists in BetterAuth — "Expired" is derived
  (`status: "pending" AND expiresAt < now`), and cancel/resend act on `pending`
  rows.
- "Re-invite (expired)" (tasks 9/17) just routes to this invite flow; the
  stale-expired reconciliation above lives in the `invite` routine, so every
  path (the Expired-row button or a manually re-typed email) self-reconciles —
  no duplicate `pending` rows.

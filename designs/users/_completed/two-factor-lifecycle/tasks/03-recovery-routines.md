# Task 3: Recovery routines — `reset-two-factor` + `revoke-passkeys` + manifest wiring

## Context

The two recovery routines are the write-side of admin recovery (Decisions 1, 3, 8). Each calls an
adapter-direct engine step, revokes the target's sessions, writes an audit event, and dispatches a
notification. They mirror the shape of the existing `modules/user-admin/api/revoke-sessions.yaml` and
`api/suspend.yaml` (both: engine step → audit `CallApi` into `new-event` → `:return:`), adding a final
`CallApi` into the `notifications` module's `send-notification` endpoint.

Key facts about the plumbing (verified against the code):

- `new-event` (`modules/events/api/new-event.yaml`) flattens the `references` payload onto the event doc
  and **returns `{ eventId: insertedId }`**. Downstream steps read it as `_step: <audit-step-id>.eventId`
  (pattern used across the codebase, e.g. `_step: new-event.eventId`, `_step: log_stage_event.eventId`).
- `send-notification` (`modules/notifications/api/send-notification.yaml`) is an `InternalApi` whose
  routine is the deployment-bound `send_routine` var. Its contract is `{ event_ids }` — an array of
  just-committed event ids. The bound routine `$match`es `_id: { $in: event_ids }`. `references.user_ids`
  becomes a top-level `user_ids` field on the event doc (via `new-event`'s `_object.assign`), so the
  deployment's dispatch can address the target.
- This is the **first** Lowdefy `Api` routine to `CallApi` `send-notification` (the `workflows` precedent
  dispatches engine-side). Mechanically it is an ordinary `CallApi` to an `InternalApi` endpoint.

## Interfaces

- **Consumes:** `event_display` keys `two-factor-reset` / `passkeys-revoked` (task 1); upstream steps
  `ResetUserTwoFactor({ userId, organizationId })` and `RevokeUserPasskeys({ userId, organizationId, passkeyId? })`;
  the `events` `new-event` endpoint; the `notifications` `send-notification` endpoint.
- **Produces:** endpoints `reset-two-factor` (payload `{ user_id, target_name?, target_email? }`) and
  `revoke-passkeys` (payload `{ user_id, passkey_id?, target_name?, target_email? }`) — consumed by the
  dialogs' `onOk` (tasks 4, 5).

## Task

**1. `modules/user-admin/api/reset-two-factor.yaml`** — model on `api/revoke-sessions.yaml`:

- `id: reset-two-factor`, `type: Api`.
- Step 1 `ResetUserTwoFactor`: `userId: { _payload: user_id }`, `organizationId: { _module.var: org_slug }`.
- Step 2 `RevokeUserSessions`: same `userId` / `organizationId` (copy from `revoke-sessions.yaml`).
- Step 3 `id: audit`, `type: CallApi` into `new-event` (copy the whole `display` / `references` block from
  `revoke-sessions.yaml`), with `type: two-factor-reset` and the `event_display.two-factor-reset` default
  (`_build.if_none` of the `event_display.two-factor-reset` var and the `defaults/event_display.yaml`
  key). `references.user_ids: [ { _payload: user_id } ]`.
- Step 4 `id: notify`, `type: CallApi` into `send-notification`:
  ```yaml
  - id: notify
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: send-notification
          module: notifications
      payload:
        event_ids:
          - _step: audit.eventId
  ```
- `- :return: { success: true }`.

**2. `modules/user-admin/api/revoke-passkeys.yaml`** — identical shape, with:

- `id: revoke-passkeys`; step 1 `RevokeUserPasskeys` taking the same `userId` / `organizationId` plus an
  **optional** `passkeyId: { _payload: passkey_id }` (omitted/absent revokes all — the step treats a
  missing `passkeyId` as all-keys per Decision 2; confirm the step accepts an absent `passkeyId`).
- Audit `type: passkeys-revoked` with the `event_display.passkeys-revoked` default.

**3. `modules/user-admin/module.lowdefy.yaml`** — add the wiring:

- A `notifications` dependency under `dependencies:` (currently only `layout`, `events`):
  ```yaml
  - id: notifications
    description: Notification dispatch for recovery notices (send-notification)
  ```
- Two `exports.api` entries:
  ```yaml
  - id: reset-two-factor
    description: ResetUserTwoFactor → revoke sessions → audit → notify (Decision 3/8)
  - id: revoke-passkeys
    description: RevokeUserPasskeys → revoke sessions → audit → notify; optional passkey_id
  ```
- Two `_ref` entries under the top-level `api:` list:
  `- _ref: api/reset-two-factor.yaml` and `- _ref: api/revoke-passkeys.yaml`.

## Acceptance Criteria

- Both routines exist with the exact step order `<recovery step>` → `RevokeUserSessions` → `audit`
  (`new-event`) → `notify` (`send-notification`) → `:return:`; audit precedes notify.
- `revoke-passkeys` passes `passkeyId` from the payload and works when it is absent (revoke-all).
- Manifest declares the `notifications` dependency, exports both APIs, and `_ref`s both files.
- `pnpm ldf:b` from `apps/demo` compiles (the demo has a `notifications` entry, so the new dependency
  auto-wires).

## Files

- `modules/user-admin/api/reset-two-factor.yaml` — create.
- `modules/user-admin/api/revoke-passkeys.yaml` — create.
- `modules/user-admin/module.lowdefy.yaml` — modify — notifications dependency, two api exports, two `_ref`s.

## Notes

- **New hard dependency.** Adding `notifications` to `dependencies` makes it required for every
  user-admin consumer, not only 2FA deployments — this is intended (design Surface). Task 8 records the
  consumer-facing consequence in docs.
- **Verify step schemas** against the running `lowdefy-docs` MCP (`lowdefy_get_schema` for
  `ResetUserTwoFactor` / `RevokeUserPasskeys`) before finalizing prop names; the design's Decision 1
  specifies `ResetUserTwoFactor({ userId })` / `RevokeUserPasskeys({ userId, passkeyId? })`, and the
  org-authority floor needs `organizationId` as the sibling routines pass it. If the MCP is down, stop
  and ask (per CLAUDE.md) rather than guessing.
- Notify is **fire-and-forget after** the audit event so a bounced address never suppresses the record
  or tells the admin the recovery failed (Decision 8). Do not add rollback or a `try/catch` around it —
  the partial-failure rules are sequential-halt-no-rollback (Decision 3).

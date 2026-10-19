# Task 5: `modal_revoke_passkeys` — revoke-passkeys confirm dialog with per-key picker

## Context

The revoke control (task 6) opens this dialog before running the `revoke-passkeys` routine (task 3). It
is the sibling of the reset dialog (task 4) — same reach copy and attestation checkbox — with one extra
piece: a **per-key picker** (Decision 2). `passkeyId` is optional; omitted revokes **all** passkeys.

- Where the target holds **more than one** passkey, offer the choice: revoke a specific credential or
  revoke all. The picker is fed by `get_user_passkeys` (task 2), which lists
  `{ passkey_id, name, device, created_str }` per credential.
- Where the target holds **one** passkey, skip the picker and revoke all (`passkey_count == 1`).

`passkey_count` comes from `get_user_detail.0.passkey_count` (already on the view page); the per-key rows
come from `get_user_passkeys`.

## Interfaces

- **Consumes:** endpoint `revoke-passkeys` (task 3); request `get_user_passkeys` (task 2); reads
  `get_user_detail.0.*` (name, email, user_id, passkey_count) and `get_user_memberships`; action fragment
  `actions/detail_refetch.yaml`.
- **Produces:** block `modal_revoke_passkeys`, opened via `CallMethod toggleOpen` from the tile control
  (task 6).

## Task

Create `modules/user-admin/components/view/modal_revoke_passkeys.yaml`, `id: modal_revoke_passkeys`,
`type: Modal`. Start from task 4's `modal_reset_2fa.yaml` for the shared scaffolding (title, danger OK,
reach copy on `get_user_memberships`, attestation checkbox + OK gating, `onClose` leaf reset), then:

- **Title:** "Revoke passkeys for {{ name }}?" (verb per Global Constraints).
- **okText:** "Revoke passkeys".
- **Reach copy:** same suite-wide framing as task 4 — passkey rows are keyed to the `user`, so a revoke
  removes them everywhere in the suite; collapse to single-app copy at other-membership count 0.
- **Per-key selection** (only when `get_user_detail.0.passkey_count > 1`): render the
  `get_user_passkeys` rows so the admin can pick one credential or "All passkeys". Use a Lowdefy
  selection block (look up the exact block + props via the `lowdefy-docs` MCP — a `RadioSelector` /
  `Selector` over the rows, options labelled by `name` + `device` + `created_str`, valued by
  `passkey_id`, with an explicit "All passkeys" option that maps to no `passkey_id`). Store the selected
  `passkey_id` in a modal-scoped state path (e.g. `revokepk.passkey_id`; the "All" option leaves it
  null). Gate this block's visibility on `_gt: [ { _request: get_user_detail.0.passkey_count }, 1 ]`.
- **Single-passkey case** (`passkey_count == 1`): no picker; the copy states the one registered passkey
  will be revoked.
- **onOk:** `CallAPI` to `_module.endpointId: revoke-passkeys` with payload
  `{ user_id, passkey_id, target_name, target_email }` where `passkey_id: { _state: revokepk.passkey_id }`
  (null when "All" / single-key → the routine revokes all). Messages "Revoking…" / "Passkeys revoked.".
  Then `_ref: actions/detail_refetch.yaml`.
- **onClose / reset:** null `revokepk.passkey_id` and the attestation leaf.

## Acceptance Criteria

- Picker appears only when `passkey_count > 1`; a single-passkey target sees no picker and revokes all.
- "All passkeys" selection (and the single-key case) sends no `passkey_id` (or null), and the routine
  revokes all; a specific selection sends that `passkey_id`.
- OK disabled until the attestation checkbox is ticked.
- `onOk` calls `revoke-passkeys` with the target's ids, then refetches detail.
- File parses; `pnpm ldf:b` compiles once referenced in task 6.

## Files

- `modules/user-admin/components/view/modal_revoke_passkeys.yaml` — create.

## Notes

This mirrors self-service `PasskeyDelete` (single `passkeyId`) so the two surfaces stay legible together
(Decision 2). Confirm the exact selector block/prop names via the MCP rather than guessing; the design
does not mandate a specific block, only the behaviour (per-key vs all).

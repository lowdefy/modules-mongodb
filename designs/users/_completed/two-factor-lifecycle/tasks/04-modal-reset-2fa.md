# Task 4: `modal_reset_2fa` — reset-two-factor confirm dialog

## Context

The reset control (task 6) opens a confirm dialog before running the `reset-two-factor` routine (task 3).
Model it on `modules/user-admin/components/view/modal_revoke.yaml` (the sign-out-everywhere confirm) —
same Modal shape, same `onOk` → `CallAPI` → `detail_refetch` pattern — with two additions from Decision 4:

1. **The reach is suite-wide** (`twoFactorEnabled` is keyed to the `user`, not the `member`, so a reset
   removes the factor everywhere in the suite). The dialog says so, reusing the `get_user_memberships`
   read already fetched on the view page (as `modal_suspend.yaml` does) and collapsing to single-app copy
   when the target holds no other memberships.
2. **An out-of-band attestation checkbox** the admin must tick before the OK button enables — a speed
   bump and paper trail, not a guard.

## Interfaces

- **Consumes:** endpoint `reset-two-factor` (task 3); reads `get_user_detail.0.*` and
  `get_user_memberships` (both already on `pages/view.yaml`); action fragment
  `actions/detail_refetch.yaml`.
- **Produces:** block `modal_reset_2fa`, opened via `CallMethod toggleOpen` from the tile control (task 6).

## Task

Create `modules/user-admin/components/view/modal_reset_2fa.yaml`, `id: modal_reset_2fa`, `type: Modal`:

- **Title:** "Reset two-factor authentication for {{ name }}?" via `_nunjucks` on
  `get_user_detail.0.name` (verb per Global Constraints — never "disable").
- **okText:** "Reset two-factor authentication". `okButtonProps: { danger: true }`.
- **Body copy** (`Html` + `_nunjucks`): explain that this clears the person's authenticator (TOTP) and
  backup codes and signs them out; because the factor is keyed to the person, the reset **removes it
  across every app in the suite** when they hold other memberships — collapse the "across the suite"
  clause to single-app framing at other-membership count 0, keyed on
  `_array.length: { _if_none: [ { _request: get_user_memberships }, [] ] }` (the exact switch
  `modal_revoke.yaml` / `modal_suspend.yaml` use). Under `required`, the person re-enrols at next
  sign-in; the copy may say the reset returns them to unenrolled, but **must not** imply an exemption.
- **Attestation checkbox:** a `CheckboxSwitch` (compare `enroltotp.codes_saved` in
  `modules/user-account/components/view/modal_enroltotp.yaml`) with description
  "I have verified this person's identity through a channel other than email." Store it at a state path
  under a modal-scoped namespace (e.g. `reset2fa.attested`).
- **OK gating:** the OK action must not run unless attested. Prefer disabling OK via
  `okButtonProps.disabled: { _not: { _state: reset2fa.attested } }` (look up the exact Modal prop for
  disabling the footer OK via the `lowdefy-docs` MCP; `modal_suspend.yaml` sets `okButtonProps` already).
- **onOk:** copy `modal_revoke.yaml`'s structure — a `CallAPI` to `_module.endpointId: reset-two-factor`
  with payload `{ user_id, target_name, target_email }` from `get_user_detail.0.*`, loading/success
  messages ("Resetting…" / "Two-factor authentication reset."), followed by
  `_ref: actions/detail_refetch.yaml`.
- **onClose / reset:** null the attestation leaf (`reset2fa.attested: false`) on close so it does not
  persist across opens (repo rule "Resets set explicit leaf nulls"; boolean resets to `false`).

## Acceptance Criteria

- Dialog compiles and is a self-contained component file.
- OK is disabled until the attestation checkbox is ticked; ticking enables it.
- `onOk` calls `reset-two-factor` with the target's `user_id` / `target_name` / `target_email`, then
  refetches the detail.
- Reach copy collapses correctly at other-membership count 0 vs > 0.
- `pnpm ldf:b` compiles once the modal is referenced (task 6) — until then verify the file parses.

## Files

- `modules/user-admin/components/view/modal_reset_2fa.yaml` — create.

## Notes

Do not send the attestation value to the routine — it gates the button only (Decision 4). The dialog is
also the wrong place to imply a notice was sent, since `send_routine` may be unbound (Decision 8).

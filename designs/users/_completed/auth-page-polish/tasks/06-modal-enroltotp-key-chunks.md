# Task 6: 4-char key chunks + Enter-to-submit in the Manage-modal TOTP enrol

## Context

`modules/user-account/components/view/modal_enroltotp.yaml` is the "Manage two-factor" modal's
authenticator-enrolment flow (reached from the account `view` page), the modal counterpart to
the `two-factor-enrol` page. Its scan area mirrors the page:

- `enroltotp_manual_key_label` (Label, line ~468).
- `enroltotp_manual_key` (`Paragraph`, line ~482) — reads the base32 `secret` out of the
  otpauth URI via `_js` (same pattern as the enrol page).
- `enroltotp.confirmation_code` (TextInput, line ~495) — the 6-digit code; its id is its state
  path.
- `enroltotp_confirm` (Button, line ~505) — primary action: `validate_confirmation_code`
  (Validate on `enroltotp.confirmation_code`) → a TwoFactorVerify reading
  `_state: enroltotp.confirmation_code`.

The same F49 fix that lands on the page (52-char base32 secret rendered in 4-char chunks; see
`tasks.md` Global Constraints) applies here. This is a modal, not an auth _page_, so it has no
`max_width` override to remove and is independent of the width work.

## Interfaces

- Standalone — depends on no other task.

## Task

Edit `modules/user-account/components/view/modal_enroltotp.yaml`:

1. **Render `enroltotp_manual_key` in 4-char chunks.** Group the 52-char base32 secret into 13
   chunks of 4 chars as monospace, cleanly-wrapping text — matching the enrol page's treatment
   (Task 4). Keep the existing `_js` that extracts the base32 `secret` from the otpauth URI; add
   chunking (e.g. `secret.match(/.{1,4}/g).join(' ')`, or per-chunk monospace pills). Keep it a
   **copyable `Paragraph`** (never a disabled `TextInput`). The chunks must wrap within the modal
   width, not overflow.

2. **Enter-to-submit.** Add `onPressEnter` to `enroltotp.confirmation_code` running the **same
   action chain** as `enroltotp_confirm` (`validate_confirmation_code` → TwoFactorVerify →
   whatever follows in that button's chain). Confirm `onPressEnter` on `TextInput` via
   `lowdefy_get_schema`; factor the chain so the two call sites can't drift.

Do not otherwise change the modal's flow (choose / setup / replace / getcodes branches). Match
whatever chunking helper shape Task 4 uses so the page and modal stay consistent (if the enrol
page factored a shared display component or `_js` snippet, reuse it here).

## Acceptance Criteria

- `enroltotp_manual_key` renders the secret in spaced 4-char chunks that wrap inside the modal;
  the text stays selectable/copyable.
- Pressing Enter in `enroltotp.confirmation_code` runs the identical validate → verify chain as
  the confirm button.
- `pnpm ldf:b` from `apps/demo` succeeds; `lowdefy_build_status` clean.

## Files

- `modules/user-account/components/view/modal_enroltotp.yaml` — modify — 4-char chunk key
  display; `onPressEnter` on confirmation code.

## Notes

- The heading pass (Task 8) does **not** touch this modal — it's not an auth page — so this task
  is fully independent and can run any time.

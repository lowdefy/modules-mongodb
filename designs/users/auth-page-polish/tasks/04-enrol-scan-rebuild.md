# Task 4: Rebuild the two-factor enrolment scan step at standard width

## Context

`modules/user-account/pages/two-factor-enrol.yaml` is the worst card-width offender. It sets
`max_width: 560` (line ~33) because its scan step (`enrol_scan_row`, a `Box`) crams the QR
**beside** a column (`enrol_scancol`) holding the manual key label, the manual key, and the code
input. F49 adds that the manual key is a **52-char base32 string** that wraps badly (see the
Global Constraints in `tasks.md` — the length is BetterAuth-fixed, display-side only).

The relevant existing blocks:
- `enrol_scan_row` (Box) — the two-column scan row to be restacked.
- `enrol_qr` (QRCode) — the QR.
- `enrol_scancol` (Box) — the right column holding key + code.
- `enrol_manual_key_label` (Label) and `enrol_manual_key` (`Paragraph`, id — reads the base32
  `secret` out of the otpauth URI via `_js`).
- `enrol.confirmation_code` (TextInput) — the 6-digit code, its id **is** its state path.
- `enrol_confirm` (Button) — primary action, runs `validate_enrol_code` (Validate on
  `enrol.confirmation_code`) → `verify_enrol_totp` (TwoFactorVerify, `_state: enrol.confirmation_code`)
  → session refresh chain.

Target layout is `mockups/enrol-redesign.html` (phase = scan): single column at `420`, QR
primary, manual key behind a collapsed disclosure rendered in 4-char chunks.

## Interfaces

- **Consumes:** `auth_page.max_width` default `420` (Task 1) — dropping the `560` override lands
  this page at the standard width.

## Task

Edit `modules/user-account/pages/two-factor-enrol.yaml`:

1. **Remove the `max_width: 560` override** (line ~33, in the page's `auth-page` shell `vars`)
   so the page inherits the `420` default. Remove the now-stale comment above it that explains
   the QR-beside-key rationale.

2. **Restack the scan step into a single column** (fits `420`):
   - **QR is the primary path** — `enrol_qr` centered and prominent, near the top of the scan
     step.
   - **The 6-digit code input (`enrol.confirmation_code`) directly below the QR.**
   - Collapse `enrol_scan_row` / `enrol_scancol` from a two-column Box into a single vertical
     column (or inline the children directly into the step). Preserve every block id
     (`enrol_qr`, `enrol.confirmation_code`) so state paths and downstream refs stay intact —
     audit references before renaming anything.

3. **Manual key behind a default-collapsed disclosure.** Put `enrol_manual_key_label` +
   `enrol_manual_key` inside a collapsible disclosure ("Can't scan? Enter this key instead"),
   collapsed by default. Look up the correct block via `lowdefy_list_types blocks` /
   `lowdefy_get_schema` (e.g. a `Collapse`/`Accordion`-style block) — do not guess the type.

4. **Render the key in 4-char chunks.** When expanded, `enrol_manual_key` shows the 52-char
   base32 secret grouped into **13 chunks of 4 chars** as monospace pills that wrap cleanly.
   Keep it a **copyable `Paragraph`/block** (not a disabled `TextInput`). Keep the existing `_js`
   that extracts the base32 `secret` from the otpauth URI; add the chunking (e.g.
   `secret.match(/.{1,4}/g).join(' ')` for spaced chunks, or render each chunk as a styled
   monospace pill). The pills must wrap within the `420` card, not overflow.

5. **Enter-to-submit.** Add `onPressEnter` to `enrol.confirmation_code` running the **same
   action chain** as `enrol_confirm` (validate → TwoFactorVerify → session refresh). Confirm
   `TextInput` exposes `onPressEnter` via `lowdefy_get_schema`. Factor the chain to avoid
   drift — e.g. `_ref` a shared actions file, or keep both call sites identical.

Leave the password phase and the done phase untouched — they already stack fine at `420`; only
the scan row changes shape.

After editing: `lowdefy_build_status` → `lowdefy_get_page_config` (id `two-factor-enrol`) →
`lowdefy_screenshot_page` to confirm the single-column layout, the collapsed disclosure, and the
chunked key.

## Acceptance Criteria

- No `max_width` override remains on the page; it renders at `420`.
- Scan step is a single column: QR on top, code input below; the manual key is inside a
  default-collapsed "Can't scan?" disclosure and renders as spaced 4-char chunks that wrap
  inside the card. The key remains selectable/copyable.
- Pressing Enter in the code field runs the identical validate → verify → refresh chain as the
  Confirm button.
- `pnpm ldf:b` from `apps/demo` succeeds; `lowdefy_build_status` clean for `two-factor-enrol`.

## Files

- `modules/user-account/pages/two-factor-enrol.yaml` — modify — drop `560`; restack scan step;
  key disclosure + 4-char chunks; `onPressEnter` on confirmation code.

## Notes

- Auditing state refs when reshaping input blocks is mandatory — `enrol.confirmation_code`'s id
  is its state path, read by both the Validate and the TwoFactorVerify.
- The heading normalization pass (Task 8) will re-touch this file's `enrol_title`; don't
  restyle the title here beyond what the scan restack requires.

# Phase 2 — Account workspace (signed-in, `user-account`)

> **Depends on:** Phases 0, 1. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Profile tile

- [ ] Edit profile → `update-profile`; `user-contacts.profile` updated with a fresh change stamp (Compass)
- [ ] Re-denorm landed: `users` row's `profile` bag + top-level `name`/`image` updated (write-profile) (Compass)
- [ ] Header/avatar/menus reflect the change **without a reload** (`_user` refreshed via `UpdateSession`)

### Security tile

- [ ] Email shown with verified badge; resend verification appears when unverified
- [x] **Change password** shown (has credential + `emailAndPassword.enabled`) → `ChangePassword` — password change succeeds (confirmed working). ⚠️ the revoke-other-sessions toggle renders with no visible label → **F20**, and was left unticked, so "revoke-other-sessions works" is **not yet verified** (re-test once F20's caption is fixed); the Security tile also throws a non-blocking `_if` render error → **F15**
- [ ] Negative: for a **credential-less** user (OAuth/magic-link only) the password + 2FA controls are **hidden** (per-user credential read)
- [x] ~~**2FA enrol**: QR renders, confirm code, backup codes displayed~~ — pre-rework run: enrolment confirmed (`users.twoFactorEnabled: true`, one `user-two-factors` row, codes shown), but backup-codes **Copy was broken and could lose the one-time codes** → **F21**. **Superseded by the nested list below.**
- [x] **2FA disable** (`TwoFactorDisable`) — confirmed (`users.twoFactorEnabled: false`, `user-two-factors` row removed). Enrol-modal UX/visual issues → **F22**, now addressed below
- [ ] **2FA enrolment — reworked phased modal** (F21 + F22 a/b/c). Nothing here is provable by build alone: the reset that repopulates an invisible input and the `Validate` that reports success while checking nothing both compile perfectly. Needs a real authenticator app.
  - [ ] **First-time enrolment, on a freshly loaded page** — the **very first** `Set up` of the session, so nothing has written `enroltotp.*` before the trigger does (this is the case an `onOpen` seed would have rendered as an empty body). It opens straight on the password phase with a **complete screen and no empty first frame**, and no `choose` step
  - [ ] QR renders beside a **monospace manual key that copies**, and that key is a bare **base32 secret — not an `otpauth://` URI** (F22: it used to render the whole URI in a non-selectable disabled input)
  - [ ] A real TOTP code from an app set up by **that manual key** (not the QR) is accepted — proves the key is the right value
  - [ ] The codes grid renders **actual codes** (F21's outstanding re-confirmation — the state path was never live-verified)
  - [ ] **Done is disabled** on arrival; **Copy reports success and the modal STAYS OPEN** (F21: Copy used to be `cancelText` wired to `onClose`, so copying dismissed the dialog and discarded the codes)
  - [ ] Ticking "I've saved my backup codes" **enables Done**; Done closes the modal; the tile shows **On**
  - [ ] **State hygiene** (F22c) — after Done, `enroltotp.*` is empty in state; reopen and the **password field is blank**. This is the case that failed before: an `{}` reset cannot clear an input that was invisible in the previous eval cycle
  - [ ] **Abandon the password phase** — close, reopen: blank field, and the phase the caller's enrolment state calls for
  - [ ] **Abandon the scan phase** — close after Generate; the tile still reads **Off** and a fresh Generate issues a **new** secret
  - [ ] **"Confirm & enable" does NOT appear on the password phase** (F22b — it used to be the Modal's static `okText`, so it rendered in both phases and fired `TwoFactorVerify` with an empty code)
- [ ] **Replace authenticator** — with 2FA on, Manage opens on the password phase with the **warning `Alert`** before the password is spent; completing it makes the **new** secret work and the **old one fail**
- [ ] **Abandon a replacement mid-flow** — the single most dangerous transition in the change, and the reason the disable-first chain exists. With 2FA on: Manage → Replace → Generate → **close the modal**. The tile must read **Off**; signing out and back in must ask for a **password only, with no second-factor challenge**; then Set up again from the tile and confirm a fresh enrolment completes normally. _(Under the old bare `enable` this was the lockout: 2FA left enforced against a secret never scanned, with no admin 2FA reset anywhere in the suite — a DB fix.)_
- [ ] **Replace with a WRONG password** — takes the catch's `:else` branch: the password toast, the field **still holding what was typed**, and the tile unchanged on **On**. (The `:then` branch — `enable` failing _after_ `disable` committed — is hard to provoke on the rig; if it can be forced, the tile must drop to **Off** and the toast must say two-factor is now off rather than blaming the password.)
- [ ] **Passkeys**: register (`PasskeyRegister`, virtual authenticator), list (native read), delete (`PasskeyDelete`)
- [ ] **Linked accounts**: provider list from `user-accounts` (read-only, visibility not management)

### Sessions tile

- [~] Active sessions listed (created, expiry, IP, user-agent) — confirmed rendering (raw UA/IP → **F18**); **`token` absent** from the payload still needs a network-response check (not yet inspected)
- [x] "Sign out other sessions" (`RevokeOtherSessions`) → other rows gone from `user-sessions` (Compass), current session survives — confirmed: dropped from 2 rows to 1 (only the current session `537ac812` remains)

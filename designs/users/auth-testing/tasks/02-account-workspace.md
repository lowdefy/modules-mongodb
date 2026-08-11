# Phase 2 — Account workspace (signed-in, `user-account`)

> **Depends on:** Phases 0, 1. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Profile tile

- [x] Edit profile → `update-profile`; `user-contacts.profile` updated (name edit landed on the contact)
- [x] Re-denorm landed: the `users` row's `profile` bag + top-level `name`/`image` updated (write-profile) — confirmed `users.name: 'Admin Demo'` + image present after edit
- [x] Header/avatar/menus reflect the change **without a reload** (`_user` refreshed via `UpdateSession`) — profile + avatar update immediately, no reload

### Security tile

- [ ] Email shown with verified badge; resend verification appears when unverified
- [x] **Change password** shown (has credential + `emailAndPassword.enabled`) → `ChangePassword` succeeds; the revoke-other-sessions toggle renders **with a visible label** (F20) and, when ticked, actually drops the other `user-sessions` rows; the Security tile renders **without** the non-blocking `_if` render error (F15) — change password reported working (happy path); no render error observed. _(revoke-other-sessions toggle not separately exercised this run)_
- [ ] Negative: for a **credential-less** user (OAuth/magic-link only) the password + 2FA controls are **hidden** (per-user credential read)
- [ ] **2FA disable** (`TwoFactorDisable`) → `users.twoFactorEnabled: false`, the `user-two-factors` row removed (Verify in Compass)
- [~] **2FA enrolment — reworked phased modal** (F21 + F22 a/b/c). Nothing here is provable by build alone: the reset that repopulates an invisible input and the `Validate` that reports success while checking nothing both compile perfectly. Needs a real authenticator app. — **Happy-path TOTP enrolment completed successfully** (real authenticator, tile ends **On**). The F21/F22-specific regression sub-checks below were not individually walked this run.
  - [ ] **First-time enrolment, on a freshly loaded page** — the **very first** `Set up` of the session, so nothing has written `enroltotp.*` before the trigger does (this is the case an `onOpen` seed would have rendered as an empty body). It opens straight on the password phase with a **complete screen and no empty first frame**, and no `choose` step
  - [ ] QR renders beside a **monospace manual key that copies**, and that key is a bare **base32 secret — not an `otpauth://` URI** (F22: it used to render the whole URI in a non-selectable disabled input)
  - [ ] A real TOTP code from an app set up by **that manual key** (not the QR) is accepted — proves the key is the right value
  - [x] The codes grid renders **actual codes** (F21's outstanding re-confirmation — the state path was never live-verified) — **PASS in the Manage modal**: codes grid renders. _(Note: the separate **forced-enrol page** `two-factor-enrol.yaml` did NOT show codes during first enrolment → [F35](../findings/F35-totp-enrol-backup-codes-not-shown.md); the modal here is a different surface and works.)_
  - [~] **Done is disabled** on arrival; **Copy reports success and the modal STAYS OPEN** (F21: Copy used to be `cancelText` wired to `onClose`, so copying dismissed the dialog and discarded the codes) — Done confirmed **disabled until the checkbox is ticked**. _(Copy-stays-open not separately exercised this run)_
  - [x] Ticking "I've saved my backup codes" **enables Done**; Done closes the modal; the tile shows **On** — checkbox enables Done, confirmed in the Manage modal
  - [ ] **State hygiene** (F22c) — after Done, `enroltotp.*` is empty in state; reopen and the **password field is blank**. This is the case that failed before: an `{}` reset cannot clear an input that was invisible in the previous eval cycle
  - [ ] **Abandon the password phase** — close, reopen: blank field, and the phase the caller's enrolment state calls for
  - [ ] **Abandon the scan phase** — close after Generate; the tile still reads **Off** and a fresh Generate issues a **new** secret
  - [ ] **"Confirm & enable" does NOT appear on the password phase** (F22b — it used to be the Modal's static `okText`, so it rendered in both phases and fired `TwoFactorVerify` with an empty code)
- [~] **Regenerate backup codes** _(if the tile exposes a regenerate control)_ — regenerating issues a **fresh** `backupCodes` array on the `user-two-factors` row (Compass); the **old** codes stop working and a **new** one is accepted at the next challenge — regenerate via the Manage modal **displays a fresh codes grid** (checkbox + Done-disabled-until-checked). _(old-codes-stop-working / new-code-accepted-at-challenge not yet verified — needs a login challenge)_
- [ ] **Replace authenticator** — with 2FA on, Manage opens on the password phase with the **warning `Alert`** before the password is spent; completing it makes the **new** secret work and the **old one fail**
- [ ] **Abandon a replacement mid-flow** — the single most dangerous transition in the change, and the reason the disable-first chain exists. With 2FA on: Manage → Replace → Generate → **close the modal**. The tile must read **Off**; signing out and back in must ask for a **password only, with no second-factor challenge**; then Set up again from the tile and confirm a fresh enrolment completes normally. _(Under the old bare `enable` this was the lockout: 2FA left enforced against a secret never scanned, with no admin 2FA reset anywhere in the suite — a DB fix.)_
- [ ] **Replace with a WRONG password** — takes the catch's `:else` branch: the password toast, the field **still holding what was typed**, and the tile unchanged on **On**. (The `:then` branch — `enable` failing _after_ `disable` committed — is hard to provoke on the rig; if it can be forced, the tile must drop to **Off** and the toast must say two-factor is now off rather than blaming the password.)
- [~] **Passkeys**: register (`PasskeyRegister`, virtual authenticator), list (native read), delete (`PasskeyDelete`) — register works; **list renders** the registered passkey (display polish: raw `multiDevice`, casing, optional naming → **[F39](../findings/F39-security-tile-display-polish.md)**). **Delete of the last remaining 2FA method** (passkey was the only factor, `twoFactor.required`) triggers the engine endpoint gate mid-session: raw _"2FA is required to call '\<request_id\>'"_, page hangs in loading, then abrupt redirect to forced enrolment. Behaviour correct-by-design (can't drop your last factor while 2FA required) but UX rough → **[F34](../findings/F34-remove-last-2fa-method-ux.md)**
- [ ] **Linked accounts**: provider list from `user-accounts` (read-only, visibility not management)

### Sessions tile

- [ ] Active sessions listed (created, expiry, IP, user-agent); raw UA/IP presentation → **F18**; confirm **`token` is absent** from the payload (network-response check)
- [ ] "Sign out other sessions" (`RevokeOtherSessions`) → other rows gone from `user-sessions` (Compass), current session survives

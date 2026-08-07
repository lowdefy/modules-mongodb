# Findings — auth-testing campaign

A staging area for **design-worthy follow-ups** surfaced while running the campaign — issues
whose fix depends on a decision no one has made yet. **Bugs do not belong here:** a bug is
fixed directly and recorded as inline evidence on its checklist item. See the design's
[Finding lifecycle](../design.md#finding-lifecycle).

Each finding is one `F##-slug.md` file. IDs are **stable — never renumber** (they are cited
across other designs). New findings continue from **F31**. When a design takes a finding on,
move its file into a `_promoted/` subfolder and record the owning design in the table.

**Statuses:** `needs-design` · `investigate` (not yet root-caused) · `enhancement` ·
`promoted` · `closed`.

| F#                                                                   | Title                                                                                                             | Status         | Area                             | Promoted / closed to |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------- | -------------------- |
| [F2](./F2-login-resend-verification.md)                              | No resend-verification affordance for a locked-out unverified user                                                | `needs-design` | user-account / login             | —                    |
| [F10](./F10-mixed-login-ux.md)                                       | Mixed-deployment login UX: password form + magic-link button together is confusing                                | `enhancement`  | user-account / login             | —                    |
| [F12](./F12-dev-server-jit-hang.md)                                  | Dev-server JIT build hangs on the post-login navigation                                                           | `investigate`  | dev-server / tooling             | —                    |
| [F30](./F30-change-stamp-mql-literal.md)                             | Change stamp injected into MQL expression context unwrapped                                                       | `needs-design` | shared / change-stamps           | —                    |
| [F31](./F31-redirecting-to-signin-interstitial.md)                   | Unstyled "Redirecting to sign-in" interstitial shown mid-flow to a logged-in user                                 | `investigate`  | user-account / auth-flow         | —                    |
| [F32](./F32-auth-page-visual-polish.md)                              | Auth-page visual polish & card-width consistency (umbrella)                                                       | `needs-design` | layout / auth-page shell         | —                    |
| [F33](./F33-onboarding-updatesession-stale-redirect.md)              | Onboarding save doesn't refresh session before routing; guard bounces back to onboarding                          | `needs-design` | user-account / session-freshness | —                    |
| [F34](./F34-remove-last-2fa-method-ux.md)                            | Removing last 2FA method dumps user through raw endpoint-gate error into forced re-enrolment                      | `needs-design` | user-account / 2FA + auth-flow   | —                    |
| [F35](./F35-totp-enrol-backup-codes-not-shown.md)                    | Forced-enrol page completes TOTP without showing backup codes (Manage modal works; codes unseen/unrecoverable)    | `investigate`  | user-account / 2FA enrolment     | —                    |
| [F36](./F36-passkey-only-password-login-bypasses-2fa.md)             | ⚠️ **Security-critical:** passkey-only user bypasses 2FA on password sign-in (required-2FA defeated)              | `needs-design` | user-account / 2FA + auth        | —                    |
| [F37](./F37-backup-codes-do-not-verify.md)                           | ⚠️ Backup codes shown by the Manage modal don't verify at the 2FA challenge (recovery path broken)                | `investigate`  | user-account / 2FA               | —                    |
| [F38](./F38-trust-device-configurable.md)                            | Trust-device (30-day) should be configurable / disable-able by the deployment                                     | `enhancement`  | user-account / 2FA               | —                    |
| [F39](./F39-security-tile-display-polish.md)                         | Security-tile display polish: passkey rows (raw `multiDevice`, casing) + optional passkey naming                  | `enhancement`  | user-account / security tile     | —                    |
| [F40](./F40-verify-email-failure-silent-login-redirect.md)           | Invalid verify-email link (logged out) silently lands on bare login; designed expired view not reached            | `investigate`  | user-account / auth-flow         | —                    |
| [F41](./F41-magic-link-empty-email-no-validation-github-redirect.md) | Magic-link send has no email validation; empty-email submit shows check-your-email then redirects to a GitHub 404 | `investigate`  | user-account / magic-link        | —                    |
| [F42](./F42-wrong-password-toast-should-be-inline.md)                | Wrong-password login error is a transient toast; should be a persistent inline alert (toast too fast to read)     | `needs-design` | user-account / login             | —                    |
| [F43](./F43-reset-password-ignores-error-param.md)                   | Reset-password page ignores `?error=INVALID_TOKEN` on load (no notice); expired-token submit only toasts          | `needs-design` | user-account / password-reset    | —                    |

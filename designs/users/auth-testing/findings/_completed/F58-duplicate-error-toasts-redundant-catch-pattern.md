# F58 — Duplicate error toasts: `catch` blocks that re-toast an already-toasted failure

**Status:** `fixed` (clean batch landed in `05b80dcf`; the two passkey edge cases closed alongside the F55 verification pass) · **Area:** user-account (+ cross-cutting) / event error handling

On failure some event chains show **two error toasts** — first noticed on
`user-account/onboarding`. The cause is a `catch` that displays an error toast for an action whose
**own** default error toast was never suppressed. Lowdefy shows an error toast for any failing action
automatically; a `catch` that only re-toasts is redundant and doubles the message.

## Mechanism (confirmed against `@lowdefy/engine` source, pinned build `…20260813120102`)

In `@lowdefy/engine/dist/Actions.js`, `callAction` wraps each action: on throw it records the error,
**shows an error toast** (`displayMessage({ status: 'error', … })`, ~`:490`), **then re-throws**. The
re-throw propagates to `callActions` (~`:342`), which runs the `catch:` actions. So on any failure the
engine's toast fires _first_, and the `catch` runs _after_.

The toast is suppressed **only** by `messages.error: false` on the action (`displayMessage` guard
~`:517`: shown when `hideExplicitly && message !== false`). Two consequences:

- An action with no `messages.error: false` **always** toasts on failure — so "show an error message on
  failure" needs **no `catch` at all**; it is built in (and customisable via `messages.error`).
- `Validate` is not special here: `createValidate` throws a `UserError` (the validation summary), which
  the same path toasts unless the `Validate` sets `messages.error: false`. A `catch` fronted by an
  unsuppressed `Validate` therefore double-toasts on the **empty/invalid-field path** even if every
  other action in the `try` is suppressed.

**Duplicate = (a failing `try` action without `messages.error: false`) + (a `catch` that toasts and
does not `skip` that action's path).**

## Why a `catch` at all — the legitimate patterns

A `catch` earns its place only by doing something the default toast can't. All four correct shapes pair
with `messages.error: false` on the failing action wherever they don't want the engine's default:

1. **Recover UI state** — `SetState` to a distinct view or a _persistent inline Alert_ instead of a
   transient toast (`login.yaml` error-code → noaccess wall; `reset-password.yaml` INVALID_TOKEN →
   expired view).
2. **Silent fallback** — navigate / alternate path with **no** message (`check-action-click.yaml`,
   `events-timeline.yaml`: modal-open fails → just go to the page).
3. **Enumeration-safety** — show the _same success state_ on failure (`forgot-password.yaml`).
4. **One re-phrased toast** — suppress the default, show a single custom/conditional message
   (`signup.yaml` `_switch` on error code; `accept.yaml`; the BetterAuth-action path of
   `modal_enroltotp.yaml`). **This is the shape onboarding wanted but got wrong.**

**The rule (one correct way):**

- Want an error message? → do nothing, or set `messages.error` on the action. **No `catch`.**
- Message must vary/re-phrase? → `messages.error: false` on the action **+** one phrased `catch` toast.
- Failure must change state / navigate / stay silent? → `messages.error: false` (if no toast wanted)
  **+** a non-toast `catch`.
- On a `Validate`-fronted `try`: `skip` the `catch` on the validation-error path (so a bad field shows
  only its inline error / at most one validation toast), **and** `messages.error: false` on every other
  failing action.
- **Never** a `catch` whose only job is a toast while the action still shows its own.

## Audit — every `catch:` in `modules/` + `apps/{demo,tenant-demo}` (17 files)

### Duplicate-bug — fix required

| Site                                                | `catch`                         | Unsuppressed failing action                                         | When it double-toasts                                                    | Fix                                                              |
| --------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `user-account/pages/onboarding.yaml`                | `onboarding_error` @86          | `save_profile` (CallAPI) @71, `refresh_session` (UpdateSession) @80 | every non-validation save failure (catch skips only the `Validate` path) | add `messages: { error: false }` to both; keep the phrased catch |
| `user-account/components/view/modal_enroltotp.yaml` | `enroltotp_enable_error` @256   | `validate_enrol_password` (Validate) @228                           | empty required password (validation summary + catch)                     | `messages: { error: false }` on the Validate                     |
| `modal_enroltotp.yaml`                              | `enroltotp_replace_error` @338  | `validate_replace_password` (Validate) @283                         | empty password on replace                                                | `messages: { error: false }` on the Validate                     |
| `modal_enroltotp.yaml`                              | `enroltotp_getcodes_error` @415 | `validate_getcodes_password` (Validate) @385                        | empty password on new-codes                                              | `messages: { error: false }` on the Validate                     |

(The BetterAuth calls in `modal_enroltotp` — `TwoFactorEnable/Disable/GenerateBackupCodes` — all
correctly set `error: false`; only the three `Validate`s in front of them were missed. Optional polish:
also `skip` each catch on the validation path so a blank field shows just the inline error.)

### Needs-judgement — latent edge-path double-toast (trailing action fails after the primary succeeds)

| Site                                              | `catch`                       | Unsuppressed trailing action                 | Edge                                                                                                     |
| ------------------------------------------------- | ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `user-account/components/view/tile_security.yaml` | `passkey_register_error` @323 | `refetch_account` (Request, `_ref`)          | passkey registers, then refetch fails → engine toast + a now-false "Couldn't add a passkey…" catch toast |
| `user-account/pages/two-factor-enrol.yaml`        | `enrol_passkey_error` @207    | `enrol_passkey_session` (UpdateSession) @201 | passkey registers, then session refresh fails → same double + misleading message                         |

Primary paths (user cancels the WebAuthn prompt → `PasskeyRegister` fails, suppressed) are single-toast
and correct. Fix if the edge matters: `messages: { error: false }` on the trailing action, or move it
out of the `try` / `skip` the catch when the primary didn't error.

**Cross-cutting root:** the shared `user-account/.../refetch_account.yaml` Request carries no `messages`,
so it is unsuppressed wherever it rides inside a `try` — the source of both edge cases. Suppressing it at
the source would cover both.

### Correct (already suppress + purpose-built catch)

`magic-link-send.yaml` (@95, gold standard — suppressed Validate + catch skips the validation path),
`verify_totp.yaml` (@39), `verify_backup.yaml` (@39), `two-factor-enrol.yaml` `enrol_generate` (@152 —
no Validate; the empty password fails inside the suppressed `TwoFactorEnable`), `reset-password.yaml`
(@134), `forgot-password.yaml` (@90), `signup.yaml` (@222), `accept.yaml` (@299), `login.yaml` (@455),
`workflows/.../check-action-click.yaml` (@54), `events/.../events-timeline.yaml` (@83).

### Not applicable (no client toast possible)

`user-account/actions/confirm_enrol_totp.yaml` (no catch), `user-admin/components/invite_email.yaml`
(catch is non-toast `SetState`), `shared/contact/ensure-contact.yaml` (server routine `:catch:`, only
`:log:`).

## Fixed (build-verified, `apps/demo` + `apps/tenant-demo`)

- `onboarding.yaml` — `messages.error: false` on `save_profile` (CallAPI) and `refresh_session`
  (UpdateSession); the phrased catch is now the single failure toast.
- `modal_enroltotp.yaml` — `messages.error: false` on all three `Validate`s
  (`validate_enrol_password`, `validate_replace_password`, `validate_getcodes_password`); a blank
  required password now marks the field inline and toasts once via the catch instead of twice.

## Outstanding

None. The two **needs-judgement** passkey edge cases are closed with both halves of the suggested fix:

- `refetch_account.yaml` now carries `messages.error: false` at the source, so the shared trailing
  refetch never stacks a raw engine toast wherever it rides inside a `try` (the reads it hydrates stay
  stale until the next fetch — the chains' own catches remain the single failure surface).
- Both passkey catches (`tile_security.yaml` `passkey_register_error`, `two-factor-enrol.yaml`
  `enrol_passkey_error`) now `skip` when a `passkey_registered` state flag — reset at chain start, set
  right after `PasskeyRegister` succeeds — shows the failure came from the trailing step, killing the
  misleading "Couldn't add a passkey" toast after a successful registration (the success toast has
  already fired; on the enrol page the per-request gate reads the DB, so a reload still routes the
  enrolled caller home). `enrol_passkey_session` (`UpdateSession`) is suppressed the same way, making
  that edge a silent fallback rather than a raw toast.

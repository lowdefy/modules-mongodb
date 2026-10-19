# Task 7: Forced-enrolment page + `authPages.twoFactorEnrol` role (user-account)

## Context

`user-account` contributes the page the engine's `required`-enrolment enforcement redirects an
unenrolled caller to (Decision 6). It is in the `onboarding.yaml` mould — the `layout/auth-page` shell,
chrome-less — but three properties differ from every other auth page:

1. **Protected, not public** — the first auth page that is. The caller arrives holding a complete valid
   session, missing a factor, not an identity, so there is no bootstrap paradox. The engine marks it
   `public: false` and exempts it from the enrolment gate itself; the module's part is only to contribute
   the page under the `twoFactorEnrol` role and **not** add an `auth.public` entry for it.
2. **Self-sufficient on auth client actions** — an unenrolled caller is refused at every Lowdefy
   endpoint by the gate, so the page makes **no Lowdefy requests**. It is built from the `/api/auth/*`
   client actions `TwoFactorEnable`, `TwoFactorVerify`, `PasskeyRegister` — exactly the actions the
   self-service enrolment modal uses.
3. **Both TOTP and passkey enrolment, both reachable by every caller** — including a passwordless
   (OAuth-only / magic-link-only) member. Upstream sets `allowPasswordless: true` on the twoFactor
   plugin, so `/two-factor/enable` waives the password **per user** for anyone with no password
   credential while still enforcing it for a password user. The page therefore offers TOTP to all and
   needs **no signal** to tell a password caller from a passwordless one.

Reference the existing self-service flows for the exact client-action wiring:

- `modules/user-account/components/view/modal_enroltotp.yaml` — the `TwoFactorEnable` → QR/secret →
  `TwoFactorVerify` → backup-codes phased flow (password field, `enroltotp.uri`, `enroltotp.backup_codes`,
  the manual-key extraction `_js`, the copy-codes / codes-saved gating).
- `modules/user-account/components/view/tile_security.yaml` — the `PasskeyRegister` "Add passkey" action.
- `modules/user-account/pages/onboarding.yaml` — the `layout/auth-page` shell usage (protected auth page,
  `onInit`, submit chain, `Link home: true`).

## Interfaces

- **Consumes (upstream contracts):** client actions `TwoFactorEnable`, `TwoFactorVerify`,
  `PasskeyRegister`; `_user.twoFactorEnrolled` on the session; `layout/auth-page` component; the
  `allowPasswordless: true` plugin behaviour.
- **Produces:** page `two-factor-enrol` contributed under `authPages.twoFactorEnrol`.

## Task

**1. `modules/user-account/pages/two-factor-enrol.yaml`** — a `layout/auth-page` page (`id: two-factor-enrol`)
presenting both enrolment routes:

- A short lead explaining they must add a second factor to continue. **Copy must not imply a per-session
  challenge guarantee** — `required` is an enrolment floor; a password+passkey user can still sign in on
  the password alone (Global Constraints, Costs). Say "add a second factor", not "every sign-in will
  require it".
- **TOTP enrolment** built from the `modal_enroltotp.yaml` client-action flow (password →
  `TwoFactorEnable` → QR + manual secret → `TwoFactorVerify` → backup codes). Present the password field
  to everyone and let BetterAuth waive or enforce it (allowPasswordless); do not branch on caller type.
- **Passkey enrolment** presented alongside (a `PasskeyRegister` action), as an alternative any caller may
  prefer — not a passwordless-only fallback (Decision 5: a passkey independently satisfies `required`).
- **Completion:** read `_user.twoFactorEnrolled` to drive the done state — once the caller has enrolled
  either factor (after an `UpdateSession` so `_user` reflects it), offer "Continue" into the app
  (`Link home: true`). No Lowdefy request anywhere on the page.

**2. `modules/user-account/module.lowdefy.yaml`** — contribute the role and page:

- Add `- _ref: pages/two-factor-enrol.yaml` to the `pages:` `_build.array.concat` list (the static
  branch, beside `onboarding.yaml`).
- Add the role under `auth.pages`: `twoFactorEnrol: two-factor-enrol` (do **not** add it to
  `auth.public` — it is protected; the engine handles the gate exemption).
- Add an `exports.pages` entry:
  ```yaml
  - id: two-factor-enrol
    description: Forced two-factor enrolment (TOTP + passkey); the twoFactorEnrol authPages target.
  ```

## Acceptance Criteria

- Page exists, uses `layout/auth-page`, and issues **no** Lowdefy requests (no `requests:` / `Request`
  actions).
- Both TOTP and passkey enrolment are present and reachable without a caller-type signal.
- The page reads `_user.twoFactorEnrolled` for its completion/continue affordance and uses the name
  `twoFactorEnrolled` (never `twoFactorSatisfied`).
- Manifest contributes `authPages.twoFactorEnrol` (not `auth.public`) and exports the page.
- `pnpm ldf:b` compiles — but see the build gotcha in Notes.

## Files

- `modules/user-account/pages/two-factor-enrol.yaml` — create.
- `modules/user-account/module.lowdefy.yaml` — modify — page ref, `auth.pages.twoFactorEnrol`, export.

## Notes

- **Build gotcha (flag, don't route around):** the `acceptInvitation` role note in
  `module.lowdefy.yaml` records that `ldf:b` errors on an `authPages` role the build schema does not yet
  register, until the experimental engine release lands — accepted deliberately, and **not** worked
  around with a plain `auth.public` entry. `twoFactorEnrol` may behave identically if the engine version
  this repo builds against predates the role's build registration (design "What this consumes from
  upstream" lists it as engine-owned). If `ldf:b` errors on the unknown `twoFactorEnrol` role, treat it
  as the same accepted-pending state — do **not** substitute `auth.public`. Confirm against the engine
  version / `lowdefy-docs` MCP; if genuinely blocked, stop and report.
- **Decision 5 / Surface tension to flag:** Decision 5 names "the security tile" as the concrete
  `_user.twoFactorEnrolled` consumer, but the Surface list adds no `user-account` `tile_security` change,
  and that tile has no compliance-nag element today. This task consumes `_user.twoFactorEnrolled` where
  it concretely drives UI in the caller's session (this page's completion state). If a reviewer wants the
  self-service tile's 2FA display switched from `get_account.0.two_factor_enabled` to the enrolled fact,
  that is a small follow-up — raise it for `/r2:critique` rather than inventing the tile edit here.

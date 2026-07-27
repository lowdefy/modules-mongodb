# Task 3: Gate the signup page on password config; wire magic-link into signup

## Context

`modules/user-account/pages/signup.yaml` is already built (parent task 10). It
serves `authPages.signUp` and has two renders driven by `signup_view`
(`form` | `check`): an email/password registration form (name + password →
`SignUp`, gated on `_build.authConfig: emailAndPassword.enabled`), OAuth "signup"
buttons that dispatch through `Login`, and a "check your email" verification state
for `requireEmailVerification`.

The magic-link design (Decision 4) establishes the collapse rule concretely, and
it is **config-driven, not a redirect**:

- **Signup differs from login in exactly one place** — the password _registration_
  form. Every other method creates the account on first use (OAuth reuses `Login`
  on both pages; magic-link is one email → link action either way).
- **Passwordless** (`emailAndPassword.enabled: false`): no registration form exists,
  so signup ≡ login. The `signup` page is **not built at all** — there is no
  `/signup` route, no redirect, no thin forwarding page. `authPages.signUp` points
  at the `login` page instead.
- **Mixed / password-only** (`emailAndPassword.enabled: true`): the registration
  form makes `signup` a genuinely distinct page, so it **is** built and
  `authPages.signUp` points at it.

The mechanism is **one `_build.if` on `emailAndPassword.enabled` driving both the
page's existence and the role target**, so they cannot drift. This replaces the
earlier "redirect to login" idea — do not build a redirect.

Task 2 has already extracted the magic-link send affordance into a shared component
(`modules/user-account/components/magic-link-send.yaml`). This task `_ref`s that
**same** component into signup so a mixed deployment offers magic-link there too.

## Task

1. **Gate the `signup` page on `emailAndPassword.enabled` in the manifest.** In
   `modules/user-account/module.lowdefy.yaml`, the `pages:` list is currently a flat
   sequence including `- _ref: pages/signup.yaml`. Rebuild the `pages` value as a
   `_build.array.concat` whose **signup arm is `_build.if`-gated** on
   `_build.authConfig: emailAndPassword.enabled` — `[signup]` when password is on,
   `[]` when off — so a passwordless deployment never renders a distinct `/signup`.
   The other page refs (login, forgot-password, reset-password, verify-email,
   two-factor, accept, logout, view, onboarding) stay unconditional. Only `signup`
   is gated. Confirm the exact `_build.array.concat` / `_build.if` shape against the
   `lowdefy-docs` MCP (build operators) — do not guess the operator surface.

2. **Gate `authPages.signUp` on the same condition.** In the manifest's
   `authConfig.authPages` block (currently `signUp: signup`), make `signUp` resolve
   via a `_build.if` on the **same** `emailAndPassword.enabled` predicate: → `signup`
   when password is on, → `login` when off. Reuse the identical condition as step 1
   (ideally the same expression) so the page's existence and the role target cannot
   drift. `signIn: login` and `error: login` are unchanged.

3. **`_ref` the shared magic-link send affordance into signup**, gated on
   `magicLink.enabled`. Use the component task 2 created
   (`components/magic-link-send.yaml`), demoted below the "or" divider as an
   alternative-method button (peer of the OAuth buttons), exactly as it renders on
   the mixed login page — so `/signup` in a mixed deployment offers magic-link the
   same way `/login` does. Pass the alternative-method styling/label via `_ref`
   `vars`. This only ever renders in the mixed case (in passwordless the signup page
   is not built at all).

4. **Preserve the password path.** When `emailAndPassword.enabled` is true, the
   existing `SignUp` registration form, OAuth signup buttons, and `check`
   verification state must render exactly as today. The only additions to
   `signup.yaml` are the `_ref`'d magic-link send affordance (step 3).

## Acceptance Criteria

- Manifest `pages` gates the `signup` arm via `_build.array.concat` + `_build.if`
  on `emailAndPassword.enabled`; all other page refs stay unconditional.
- `authPages.signUp` resolves to `signup` when password is on and `login` when off,
  driven by the **same** condition as the page gate.
- `signup.yaml` `_ref`s the shared `magic-link-send` component (gated on
  `magicLink.enabled`), demoted below the divider — no duplicated send logic.
- Password-enabled config: the existing `SignUp` form, OAuth buttons, and `check`
  state render unchanged.
- `pnpm ldf:b` from `apps/demo` succeeds (password on there, so `signup` builds and
  the magic-link send appears on it).

## Files

- `modules/user-account/module.lowdefy.yaml` — modify — rebuild `pages` as a
  `_build.array.concat` with a `_build.if`-gated `signup` arm; gate
  `authConfig.authPages.signUp` on the same `emailAndPassword.enabled` condition
  (→ `signup` on / → `login` off).
- `modules/user-account/pages/signup.yaml` — modify — `_ref` the shared
  `components/magic-link-send.yaml` affordance (gated on `magicLink.enabled`,
  alternative-method placement); preserve the password registration + OAuth +
  `check` renders untouched.

## Notes

- **No redirect, no thin forwarding page.** The earlier design draft proposed
  redirecting `/signup` → `/login` in passwordless; the current design resolves it
  differently — the page is simply not assembled into `pages`, so the route does
  not exist. Do not add a redirect.
- Depends on task 2: the shared `magic-link-send` component must exist to `_ref`,
  and the login page must be the passwordless `authPages.signUp` target.
- The passwordless case (signup page absent, `authPages.signUp` → login) is
  build-verified by task 4's passwordless demo and inspected in task 6; the mixed
  case is build-verified by `apps/demo` here.
- Use the `lowdefy-docs` MCP (`/lowdefy-config`) for the `_build.array.concat` /
  `_build.if` operator shapes and the `authConfig`/`authPages` schema — never guess
  a build-operator form.

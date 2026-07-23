# Task 4: Add a passwordless demo consumer

## Context

Per the repo's **"always add a demo consumer"** rule (CLAUDE.md), every new
consumer-facing capability ships with a build-verified example in `apps/`. The
main demo (`apps/demo`) runs the **full method matrix** — `emailAndPassword`,
`magicLink`, `twoFactor`, `passkey`, and a Google provider all enabled — so that
every `_build.authConfig`-gated branch resolves and builds. That demo already
build-verifies the **mixed** magic-link branch (password + magic-link on one page).

What the main demo does **not** exercise is the **email-only passwordless shape**:
the login/signup pages only render email-only when
`_build.authConfig: emailAndPassword.enabled` is **false** at build time, which the
full-matrix demo can't produce without losing coverage of the password/2FA/passkey
branches. The magic-link design (Files changed) calls for **a passwordless
(`emailAndPassword` off, `magicLink` on) demo app config exercising send → verify →
onboarding**.

The repo already has a second, minimal app (`apps/workflows-test`) — a
`lowdefy.yaml` + `modules.yaml` + a few pages + `package.json` — establishing the
pattern for a small standalone demo app.

## Task

Add a **passwordless demo consumer** that build-verifies the email-only shape and
the send → verify → onboarding routing. Recommended shape: a new minimal app
(e.g. `apps/passwordless-demo`) modelled on `apps/workflows-test`:

1. **Auth config**: `auth.emailAndPassword.enabled: false`,
   `auth.magicLink.enabled: true` (with an `expiresIn`), a `pinned`
   `organizations` policy and org, `auth.email` connection, and the required
   `roles` / `userAdminRole` scaffolding — mirror `apps/demo/lowdefy.yaml`'s
   `auth:` block but with password **off**. No real secrets needed (`ldf:b` reads
   only the config projection; the build supplies a placeholder `NEXTAUTH_SECRET`).
2. **Modules**: wire the `user-account` module (and its dependencies — `layout`,
   `events`, and whatever the module manifest requires) the same way
   `apps/demo/modules.yaml` does. Reuse the demo's `user-account` vars where
   sensible (`fields.profile`, `providers` may be empty/omitted since no OAuth).
3. **Pages/router**: enough to resolve — the module contributes the auth pages and
   `pages.public`; add a minimal home/router page so the app builds and the
   onboarding route target exists.
4. **package.json + scripts**: give it the `ldf:b` build script so
   `pnpm --filter <name> ldf:b` works, matching `apps/workflows-test`.

If a full second app is judged too heavy, an acceptable lighter alternative is a
build-only config variant that still produces a real `.lowdefy/server/build`
artifact with `emailAndPassword` off — but it **must** be build-verifiable
(`ldf:b`) and exercise the email-only login + collapsed signup. State which
approach you took.

## Acceptance Criteria

- A passwordless consumer exists under `apps/` with `emailAndPassword.enabled:
false` and `magicLink.enabled: true`.
- `pnpm --filter <name> ldf:b` (or `pnpm ldf:b` from the app dir) succeeds — this
  is what build-verifies the manifest's passwordless branches (email-only login,
  absent signup page) that `apps/demo` (password on) cannot exercise.
- Inspecting the generated `.lowdefy/server/build/pages/**` for the login page
  confirms the **email-only** shape: no password field, no "Forgot?" link, no
  password submit; the magic-link send affordance and `link-sent` state present.
- **No `signup` page is emitted** in the passwordless build (Decision 4 / task 3:
  the manifest's `_build.if` drops the signup arm when `emailAndPassword.enabled` is
  false), and `authPages.signUp` resolves to the **login** page — confirm both in
  the generated artifacts.
- The onboarding page exists as the `newUserCallbackUrl` target.

## Files

- `apps/passwordless-demo/lowdefy.yaml` — create — passwordless `auth:` config +
  connections + modules/menus refs.
- `apps/passwordless-demo/modules.yaml` — create — `user-account` + dependency
  wiring.
- `apps/passwordless-demo/package.json` — create — `ldf:b` build script.
- `apps/passwordless-demo/pages/*`, `menus.yaml`, module vars — create — minimal
  scaffolding so the app builds.
- (Model all of the above on `apps/workflows-test/*` and `apps/demo/lowdefy.yaml`.)

## Notes

- Depends on tasks 2 and 3 (the login magic-link branch and signup collapse must
  exist for the artifacts to be meaningful).
- Do **not** flip `apps/demo` to passwordless — it must keep the full matrix so the
  password/2FA/passkey/OAuth branches stay build-verified. The two demos are
  complementary: `apps/demo` = mixed/full matrix, the new one = passwordless.
- No MongoDB or live server is needed — this is a build check only (CLAUDE.md:
  "a build check is not a smoke test"). e2e/live testing is a separate human /
  `/r:dev-test` step, out of scope here.
- The build-verification inspection (reading the generated artifacts) is also
  covered in task 6; doing a first pass here keeps the demo honest as you build it.

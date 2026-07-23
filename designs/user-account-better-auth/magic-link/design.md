# Magic-Link Sign-In for user-account

A sub-design of [user-account-better-auth](../design.md). The parent redesign made email/password the primary login method and left magic-link as a `_build.authConfig` enablement branch that renders nothing. This sub-design wires magic-link as a first-class, config-driven method so a deployment with `magicLink` enabled (and, in the migration case, `emailAndPassword` disabled) gets an email-only **passwordless** login and signup, with the emailed link's verification callback landing on the correct module pages.

## Proposed change

1. The login page stays method-driven off `_build.authConfig` (parent Decision 2): a password form when `emailAndPassword.enabled`, an email → "send me a link" affordance when `magicLink.enabled`. **Passwordless-primary is not a mode** — it is simply "password off, magic-link on": the page renders email-only, with no password field and no "Forgot?" link, because the config says so.
2. A **"check your email" result state** (with resend) handles the magic-link send. `sign-in/magic-link` returns `{ status: true }` and **no session**, so magic-link never navigates inline — a successful send flips the page to the sent state.
3. The emailed link's `GET /magic-link/verify` callbacks are wired to module pages: `callbackURL` → app home and `newUserCallbackURL` → **onboarding** are set on the send; the error destination is not — the engine defaults `errorCallbackUrl` to the `authPages.error` role (the login page) when the send omits it, so a verify failure lands there automatically, with `INVALID_TOKEN` added to the login error table as a friendly "this link has expired or was already used" message.
4. Sign-in and sign-up **collapse into one email → link action** for passwordless deployments: an unknown but admittable email creates the user at verify time (`emailVerified: true`) and routes to onboarding via `newUserCallbackURL`; a known email routes to the app. Admission is delegated to the engine's active-org policy (parent Decision 3), which now governs the magic-link flow **end-to-end**: the engine-tier **send gate** ([signup-admission-gate](../../../../lowdefy-design/designs/auth-upgrade/features/signup-admission-gate/design.md)) suppresses the link for an uninvited email — same uniform "check your email" response either way (no enumeration leak), no email sent — so it never reaches verify, and the engine **create gate** (a `user.create.before` veto ordered ahead of merge-on-signup) plus the `session.create.before` wall are the backstops. No orphan `user`/`contact` is created for an uninvited email. The only residual is a narrow stale-link race, which returns a raw 403 at verify (an accepted edge; see Decision 4).
5. Magic-link signup rides the **existing** `user.create.before` merge-on-signup binding (parent Decision 7) — no new hook. The one refinement: that binding must match on **verified email, provider-agnostic**, because a magic-link user is created with no OAuth or credential account row.
6. The security surface degrades correctly for passwordless with no new work: with no credential, the password and 2FA rows hide (the parent's per-user credential gate, Decision 5); passkeys, linked accounts, and sessions remain.

**Scope**: the same `pinned` active-org policy and single-app-instance model as the parent. Every engine piece this depends on is delivered: the `Login` action's magic-link dispatch and `magicLink.enabled` in `_build.authConfig`, magic-link email rendering ([auth-emails](../../../../lowdefy-design/designs/auth-upgrade/_completed/auth-emails/design.md)), the structured `newUserCallbackUrl` / `errorCallbackUrl` `Login` params ([magic-link-callbacks](../../../../lowdefy-design/designs/auth-upgrade/_completed/magic-link-callbacks/design.md)) with `errorCallbackUrl` further defaulting to `authPages.error` ([error-callback-default](../../../../lowdefy-design/designs/auth-upgrade/features/error-callback-default/design.md)), and the end-to-end admission enforcement — send gate and create gate — that keeps an uninvited email out of the flow ([signup-admission-gate](../../../../lowdefy-design/designs/auth-upgrade/features/signup-admission-gate/design.md)). The work here is module-side UX and callback wiring.

---

## Context

The parent module is passwordless-email login today (its Problem section), and the redesign pivoted to password-primary. For a deployment that is passwordless now, magic-link is not an add-on — it is the **migration path** that preserves the login method. That is the concrete need this sub-design serves; it is not a speculative "what if someone enables magic-link."

Verified behaviour of the pinned `magic-link@1.6.23` plugin, which shapes every decision below:

- `POST /sign-in/magic-link` sends the email and returns `{ status: true }`. No session is created at send time.
- The emailed link is `GET /magic-link/verify`, which branches on query params the caller sets when sending:
  - missing/expired/consumed token → redirect to `errorCallbackURL?error=INVALID_TOKEN` (falls back to `callbackURL` when `errorCallbackURL` is absent);
  - unknown email with `disableSignUp: false` → `internalAdapter.createUser({ …, emailVerified: true })`, `isNewUser = true`, then redirect to `newUserCallbackURL`;
  - known email → set `emailVerified` if needed, create session, redirect to `callbackURL`.
- `createUser` runs through `createWithHooks(data, "user", …)`, which fires **all** registered `user.create.before` / `after` hooks regardless of the creation path — so the merge-on-signup hook the parent already binds fires here too, at a point where the email is verified.

---

## Key decisions

### 1. Config-driven, not a passwordless mode

The login page renders whichever methods `_build.authConfig` reports enabled — this is the parent's Decision 2, extended to actually build the magic-link branch. Passwordless-primary falls out for free: a deployment with `emailAndPassword.enabled: false` and `magicLink.enabled: true` gets an email-only page because the password `_build.if` produces nothing and the magic-link branch produces the send affordance. There is no separate "passwordless" flag or page variant to maintain — one page, driven by config, is the "one correct way". OAuth and passkey buttons still render when their config is on, uniformly, so a passwordless deployment that also enables Google gets both.

**Composition when both methods are on (mixed deployment).** Magic-link is the only _alternative_ method that also needs the email address, so two things follow. First, the `email` input is **hoisted** into the always-present zone (gated on `emailAndPassword.enabled OR magicLink.enabled`) and is the single canonical field both the password submit and the magic-link send read — it is not owned by either method's branch, so a mixed deployment never renders two email fields (the shipped password form owns `id: email` today; a second magic-link email input would collide on that auto-bound state path). Second, magic-link takes the **primary** submit slot only when no password submit occupies it: in a passwordless deployment it is the primary action directly under the email input, and in a mixed deployment the password "Sign in" is primary while magic-link **demotes to an alternative-method button** — a peer of the OAuth and passkey buttons, below the "or" divider (placed first among them, being the closest to the password form's email). This keeps every method's rendering uniform and mirrors the parent's password-primary stance. See the login mocks — `mockups/screens/login-passwordless.html` (email-only) and `mockups/screens/login-mixed.html` (password + magic-link) — for the two config renders, each with its `signin` / `link-sent` / `expired-link` states; the password-only render is the parent's shipped `../../mockups/screens/login.html`.

### 2. The "check your email" state

Because the send returns `{ status: true }` and no session, the magic-link submit cannot navigate. It flips the page to a sent state — "We've emailed a sign-in link to {email}" — with a resend control (re-firing the same send) and a way back to the form. This is a genuinely new render alongside the parent's `signin` and `noaccess` states; it is driven by the same `login_view` state the parent already uses (a third value, e.g. `link-sent`). The password and OAuth paths are unchanged.

The resend control carries a **short cooldown** — the button is disabled for ~30–60s after each send — so a user can't tap through the magic-link plugin's send rate limit (5 requests / 60s, keyed per client IP on `/sign-in/magic-link`; `magic-link/index.mjs`). If a user still trips it (e.g. several clients behind one egress IP), the resulting 429 has no dedicated entry in the parent's error table and falls through to the `default` branch — a generic "please wait a moment and try again" — so the sent state degrades gracefully rather than dead-ending on an unhandled failure.

### 3. Callback wiring is the module's routing seam

The verify-callback destinations are how the server-side redirect re-enters the app. The module sets the two it owns as `Login`-action params when it sends — **structured targets** in Lowdefy casing, resolved like `callbackUrl` by the delivered `magic-link-callbacks` feature (the shared resolver, basePath-prefixed, open-redirect guarded; see Dependencies). So it passes module-scoped page targets, **not** hand-built path strings:

- `callbackUrl` → the app home (honoring an inbound `?callbackUrl=` the same way the parent's `Login` does),
- `newUserCallbackUrl` → the module's `onboarding` page — this is the clean "first-time user" signal; a magic-link user created at verify time lands on onboarding to complete their profile.

**The error destination is not set here.** The engine defaults `errorCallbackUrl` to the resolved `authPages.error` — which this module wires to the login page — whenever the send omits it ([error-callback-default](../../../../lowdefy-design/designs/auth-upgrade/features/error-callback-default/design.md)). So a verify failure (chiefly `INVALID_TOKEN`) lands on the login page carrying `?error=<code>` with no per-send param to remember — exactly as an OAuth failure reaches the same page via `onAPIError.errorURL` (parent Decision 5 / signup-admission-gate). The module relies on that default rather than re-declaring the error page it already owns as `authPages.error`; a per-send `errorCallbackUrl` override remains available but is unnecessary here.

Because these resolved targets — and the engine-defaulted `errorCallbackURL` — are module-scoped root-relative (basePath-prefixed) paths, they are same-origin, satisfying the `originCheck` the verify route runs on all three URLs (`magic-link/index.mjs`); an absolute off-site target would be rejected both by that check and by the resolver's open-redirect guard.

`INVALID_TOKEN` (expired/consumed link) is **retryable**, unlike the terminal `MEMBERSHIP_REQUIRED` / `EMAIL_NOT_VERIFIED` codes — the user still has access; the link just lapsed. So it must **not** render in the form-hiding `noaccess` state (where the email input and magic-link send are gated out and there is no way to request a new link), and must **not** inherit the `noaccess` default title "You don't have access to this app". Concretely: `onInit` maps `?error=INVALID_TOKEN` to `login_view: signin` — the email input and send affordance stay visible — and populates a **dedicated inline notice** state (`login_notice_title`/`login_notice_desc`, left null for every other code) that drives a separate `Alert` block rendered above the form, reading "This link has expired or was already used — request a new one below." A dedicated notice state is used rather than the existing `login_error_alert`, whose title defaults to "You don't have access to this app" on every load; reusing it would surface that alert on clean sign-ins. The terminal codes keep their `noaccess` full-page alert unchanged, and the `default` branch still covers any other/unmapped code (including a 429 rate-limit trip) with the generic message rather than a blank page.

**An uninvited email no longer reaches verify, so `errorCallbackURL` carries only the plugin's own failures.** The engine-tier **send gate** ([signup-admission-gate](../../../../lowdefy-design/designs/auth-upgrade/features/signup-admission-gate/design.md)) suppresses the link for any email that fails the active-org admission predicate, returning the same uniform `{ status: true }` — so an uninvited email never enters the create-at-verify flow, and the `errorCallbackURL` path handles only the verify route's own checks (chiefly `INVALID_TOKEN`). One narrow case still bypasses `errorCallbackURL`: the **stale-link race**, where an email admitted at send has its admission lapse within the link's ~5-min TTL. There the engine `session.create.before` wall (or, for a first-time invited user, the engine create gate) _throws_ during verify; the verify route only redirects to `errorCallbackURL` for its own route-local `redirectWithError` checks, and a thrown pre-session `APIError` unwinds _past_ that helper (BetterAuth's global handler converts a non-redirect `APIError` to an `errorCallbackURL` redirect only on the OAuth path) — so that race returns a raw 403, not the login render. Upstream accepts this as an edge: the send gate prevents the common uninvited case, the create gate prevents any orphan record, and the short TTL makes the race rare. Verified against `magic-link/index.mjs`, `db/with-hooks.mjs`, and the router `onError` in `api/index.mjs`. An invited user is admitted by the invitation carve-out (parent Decision 3), so their session is created and they route normally.

### 4. Signup collapses into sign-in for passwordless

In a passwordless deployment there is no separate credential to register, so "sign up" and "sign in" are the same action: enter your email, get a link. An unknown but admittable email is created at verify time and routed to onboarding. This means the passwordless login page **is** the signup page — a distinct `/signup` render is redundant. The send response is always the same `{ status: true }` / "check your email" (no "unknown email" leak), so enumeration is not leaked regardless of how admission is enforced; send rate-limiting is engine config (`rateLimit`), not module territory.

Admission itself is delegated to the engine's active-org policy (parent Decision 3), not re-implemented in the module — and that policy now governs the magic-link flow **end-to-end** ([signup-admission-gate](../../../../lowdefy-design/designs/auth-upgrade/features/signup-admission-gate/design.md)). The engine-tier **send gate** suppresses the link for an uninvited email so it never enters the create-at-verify flow; the engine **create gate** (a `user.create.before` veto ordered _ahead_ of the merge-on-signup hook) and the `session.create.before` wall are the backstops. So an uninvited email creates no `user` and — because the create gate runs before merge — no orphan `contact` either. The module does **not** gate admission inside its `sendMagicLink` email callback, which renders and delivers only. The one residual is the stale-link race (Decision 3): a raw 403 at verify, with no orphan record.

**Signup collapses onto login only when there is no password branch.** Signup differs from login in exactly one place — the password _registration_ form (name + password → `SignUp`). Every other method creates the account on first use, so it is identical between the two pages: OAuth already reuses `Login` on both, and magic-link is the one email → link action either way. So the rule is config-driven, mirroring Decision 1's "not a mode":

- **Passwordless** (`emailAndPassword.enabled: false`): no password branch exists, so signup ≡ login and the `signup` page is **not built at all**. The manifest assembles `pages` with a `_build.array.concat` whose signup arm is `_build.if`-gated on `emailAndPassword.enabled` — `[]` when password is off, `[signup]` when on — so a passwordless deployment never renders a distinct `/signup` (no redirect, no dead duplicate). The **role target cannot be gated the same way**: `_build.authConfig` is unavailable inside the manifest `auth:` block (it would read the auth-config projection that `authPages` is itself part of — a self-reference, rejected as `null`), and `_module.var` is banned in manifest headers — so no dynamic input inside the auth block can read `emailAndPassword.enabled`. The module therefore declares a **static** `authPages.signUp: signup` (the password-on target), and a **passwordless deployment repoints the role to `login` with an app-level `authPages.signUp` override** (app wins per role). This is _not_ drift-proof — a dangling role target passes the build and only 404s at runtime — so the passwordless override is mandatory app config, verified by the passwordless demo consumer (see Files changed), not an automatic consequence of the page gate. (Verified against `operators-js` `build/authConfig.js` and `buildModuleAuth.js`; the earlier "one `_build.if` drives both" framing was found unrealizable and corrected here.)
- **Mixed / password-only** (`emailAndPassword.enabled: true`): the registration form makes `signup` a genuinely distinct page, so it is built and `authPages.signUp` points at it.

The **magic-link send affordance is a shared component** `_ref`'d into both `login` and `signup`, gated on `magicLink.enabled`. So in a mixed deployment `/signup` offers magic-link as an alternative-method button exactly as `/login` does (demoted below the divider, per Decision 1) — one component, two references, no duplicated logic.

### 5. Merge-on-signup: existing binding already covers magic-link, one comment to correct

Because `createUser` fires `user.create.before` for magic-link creations too, the parent's merge-on-signup hook (Decision 7) already runs — it links or creates the contact and sets `profile.contactId` inline via `:return`, exactly as it does for OAuth, and the email is verified at that moment so linking is safe. **No new upstream ask.**

No logic change is needed. The hook's match condition lives in the **hook endpoint** `modules/user-account/api/link-contact-on-signup.yaml`, not in the shared `create-or-link-contact` fragment (the fragment upserts unconditionally on `lowercase_email` and carries no verified-email or provider gate). That guard already keys on **verified email alone, provider-agnostic**:

```yaml
- :if:
    _or:
      - _eq: [{ _payload: point }, email.verified]
      - _eq: [{ _payload: user.emailVerified }, true]
```

It never keys on `providerId` or account existence, so a magic-link create (`user.create.before` + `emailVerified: true`, no `account` row) already links inline — the "every user has a contact by first session" invariant already holds for magic-link. The parent's Decision 7 frames the binding as `email.verified` (email/password) + `user.create.before` (verified-provider OAuth); magic-link is simply another `user.create.before` + verified-email case the guard already admits. The only refinement is narrative: the endpoint's comment describes `user.create.before` as "verified-provider OAuth", which now under-describes the intent — correct it to "any create with a verified email (verified-provider OAuth _and_ magic-link)". This is a comment fix, not a logic widen.

**Do not touch the shared fragment's condition.** It is `_ref`'d verbatim by user-admin's invite flow, which calls it for invited contacts _before_ their email is verified; adding a verified-email gate there would break invites.

### 6. 2FA is moot for passwordless

The parent gates 2FA enrolment on holding a password credential (Decision 5, because `twoFactor.enable`/`disable` are password-gated). A passwordless user has no credential, so the 2FA row never shows and they can never enrol — which means the "does `magic-link/verify` honor a `twoFactorRedirect`" question does not arise for the target deployments. In a mixed deployment, a user who set a password + 2FA and _also_ uses magic-link is the only case where it could; that is recorded as a non-goal for this design (see below) rather than solved speculatively.

---

## Dependencies

Both platform features this design depends on are delivered; the module-side work here is their consumer.

### `Login` callback params — [magic-link-callbacks](../../../../lowdefy-design/designs/auth-upgrade/_completed/magic-link-callbacks/design.md)

`newUserCallbackUrl` and `errorCallbackUrl` are first-class **structured** `Login` params, resolved through the same shared resolver as `callbackUrl` (basePath-prefixed, open-redirect guarded). Magic-link routing (Decision 3) sets `newUserCallbackUrl: { pageId: 'onboarding' }` as a module-scoped structured target, in Lowdefy casing, exactly as it sets `callbackUrl`; it never hand-builds raw callback strings. (`errorCallbackUrl` is a first-class param too, but the module leaves it to the engine default — next section.) Without the `newUserCallbackUrl` param, a first-time user's verification would land on `callbackURL` (app home) instead of onboarding.

### End-to-end admission enforcement — [signup-admission-gate](../../../../lowdefy-design/designs/auth-upgrade/features/signup-admission-gate/design.md)

The active-org admission predicate now enforces **before** a user is created, across every pre-session flow. Two pieces bear on the magic-link path, both engine-tier and both reusing the _same_ predicate as the `session.create.before` wall (one source of truth):

- **Send gate** — a `hooks.before` on `/sign-in/magic-link` that dispatches a link only to an admittable email, always returning the uniform `{ status: true }` (no email sent, no token minted, no enumeration leak). This is the primary mechanism: an uninvited email never reaches verify, so no orphan is ever created. It lives in the engine, **not** the module's `sendMagicLink` callback (which renders and delivers only and must not carry authorization policy).
- **Create gate** — a `user.create.before` veto ordered _ahead_ of the merge-on-signup hook (Decision 5), so any create that does reach verify without admission is vetoed before a `contact` is linked — closing the orphan-`contact` window a session-tier wall structurally cannot reach.

The wall stays as the backstop for the existing-member revoked case. The one residual is the stale-link race (Decision 3): a `MEMBERSHIP_REQUIRED` throw at verify surfaces as a raw 403 rather than an `errorCallbackURL` redirect. Upstream accepts this edge — the gates prevent the common case and any orphan, and the ~5-min TTL makes the race rare — rather than adding a verify-route try/catch.

### Default error destination — [error-callback-default](../../../../lowdefy-design/designs/auth-upgrade/features/error-callback-default/design.md)

`signup-admission-gate` Decision 5 defaults `onAPIError.errorURL` to the resolved `authPages.error`, so **OAuth** and other _thrown_ redirect-style auth errors land on the login page without a per-action `errorCallbackUrl`. That default cannot reach the magic-link verify redirect, though: the verify route resolves its error destination from the request's own `errorCallbackURL` → `callbackURL` → `/` (`magic-link/index.mjs`, verified line 116) and throws a redirect that bypasses `onAPIError` entirely — so BetterAuth's own fallback would drop a verify error on the _success_ page.

`error-callback-default` closes that last gap on the client: `login()` defaults the magic-link (and social) `errorCallbackURL` to `${basePath}${authPages.error}` when the caller omits it, reading the resolved `authPages.error` already on the client. So the module **does not set `errorCallbackUrl`** on the send (Decision 3) — an expired `INVALID_TOKEN` link now lands on the login page by the same declare-once mechanism as OAuth, with a per-send override still available. `newUserCallbackUrl` keeps its explicit wiring (no page role defines a first-time-user destination to default from).

---

## Files changed (sketch)

- `pages/login.yaml` — add the magic-link send affordance (gated on `magicLink.enabled`), the `link-sent` result state + resend, and the email-only shape when `emailAndPassword.enabled` is false. Add `INVALID_TOKEN` to the error table and set `callbackUrl` + `newUserCallbackUrl` on the send (`errorCallbackUrl` is left to the engine default → `authPages.error`).
- `pages/signup.yaml` + manifest — the `signup` page is `_build.if`-gated on `emailAndPassword.enabled` in the manifest's `pages` `_build.array.concat` (not built in passwordless); `authPages.signUp` stays a **static** `signup` (the role can't read `_build.authConfig` inside the `auth:` block — self-reference), so a **passwordless app must override `authPages.signUp: login` at the app level** (the passwordless demo consumer does this). Add the shared magic-link send affordance (gated on `magicLink.enabled`) so a mixed deployment's signup offers it too.
- Merge-on-signup hook (`modules/user-account/api/link-contact-on-signup.yaml`, parent Decision 7) — the `user.create.before` guard already matches provider-agnostic verified email, so magic-link is already covered; correct only the stale "verified-provider OAuth" comment (no logic change, no shared-fragment change).
- Demo consumer — a passwordless (`emailAndPassword` off, `magicLink` on) demo app config exercising send → verify → onboarding, per the repo's "always add a demo consumer" rule.
- Docs — the module's login/how-to page notes the passwordless shape and the `magicLink.enabled` behaviour.

## Non-goals

- **2FA over magic-link** — moot for passwordless (credential-gated enrolment); the mixed-mode password+2FA+magic-link user is not handled in v1.
- **Magic-link as a second factor** — this design is sign-in/sign-up only, not step-up auth.
- Everything the parent lists as a non-goal (email change, account deletion, provider link/unlink, org switching, per-session revoke) carries over unchanged.

## Related

- [user-account-better-auth](../design.md) — the parent design; Decisions 2 (method-driven login), 3 (signup admission), 5 (credential gate), 7 (merge-on-signup) are the load-bearing context here.
- [auth-emails](../../../../lowdefy-design/designs/auth-upgrade/_completed/auth-emails/design.md) — renders and sends the magic-link email via the `auth.email` connection; delivered.
- [magic-link-callbacks](../../../../lowdefy-design/designs/auth-upgrade/_completed/magic-link-callbacks/design.md) — the structured `newUserCallbackUrl` / `errorCallbackUrl` `Login` params this design wires; delivered.
- [signup-admission-gate](../../../../lowdefy-design/designs/auth-upgrade/features/signup-admission-gate/design.md) — the send gate + create gate that enforce admission before user creation across all flows; delivered.
- [error-callback-default](../../../../lowdefy-design/designs/auth-upgrade/features/error-callback-default/design.md) — defaults `errorCallbackUrl` to `authPages.error`, so the module's send omits it and verify errors reach the login page automatically; delivered.

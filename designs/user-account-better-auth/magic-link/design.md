# Magic-Link Sign-In for user-account

A sub-design of [user-account-better-auth](../design.md). The parent redesign made email/password the primary login method and left magic-link as a `_build.authConfig` enablement branch that renders nothing. This sub-design wires magic-link as a first-class, config-driven method so a deployment with `magicLink` enabled (and, in the migration case, `emailAndPassword` disabled) gets an email-only **passwordless** login and signup, with the emailed link's verification callback landing on the correct module pages.

## Proposed change

1. The login page stays method-driven off `_build.authConfig` (parent Decision 2): a password form when `emailAndPassword.enabled`, an email → "send me a link" affordance when `magicLink.enabled`. **Passwordless-primary is not a mode** — it is simply "password off, magic-link on": the page renders email-only, with no password field and no "Forgot?" link, because the config says so.
2. A **"check your email" result state** (with resend) handles the magic-link send. `sign-in/magic-link` returns `{ status: true }` and **no session**, so magic-link never navigates inline — a successful send flips the page to the sent state.
3. The emailed link's `GET /magic-link/verify` callbacks are wired to module pages: `callbackURL` → app home, `newUserCallbackURL` → **onboarding**, `errorCallbackURL` → the login page (the `authPages.error` role), with `INVALID_TOKEN` added to the login error table as a friendly "this link has expired or was already used" message.
4. Sign-in and sign-up **collapse into one email → link action** for passwordless deployments: an unknown but admittable email creates the user at verify time (`emailVerified: true`) and routes to onboarding via `newUserCallbackURL`; a known email routes to the app. Admission is delegated to the engine's active-org policy (parent Decision 3), and the design asks that this policy govern the magic-link flow **end-to-end** — gating the send (uniform "check your email" response either way, so no enumeration leak) so an uninvited email never reaches verify, with the `session.create.before` hard wall as the backstop. This is platform/engine territory (§Upstream); until the send gate lands, an uninvited verify has the wall fire _after_ `createUser`, leaving an orphan `user`/`contact` and a raw 403 rather than the login render (see Decision 4).
5. Magic-link signup rides the **existing** `user.create.before` merge-on-signup binding (parent Decision 7) — no new hook. The one refinement: that binding must match on **verified email, provider-agnostic**, because a magic-link user is created with no OAuth or credential account row.
6. The security surface degrades correctly for passwordless with no new work: with no credential, the password and 2FA rows hide (the parent's per-user credential gate, Decision 5); passkeys, linked accounts, and sessions remain.

**Scope**: the same `pinned` active-org policy and single-app-instance model as the parent. The engine pieces this depends on — the `Login` action's magic-link dispatch, `magicLink.enabled` in `_build.authConfig`, and magic-link email rendering ([auth-emails](../../../../lowdefy-design/designs/auth-upgrade/_completed/auth-emails/design.md)) — are already delivered. The callback-routing params this design wires ([magic-link-callbacks](../../../../lowdefy-design/designs/auth-upgrade/features/magic-link-callbacks/design.md)) are designed upstream but not yet delivered. The work here is module-side UX and callback wiring.

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

### 2. The "check your email" state

Because the send returns `{ status: true }` and no session, the magic-link submit cannot navigate. It flips the page to a sent state — "We've emailed a sign-in link to {email}" — with a resend control (re-firing the same send) and a way back to the form. This is a genuinely new render alongside the parent's `signin` and `noaccess` states; it is driven by the same `login_view` state the parent already uses (a third value, e.g. `link-sent`). The password and OAuth paths are unchanged.

The resend control carries a **short cooldown** — the button is disabled for ~30–60s after each send — so a user can't tap through the magic-link plugin's send rate limit (5 requests / 60s, keyed per client IP on `/sign-in/magic-link`; `magic-link/index.mjs`). If a user still trips it (e.g. several clients behind one egress IP), the resulting 429 has no dedicated entry in the parent's error table and falls through to the `default` branch — a generic "please wait a moment and try again" — so the sent state degrades gracefully rather than dead-ending on an unhandled failure.

### 3. Callback wiring is the module's routing seam

The three verify-callback destinations are how the server-side redirect re-enters the app, so the module sets them as `Login`-action params when it sends. All three are **structured targets** in Lowdefy casing, resolved like `callbackUrl` — the `magic-link-callbacks` feature runs `newUserCallbackUrl` / `errorCallbackUrl` through the same shared resolver as `callbackUrl` (basePath-prefixed, open-redirect guarded; see §Upstream). So the module passes module-scoped page targets, **not** hand-built path strings:

- `callbackUrl` → the app home (honoring an inbound `?callbackUrl=` the same way the parent's `Login` does),
- `newUserCallbackUrl` → the module's `onboarding` page — this is the clean "first-time user" signal; a magic-link user created at verify time lands on onboarding to complete their profile,
- `errorCallbackUrl` → the login page (the `authPages.error` role), carrying `?error=<code>` for the **plugin's own** verify failures — `INVALID_TOKEN` (expired/consumed link) and any other code the verify route's `redirectWithError` emits.

Because the resolved targets are module-scoped root-relative paths, they are same-origin — which satisfies the `originCheck` the verify route runs on all three URLs (`magic-link/index.mjs`); an absolute off-site target would be rejected both by that check and by the resolver's open-redirect guard.

`INVALID_TOKEN` joins the parent's one error-code → message table (which already carries `MEMBERSHIP_REQUIRED`, `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_PASSWORD`, and a `default`). It maps to "this link has expired or was already used — request a new one." The `default` branch already covers any other code, so an unmapped magic-link failure degrades to the generic message rather than a blank page.

**The engine hard wall does _not_ reach `errorCallbackURL`.** A walled-out user (no member row, no pending invite) is rejected by the engine-tier `session.create.before` hook, which _throws_ `MEMBERSHIP_REQUIRED` during session creation. The verify route only redirects to `errorCallbackURL` for its own explicit checks (a route-local `redirectWithError`); a thrown pre-session error unwinds _past_ that helper, and BetterAuth's global handler does not convert a non-redirect `APIError` into an `errorCallbackURL` redirect (that path is OAuth-only). So the walled-out user lands on a raw 403, not the login render — verified against `magic-link/index.mjs`, `db/with-hooks.mjs`, and the router `onError` in `api/index.mjs`. Closing this is the design's real upstream ask (below). It only affects _uninvited_ users; an invited user is admitted by the invitation carve-out (parent Decision 3), so their session is created and they route normally.

### 4. Signup collapses into sign-in for passwordless

In a passwordless deployment there is no separate credential to register, so "sign up" and "sign in" are the same action: enter your email, get a link. An unknown but admittable email is created at verify time and routed to onboarding. This means the passwordless login page **is** the signup page — a distinct `/signup` render is redundant. The send response is always the same `{ status: true }` / "check your email" (no "unknown email" leak), so enumeration is not leaked regardless of how admission is enforced; send rate-limiting is engine config (`rateLimit`), not module territory.

Admission itself is delegated to the engine's active-org policy (parent Decision 3), not re-implemented in the module. The design's position is that this policy should govern the magic-link flow **end-to-end** — gating the send so an uninvited email never enters the create-at-verify flow, with the `session.create.before` hard wall as the backstop — and that this is platform/engine territory (the module does **not** gate admission inside its `sendMagicLink` email callback, which renders and delivers only). Today only the wall is wired, and it fires at `createSession` _after_ the verify route's `createUser`, so an uninvited verify leaves an orphan `user`/`contact` and lands on a raw 403 rather than the login render. Closing both is the design's upstream ask (§Upstream); until it lands, those are the known consequences for the _uninvited_ case (invited users are admitted by the invitation carve-out and route normally).

Open sub-question (below): whether the `authPages.signUp` role still points at a distinct page in mixed (password + magic-link) deployments, or whether both roles collapse onto the one config-driven page.

### 5. Merge-on-signup: existing binding, one refinement

Because `createUser` fires `user.create.before` for magic-link creations too, the parent's merge-on-signup hook (Decision 7) already runs — it links or creates the contact and sets `profile.contactId` inline via `:return`, exactly as it does for OAuth, and the email is verified at that moment so linking is safe. **No new upstream ask.**

The refinement: the hook must match on **verified email alone, provider-agnostic**. A magic-link user has no `account` row (no credential, no OAuth provider), so any logic that keys on "an OAuth account exists" or a specific `providerId` would skip magic-link users and break the "every user has a contact by first session" invariant. The parent's Decision 7 already frames the binding as `email.verified` (email/password) + `user.create.before` (verified-provider OAuth); this sub-design widens the `user.create.before` intent from "verified-provider OAuth" to "any create with a verified email", which magic-link satisfies. This is a spec clarification to the shared `create-or-link-contact` fragment's binding condition, not a new mechanism.

### 6. 2FA is moot for passwordless

The parent gates 2FA enrolment on holding a password credential (Decision 5, because `twoFactor.enable`/`disable` are password-gated). A passwordless user has no credential, so the 2FA row never shows and they can never enrol — which means the "does `magic-link/verify` honor a `twoFactorRedirect`" question does not arise for the target deployments. In a mixed deployment, a user who set a password + 2FA and _also_ uses magic-link is the only case where it could; that is recorded as a non-goal for this design (see below) rather than solved speculatively.

---

## Upstream

### Dependency: `Login` action `newUserCallbackUrl` / `errorCallbackUrl` params

Owned by the [magic-link-callbacks](../../../../lowdefy-design/designs/auth-upgrade/features/magic-link-callbacks/design.md) feature (designed upstream, not yet delivered). Magic-link routing (Decision 3) needs these two callbacks to reach `signInMagicLink`; without them every verification lands on `callbackURL` (`/`) — new users never reach onboarding and expired-link errors vanish with no code.

The upstream feature adds both as **first-class structured `Login` params**, resolved through the same shared resolver as `callbackUrl` (basePath-prefixed, open-redirect guarded). So this module sets them as **structured targets** — `newUserCallbackUrl: { pageId: 'onboarding' }`, `errorCallbackUrl` → the login page — in Lowdefy casing, exactly as it sets `callbackUrl`; it does **not** hand-build raw `newUserCallbackURL` strings. (The raw values do reach BetterAuth through `login()`'s `...rest` today — the enforced app-build `params` schema is `{}`, and `Login`/`login()` forward verbatim — but that raw passthrough is precisely the path the upstream feature replaces, since it skips target resolution, basePath prefixing, and the redirect guard.) This design's callback wiring depends on that feature landing.

### Ask: the magic-link flow must respect the active-org admission policy end-to-end

Admission is an engine-tier decision — the `session.create.before` hard wall owns the "pending invitation OR membership in the pinned org" predicate. Today that wall is the _only_ enforcement point on the magic-link path, and it fires at `createSession`, which the verify route reaches **after** `createUser`. Two consequences, both traced against the pinned source:

- **Orphan records.** An uninvited email that verifies has its `user` created (verify route `createUser`) — and, via the parent's `user.create.before` merge-on-signup hook (Decision 7), a `contact` too — _before_ the wall throws at `createSession`. The rejection leaves both rows behind for someone who can never sign in.
- **Raw 403, not the login render.** The thrown `APIError` unwinds past the verify route's own `redirectWithError` (invoked only for the plugin's explicit checks; `magic-link/index.mjs`), propagates uncaught through `createWithHooks` (`db/with-hooks.mjs` — only `result === false` yields `null`), and the router `onError` (`api/index.mjs`) returns it as an error response (the `errorURL` redirect path is OAuth-only). So the user hits a bare 403 instead of the login page's error table.

**The ask** (framed at the requirement level — the auth layer is still in flux, so the mechanism is the platform's to choose):

1. **Gate the send on the admission predicate.** The magic-link send should dispatch a link only to an admittable email, while always returning the same `{ status: true }` / "check your email" response (so nothing leaks — confirming a send still requires the target's inbox). This keeps uninvited emails out of the create-at-verify flow entirely, so no orphan `user`/`contact` is ever created. The gate must reuse the _same_ engine admission predicate as the wall (one source of truth), and it belongs in the platform/engine layer — **not** bolted onto the module's `sendMagicLink` email callback, which (like every other auth-email send callback) renders and delivers only and must not carry authorization policy.
2. **Route any residual verify-time rejection to `errorCallbackUrl`.** Even with the gate, a narrow race remains — admission lapses (invitation expires, membership revoked) within the link's ~5-min TTL. For that case the verify route should catch a pre-session `APIError` and route it through `redirectWithError(error.code)` to `errorCallbackURL`, exactly as it already does for `INVALID_TOKEN`, so the rejection reaches the login error table as `?error=MEMBERSHIP_REQUIRED` rather than a raw 403.

With the gate as the primary mechanism, the wall stays as the backstop and part 2 covers only the rare race. Record in the parent's `upstream-asks-2.md`.

---

## Files changed (sketch)

- `pages/login.yaml` — add the magic-link send affordance (gated on `magicLink.enabled`), the `link-sent` result state + resend, and the email-only shape when `emailAndPassword.enabled` is false. Add `INVALID_TOKEN` to the error table and set the three callback URLs on the send.
- `pages/signup.yaml` — resolve the collapse: in passwordless mode redirect to / reuse the login flow; confirm the `authPages.signUp` role wiring.
- Merge-on-signup fragment (shared `create-or-link-contact`, parent Decision 7) — widen the `user.create.before` match condition to provider-agnostic verified-email (spec note; no new file).
- Demo consumer — a passwordless (`emailAndPassword` off, `magicLink` on) demo app config exercising send → verify → onboarding, per the repo's "always add a demo consumer" rule.
- Docs — the module's login/how-to page notes the passwordless shape and the `magicLink.enabled` behaviour.

## Open questions

- **`authPages.signUp` in mixed deployments** — one config-driven page serving both `signIn` and `signUp` roles, or a distinct signup render when password is also enabled?
- **`verify-email` page** — magic-link users are auto-verified, so the verification flow is expected to be orthogonal for them; confirm there is no interaction (e.g. the resend-verification control in the security tile is simply irrelevant to a passwordless user, which the credential/verified state already handles).

## Non-goals

- **2FA over magic-link** — moot for passwordless (credential-gated enrolment); the mixed-mode password+2FA+magic-link user is not handled in v1.
- **Magic-link as a second factor** — this design is sign-in/sign-up only, not step-up auth.
- Everything the parent lists as a non-goal (email change, account deletion, provider link/unlink, org switching, per-session revoke) carries over unchanged.

## Related

- [user-account-better-auth](../design.md) — the parent design; Decisions 2 (method-driven login), 3 (signup admission), 5 (credential gate), 7 (merge-on-signup) are the load-bearing context here.
- [auth-emails](../../../../lowdefy-design/designs/auth-upgrade/_completed/auth-emails/design.md) — renders and sends the magic-link email via the `auth.email` connection; already delivered.

# Review 1

Scope: `designs/user-account-better-auth/magic-link/design.md` (the magic-link sub-design),
verified against the parent `design.md` + its three resolved reviews, the auth-upgrade
dependency designs (`engine`, `user-model`, `config-schema`), and — decisively — the
**installed pinned source**: `better-auth@1.6.23` (`dist/plugins/magic-link/index.mjs`,
`dist/db/{with-hooks,internal-adapter}.mjs`) and the Lowdefy engine
(`packages/plugins/actions/actions-core/src/actions/Login/Login.js`,
`packages/client/src/auth/createAuthMethods.js`).

The sub-design is well-argued and its reading of the magic-link plugin's verify branch is
accurate: `POST /sign-in/magic-link` returns `{ status: true }` and no session
(`index.mjs` send route), the verify route creates an unknown-email user with
`emailVerified: true` and `isNewUser=true`, and `createUser` runs through `createWithHooks`
so the merge-on-signup `user.create.before` hook fires here too — all confirmed against
source (Decisions 5, 6 hold). The findings below are one deferred question that is
resolvable now (and resolves the other way from what the design assumes), one real
correctness gap in the error-routing claim, and two implementation-shaping notes.

## Correctness

### 1. The "only platform gap" / upstream ask 7 is not needed — verified end-to-end in source, and it should be resolved in the design, not deferred

> **Resolved.** Passthrough confirmed against pinned source (`Login.js` forwards `params`
> verbatim; enforced app-build `params` schema is `{}`; client `login()` spreads `...rest`
> into `signInMagicLink`), so the finding's mechanism is correct. But the finding is now
> superseded: an upstream design, `auth-upgrade/features/magic-link-callbacks`, was written
> after this review and **owns** these two params — adding them as first-class **structured**
> `Login` params (`newUserCallbackUrl`/`errorCallbackUrl`, Lowdefy casing) resolved through the
> same shared resolver as `callbackUrl` (basePath, open-redirect guard), and explicitly
> rejecting the raw `...rest` passthrough this finding proposed relying on. So the resolution
> is not "delete the ask" but "the ask is real and now designed upstream": renamed the
> "Upstream ask" section to "Upstream dependency" referencing that feature (designed, not yet
> delivered), added it to the §Scope dependency list, and deleted Open Question 1. The module
> sets structured `{ pageId }` targets, not raw URL strings. Decision 3 still uses BetterAuth
> casing / raw-shape language — that cleanup is finding #3's scope.

The Upstream ask section (design lines 71–73) and Open Question 1 (line 87) leave open
"whether Lowdefy's action-param parsing forwards undeclared params," and propose recording
a `Login`-action ask 7 (`newUserCallbackURL` / `errorCallbackURL`) "if it proves
necessary." Per CLAUDE.md's "resolve the open question; don't defer it," this is knowable
now, and the whole chain forwards the two params with **no** upstream change:

- **The `Login` action has no schema that could strip params.** `Login.js:17–19` is
  `function Login({ methods: { login }, params }) { return login(params); }` — `params`
  is passed **verbatim**. The design's premise ("the action schema does not declare them …
  whether … undeclared params [are forwarded] is unconfirmed") rests on an action-level
  schema that does not exist.
- **The client `login()` captures both in `...rest`.** `createAuthMethods.js:92–101`
  destructures exactly `callbackUrl, captchaToken, email, magicLink, password,
phoneNumber, providerId, ...rest` — `newUserCallbackURL` / `errorCallbackURL` are not
  named, so they fall into `...rest`, which line 136 spreads:
  `auth.signInMagicLink({ email, callbackURL, ...rest, ...captchaOptions })`.
- **The plugin accepts and propagates them.** The `/sign-in/magic-link` body schema
  (`magic-link/index.mjs:21–23`) declares `callbackURL`, `errorCallbackURL`,
  `newUserCallbackURL`; the send route (`:73–75`) writes all three onto the verify link;
  the verify route (`:89–95`, `:115–121`, `:153`) honors them.

So the passthrough is proven. **Fix:** delete Open Question 1, drop the "record it as ask
7" hedge from the Upstream ask section, and state that the module sets `newUserCallbackURL`
/ `errorCallbackURL` as ordinary `Login`-action params that reach `signInMagicLink` through
`...rest` — no engine change. Correct the "the action currently declares …" sentence: the
param list is accurate but it is the client `login()` function's destructure, not an action
schema. This turns the sub-design's single claimed platform gap into "no gap."

### 2. The hard-wall `MEMBERSHIP_REQUIRED` does **not** reach `errorCallbackURL` for magic-link — it bypasses the plugin's redirect path

> **Resolved.** Confirmed against pinned source: the verify route's `redirectWithError`
> fires only for its explicit checks; a `session.create.before` throw propagates uncaught
> through `createWithHooks` (`db/with-hooks.mjs` — only `result === false` yields `null`);
> and the router `onError` (`api/index.mjs:191`) passes non-`FOUND` `APIError`s through as
> error responses (the `errorURL` redirect is OAuth-only). So a walled-out magic-link user
> gets a raw 403, not the login render — and only _uninvited_ users hit it (the invitation
> carve-out admits invited ones). Fixed the two overstated claims: Proposed-change §4's
> "exactly as a password signup does" now spells out the difference, and Decision 3 now scopes
> `errorCallbackURL` to the plugin's own codes plus a caveat that the hard wall doesn't reach
> it. Per the user's call, recorded closing the gap as the design's real upstream ask (new
> "Ask" under §Upstream: the verify route should catch a pre-session `APIError` and route it
> through `redirectWithError` to `errorCallbackURL`) — replacing the ask removed in #1.
> **Follow-on (post-review discussion):** the ask was broadened and merged into a single
> end-to-end "magic-link must respect the active-org admission policy" ask — (1) gate the send
> on the admission predicate (uniform response, prevents the orphan `user`/`contact` an
> uninvited verify would otherwise create) as the primary mechanism, and (2) this error-routing
> as the fallback for the narrow race where admission lapses within the token TTL. So the raw
> 403 is now a race-only edge case, not the primary path. Decision 4 rewritten accordingly.

Decision 4 (lines 53–55) asserts a walled-out user "hits `MEMBERSHIP_REQUIRED` after
verifying, exactly as a password signup does," and Decision 3 (lines 44–51) wires
`errorCallbackURL` → login page (`authPages.error`) so that code lands on the login error
table. The source shows this does not hold for the hard wall in the design's central case
(`disableSignUp: false`, admission decided at session time):

- The verify route's `redirectWithError` (`magic-link/index.mjs:117–119`) is a **route-local
  closure over a route-local `errorCallbackURL`** and is invoked only for the plugin's own
  explicit checks: `INVALID_TOKEN` (`:124`), `failed_to_create_user` (`:136`),
  `new_user_signup_disabled` (`:137`), `failed_to_create_session` (`:143`, on a _null_
  return).
- Session creation is `const session = await ctx.context.internalAdapter.createSession(...)`
  (`:142`) → `createWithHooks(data, "session", …)` (`internal-adapter.mjs:162,188`). The
  hard wall is the engine-tier `session.create.before` hook that, per user-model Decision 2
  (concepts/user-model/design.md:50), **"aborts session creation by throwing a BetterAuth
  `APIError`"** with `MEMBERSHIP_REQUIRED`.
- In `createWithHooks` a `before` hook that returns `false` yields `null`, but a hook that
  **throws** propagates (`with-hooks.mjs:16–18` — the throw is not caught). So
  `createSession` **throws**, `if (!session)` at `:143` never runs, and the exception
  unwinds _past_ the verify route — the route-local `errorCallbackURL` /`redirectWithError`
  never execute. The thrown `APIError` cannot carry the login page's `errorCallbackURL`,
  because that value lives nowhere the global router can see it.

For **password** signup this same rejection surfaces cleanly _inline_ on the `signIn.email`
response (user-model:50), which is why "exactly as a password signup does" is misleading —
the two paths differ precisely here. This is the load-bearing case for the migration
deployment (invite-only + passwordless, `disableSignUp: false`): an uninvited email gets a
link, verifies, is created, and then the hard wall fires — and the design promises the
friendly login render, which the plugin's own path will not produce.

**Fix:** resolve, don't assume, how a pre-session engine rejection (`MEMBERSHIP_REQUIRED`,
and any `session.create.before` throw) reaches the login page for magic-link. Either (a)
cite the concrete engine mechanism that converts that thrown `APIError` into an
`errorCallbackURL`-style redirect carrying `?error=MEMBERSHIP_REQUIRED` (a global
`onError`/redirect handler that reads the ambient request's `errorCallbackURL`), verified
against source as this design does elsewhere; or (b) if no such mechanism exists, record
that a walled-out magic-link user lands on a raw better-auth error response, not the login
render — and treat closing that as the sub-design's real upstream ask (replacing the
now-unnecessary ask in finding 1). user-model:50's "surfaces on the verification redirect
(error-callback style)" is the claim this rests on; the magic-link plugin source does not
by itself deliver it, so it must be traced or owned.

## Gaps

### 3. `newUserCallbackURL` / `errorCallbackURL` skip `resolveCallbackURL`, so the module owns their exact shape (basePath, no query fallback, same-origin)

> **Resolved (recommendation superseded).** The finding correctly describes _today's raw
> passthrough_, but that path is exactly what the `magic-link-callbacks` feature (finding #1)
> replaces: it runs both params through the same shared resolver as `callbackUrl` (basePath
> prefixing, open-redirect guard). So the module does the **opposite** of the finding's
> advice — it passes **structured `{ pageId }` targets** and lets the resolver handle
> basePath, rather than hand-building raw fully-formed paths (which would fight the resolver).
> Updated Decision 3 to structured targets + Lowdefy casing (`newUserCallbackUrl` /
> `errorCallbackUrl`) — also clearing the casing/shape cleanup deferred from #1 — and kept the
> finding's still-valid `originCheck` / same-origin point as the reason module-scoped
> root-relative targets are correct.

Because the two URLs travel through `...rest` (finding 1), they never pass through
`resolveCallbackURL` the way the `callbackUrl` action param does
(`createAuthMethods.js:102`). That function does three things the raw params will **not**
get: it resolves `{ home | pageId | url }` objects to a path, prepends `lowdefy.basePath`
(`:49–51`), and falls back to the inbound `?callbackUrl=` query when unset (`:55–61`). So
the module must supply `newUserCallbackURL` / `errorCallbackURL` as **fully-formed
root-relative page paths** (e.g. the scoped `/{entry}/onboarding`, `/{entry}/login`),
**including any deployment `basePath` itself**, not the object form the design's `callbackURL`
bullet (line 46) implies by analogy. Note too that the verify route runs `originCheck` on
all three URLs (`magic-link/index.mjs:87–96`), so they must be relative/same-origin —
module-scoped relative paths satisfy this. Add this to Decision 3 / the `pages/login.yaml`
Files-changed note so the implementer doesn't pass the `callbackUrl` object shape and get an
unprefixed or rejected redirect.

### 4. The "resend" control can trip the plugin's send rate limit, and that error isn't in the mapped set

> **Resolved.** Confirmed the plugin's limiter (`magic-link/index.mjs:157` — `window: 60`,
> `max: 5`, matching `/sign-in/magic-link` + `/magic-link/verify`). Refinement to the finding:
> the counter key is `` `${ip}|${path}` `` (`@better-auth/core/utils/ip.mjs`), so it's **per
> client IP, per path** — send and verify share the _rule_ but not the _counter_, so resend is
> 5 sends / 60s / IP. Added both fixes to Decision 2: a ~30–60s **resend cooldown** (keeps a
> normal user under the limit) and a note that a 429 falls through the error table's `default`
> branch (graceful degradation). Cross-user tripping is only possible behind a shared egress IP,
> or if the runtime resolves no trusted client IP (a global per-path fallback bucket) — a
> deployment/proxy concern, out of scope here.

Decision 2 (line 41) adds a resend control that "re-fir[es] the same send," and Decision 4
(line 55) correctly notes send rate-limiting is engine config. At the pinned version the
magic-link plugin registers its own limiter defaulting to **5 requests / 60 s** across
`/sign-in/magic-link` and `/magic-link/verify` (`magic-link/index.mjs` `rateLimit` block:
`window: opts.rateLimit?.window || 60`, `max: opts.rateLimit?.max || 5`). A user tapping
resend a few times hits it, and the resulting rate-limit error is not among the mapped codes
(only `INVALID_TOKEN` is added; the rest lean on `default`). Worth a resend cooldown on the
`link-sent` state (and/or confirming the rate-limit response degrades to a sensible
`default` message rather than an unhandled failure) so the new-state UX doesn't dead-end.

## Minor

### 5. Note that parent ask 6 (`PasskeySignIn`) has since landed upstream

> **Resolved.** Confirmed stale: `PasskeySignIn` is delivered (`_completed/passkey-sign-in/`,
> engine catalog), but the parent's `upstream-asks-2.md` ask 6 still read "not delivered."
> Flipped that status line to "delivered" with a pointer to the completed design. Left the
> deeper bookkeeping (relocating a now-delivered ask out of the outstanding-asks file) to the
> parent's own pass, per the finding's "belongs to the parent" framing. No change to the
> magic-link sub-design (which doesn't depend on passkey sign-in).

Not load-bearing for this sub-design (it does not depend on passkey sign-in), but for
consistency when the parent is next touched: `PasskeySignIn` now exists upstream —
`designs/.../auth-upgrade/_completed/passkey-sign-in/` and engine catalog line 157 — so the
parent's `upstream-asks-2.md` "not yet delivered" status is stale. Flagged here only because
this review traversed that tree; it belongs to the parent, not magic-link.

## Next Step

Run `/r:design-action-review user-account-better-auth/magic-link` to resolve, reject, or
defer each finding. Findings 1 and 2 are the substantive pair: 1 removes the design's only
claimed platform gap, and 2 may introduce the design's _actual_ one.

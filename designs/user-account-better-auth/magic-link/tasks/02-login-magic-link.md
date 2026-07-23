# Task 2: Add the magic-link method to the login page

## Context

`modules/user-account/pages/login.yaml` is already built (parent task 09). It is a
`layout` `auth-page` component with a single email/password form, OAuth buttons,
and a passkey button, all method-gated off `_build.authConfig`. It has two renders
driven by `login_view` state: `signin` (the form + methods) and `noaccess` (the
`authPages.error` redirect render — a full-page error alert that hides the form).
Errors map through **one code → message table**: password errors inline in the
submit `catch`, redirect-method (`?error=`) failures in `onInit`. Codes covered
today: `MEMBERSHIP_REQUIRED`, `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_PASSWORD`,
plus a `default`.

**There is currently no magic-link branch.** This task adds it (design Decisions
1–4). Magic-link is not a separate mode — it is "password off, magic-link on"
falling out of config gating (Decision 1). Verified plugin behaviour that shapes
this (`magic-link@1.6.23`, design Context):

- The send (`POST /sign-in/magic-link`) returns `{ status: true }` and **no
  session** — so the submit **cannot navigate**; it flips the page to a sent
  state. Dispatched through the one `Login` action (magic-link dispatch is
  **already delivered** upstream — confirm the exact param via the `lowdefy-docs`
  MCP / `Login` action schema; do not guess).
- The emailed link is `GET /magic-link/verify`, which redirects to the
  `callbackURL` / `newUserCallbackURL` / `errorCallbackURL` the send set.
- Send rate limit: **5 requests / 60s per client IP**.

## Task

Add the magic-link branch to `login.yaml` (extract sub-blocks into
`components/*` via `_ref` if nesting/reuse warrants it). All of the following are
gated so they appear **only** when `_build.authConfig: magicLink.enabled`.

1. **Send affordance + shared email input** (Decision 1). **Hoist the `email`
   input** out of the `emailAndPassword.enabled` `_build.if` block into the
   always-present zone, gated on `emailAndPassword.enabled OR magicLink.enabled`
   and visible in `signin`. It becomes the single canonical field that **both**
   the password submit and the magic-link send read — do **not** add a second
   email input in the magic-link branch (the shipped password form owns
   `id: email`, an auto-bound state path; a second input collides on it). The
   password block then holds only the password input, "Forgot?" link, and "Sign
   in" submit. Add a "send me a link" button (e.g. "Email me a sign-in link"),
   rendered whenever `magicLink.enabled`: as the **primary** action (solid, under
   the email input) when `emailAndPassword.enabled` is false, and as an
   **alternative-method button** (peer of the OAuth/passkey buttons, below the
   "or" divider, placed first among them) when the password submit occupies the
   primary slot. See the mocks `../mockups/screens/login-passwordless.html` and
   `../mockups/screens/login-mixed.html` for the two config renders (each with its
   `signin` / `link-sent` / `expired-link` states). The submit dispatches through the `Login`
   action with the magic-link parameter(s) (confirm via MCP) and the callback
   params below.

2. **Email-only passwordless shape** (Decision 1). When
   `_build.authConfig: emailAndPassword.enabled` is **false**, the page must render
   email-only: **no password field, no "Forgot?" link, no password submit**. Those
   three stay inside the `emailAndPassword.enabled` `_build.if`, so they fall away
   when it is false; the hoisted `email` input (item 1) remains because it is gated
   on `emailAndPassword.enabled OR magicLink.enabled`, and the magic-link send
   becomes the primary action. When `emailAndPassword.enabled` is true (mixed),
   both the password submit and the magic-link send appear off the one shared email
   input.

3. **`link-sent` result state** (Decision 2). Add a **third `login_view` value**
   (`link-sent`). On a successful send, `SetState` flips `login_view` to
   `link-sent` and stores the target email. Render a "check your email" result —
   "We've emailed a sign-in link to **{email}**" — with:
   - a **resend** control that re-fires the same send, carrying a **short cooldown**
     (button disabled ~30–60s after each send) so the user can't tap through the
     plugin's 5-req/60s IP limit. Implement the cooldown with page state + a timer
     (e.g. disable on click, re-enable via a delayed `SetState`); keep it simple.
   - a **way back to the form** (flip `login_view` back to `signin`).
     The `signin`/`noaccess` password and OAuth paths are unchanged. Gate every new
     block's `visible` on the appropriate `login_view` value, consistent with the
     existing blocks.

4. **Verify-callback params on the send** (Decision 3). Set all three as
   **structured targets in Lowdefy casing** on the `Login` send call — do **not**
   hand-build raw path strings:
   - `callbackUrl` → app home, honoring an inbound `?callbackUrl=` exactly as the
     existing password `Login` does.
   - `newUserCallbackUrl` → the module's onboarding page: `{ pageId: onboarding }`
     (or the equivalent `_module.pageId` structured form the resolver accepts).
   - `errorCallbackUrl` → this login page (the `authPages.error` role).
     These are resolved by the upstream **`magic-link-callbacks`** feature through
     the same shared resolver as `callbackUrl` (basePath-prefixed, open-redirect
     guarded). See the dependency note below.

5. **`INVALID_TOKEN` as a retryable inline notice** (Decision 3). An expired/consumed
   link redirects to `errorCallbackUrl` (this page) with `?error=INVALID_TOKEN`, so it
   arrives on the **`onInit` (`_url_query: error`) path**, not the inline `catch`.
   Unlike the terminal `MEMBERSHIP_REQUIRED` / `EMAIL_NOT_VERIFIED` codes,
   `INVALID_TOKEN` must render so the user **can request a new link**, and must not
   inherit the `noaccess` default title. Wire it concretely as:
   - In `onInit`, add an `INVALID_TOKEN` branch to the `login_view` switch that maps
     it to **`signin`** (not `noaccess`) — so the email input and magic-link send stay
     visible. The terminal codes keep mapping to `noaccess`.
   - Set two new state keys, `login_notice_title` / `login_notice_desc`, in `onInit`
     **only** for `INVALID_TOKEN` (null/absent for every other code and on a clean
     load): title "Link expired", description **"This link has expired or was already
     used — request a new one below."**
   - Add a new inline `Alert` block (e.g. `login_notice_alert`, type `warning`) among
     the always-present lead blocks, above the email input, `visible` when
     `_ne: [{ _state: login_notice_title }, null]`. Do **not** reuse the existing
     `login_error_alert` / `login_error_title` — that title defaults to "You don't have
     access to this app" on every load, so reusing it would surface the alert on clean
     sign-ins.

   Leave the `noaccess` render and the `default` branch (which still catches a 429
   rate-limit trip and any other unmapped code with the generic message) intact.

## Acceptance Criteria

- With `magicLink.enabled`, the send affordance renders in `signin`; a successful
  send flips to `link-sent` showing the target email, resend (with a working
  cooldown that disables the button), and a way back.
- With `emailAndPassword.enabled: false` + `magicLink.enabled: true`, the page is
  email-only: no password field, no "Forgot?" link, no password submit.
- With both enabled, password submit **and** magic-link send both render off one
  email input.
- The send sets `callbackUrl`, `newUserCallbackUrl` (→ onboarding), and
  `errorCallbackUrl` (→ login) as structured targets.
- `?error=INVALID_TOKEN` maps to the friendly "expired/already used — request a
  new one" message and leaves the send affordance reachable; the `default` branch
  still catches 429 and unmapped codes.
- No `TODO(request-substitute)` markers remain; `pnpm ldf:b` from `apps/demo`
  succeeds (the demo has `magicLink.enabled` and `emailAndPassword.enabled`, so the
  mixed branch builds — the email-only branch is build-verified by task 4).

## Files

- `modules/user-account/pages/login.yaml` — modify — add the magic-link send
  affordance (gated on `magicLink.enabled`), the `link-sent` view + resend with
  cooldown + back, confirm the email-only shape falls out of the existing
  `emailAndPassword.enabled` gate, add `INVALID_TOKEN` to the `onInit` error table,
  set the three callback params on the send.
- `modules/user-account/pages/components/*` — create (optional) — extract the
  `link-sent` result and/or send affordance via `_ref` if nesting exceeds ~3–4
  levels or the blocks are reused.

## Notes

- **Upstream dependency (not yet delivered): the `newUserCallbackUrl` /
  `errorCallbackUrl` `Login` params.** The magic-link **dispatch** and
  `magicLink.enabled` in `_build.authConfig` are delivered; the structured
  `newUserCallbackUrl` / `errorCallbackUrl` params are owned by the upstream
  `magic-link-callbacks` feature (`../../../../lowdefy-design/designs/auth-upgrade/features/magic-link-callbacks/design.md`),
  **designed but not yet delivered**. Wire them as the design specifies (structured
  targets). Confirm against the `Login` action schema via the `lowdefy-docs` MCP at
  implementation time: if the params are present, they resolve; the app-build
  `params` schema is `{}` and `Login`/`login()` forward extra params verbatim to
  BetterAuth, so a raw pass-through reaches the server even before the feature
  formally lands (it just skips resolver prefixing/guarding). Do **not** hand-build
  raw `newUserCallbackURL` strings as a workaround — the design explicitly rejects
  that path. If the MCP shows the params are unavailable and passthrough is
  rejected at build, flag it: without them, new users never reach onboarding and
  expired-link errors vanish.
- **Do not add admission gating to the send.** Gating the send on the active-org
  policy (so uninvited emails never reach verify) is the design's **upstream ask**
  (§Upstream) — platform/engine territory, explicitly **not** the module's job. The
  module's send renders and delivers only. The uniform `{ status: true }` /
  "check your email" response means no enumeration leak regardless. The known
  consequence until the gate lands (uninvited verify → orphan records + raw 403) is
  documented and accepted — do not try to solve it here.
- Use the `lowdefy-docs` MCP (`/lowdefy-config`) for the `Login` action schema, the
  `Result` block, and timer/cooldown patterns — never guess a type or prop.

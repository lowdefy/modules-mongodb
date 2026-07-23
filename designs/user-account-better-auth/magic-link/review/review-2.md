# Review 2

Scope: `designs/user-account-better-auth/magic-link/design.md`, re-verified against the
**pinned source** (`better-auth@1.6.23` `dist/plugins/magic-link/index.mjs`, Lowdefy client
`@lowdefy/client` `dist/auth/createAuthMethods.js`, `actions-core` `Login.js`) and — new
since review 1 — the **already-shipped module code** (`modules/user-account/pages/login.yaml`,
`modules/user-account/api/link-contact-on-signup.yaml`,
`modules/shared/contact/create-or-link-contact.yaml`) and this design's own **task files**
(`tasks/01`, `tasks/02`).

Review 1's findings are all resolved and hold up: the plugin's send/verify branches, the
`{ status: true }`/no-session send, and the `createUser` → `createWithHooks` hook-firing are
accurate. I additionally confirmed two mechanisms the design leans on but review 1 did not
trace to source:

- **The sent-state flip is sound.** `createAuthMethods.js:44–54` — the `magicLink === true`
  branch returns `unwrap(auth.signInMagicLink(...))` and, unlike the email/password
  (`:74–80`) and phone (`:68–71`) branches, does **not** call `window.location.assign`. So a
  successful send resolves with `{ status: true }` (no throw, no navigation), and the page's
  `try` branch can `SetState` `login_view: link-sent`. Decision 2 holds.
- **The three callbacks and the origin check are as described** (`index.mjs:73–75`,
  `:88–96`, `:115–121`, `:153`); `errorCallbackURL` falls back to `callbackURL` (not root)
  when absent (`:116`), matching the design's Context bullet.

The findings below are all **design-vs-reality drift**: on two points the design is now
stale relative to both the shipped source and its own downstream tasks, which caught the
issues the design text does not. Per CLAUDE.md ("designs are the source of truth"), the fix
is to bring `design.md` in line — cheap, but the design currently mis-describes a change in a
way that is actively wrong if taken literally.

## Correctness

### 1. Decision 5 / Files-changed point the merge-on-signup "widen" at the wrong file, and the change is already done

> **Resolved.** Rewrote Decision 5 and Files-changed to point at the hook endpoint `link-contact-on-signup.yaml` (not the shared fragment), state that its guard already matches provider-agnostic verified email so magic-link is already covered, scope the refinement to correcting the stale "verified-provider OAuth" comment (no logic change), and add an explicit "do not touch the shared fragment's condition" note (it would break user-admin's invite path). Design now matches `tasks/01`.

Decision 5 (lines 67–71) says the refinement "is a spec clarification to the **shared
`create-or-link-contact` fragment's binding condition**," and Files-changed (line 107) says
to "widen the `user.create.before` match condition" on "Merge-on-signup fragment (shared
`create-or-link-contact`)." Both are wrong about **where** the condition lives, and the
premise (a match condition needs widening) is false:

- **The match/binding condition is not in the shared fragment.**
  `modules/shared/contact/create-or-link-contact.yaml` has no verified-email or provider
  gate at all — it unconditionally upserts on `lowercase_email` (lines 35–69) and branches
  only on `binding_point` for the write-back mechanic. The verified-email gate lives in the
  **hook endpoint**, `modules/user-account/api/link-contact-on-signup.yaml:24–32`:
  ```yaml
  - :if:
      _or:
        - _eq: [{ _payload: point }, email.verified]
        - _eq: [{ _payload: user.emailVerified }, true]
  ```
- **That guard is already provider-agnostic and already covers magic-link.** It keys on
  `user.emailVerified == true` (or the `email.verified` firing point) — never on `providerId`
  or account existence — so a magic-link create (`user.create.before` + `emailVerified: true`,
  no `account` row) already links inline. No logic change is needed; only the file's
  narration comment ("verified-provider OAuth") under-describes the intent.
- **Taken literally, the design's instruction is harmful.** The shared fragment is `_ref`'d
  verbatim by user-admin's invite flow (parent Decisions 7/8), which calls it for invited
  contacts _before_ their email is verified. Adding an `emailVerified` gate to the shared
  fragment — which Files-changed line 107 directs — would break the invite path.

This design's own **`tasks/01`** already gets this right: it states "No mechanism change is
needed," targets the hook file, and scopes the work to comment wording. So the **design
contradicts its own task.** **Fix:** in Decision 5 and Files-changed line 107, relocate the
change to `modules/user-account/api/link-contact-on-signup.yaml`, state that its guard
already matches provider-agnostic verified email (so magic-link is already covered), and
scope the "refinement" to correcting the stale comment — not a logic widen, and not the
shared fragment.

## Gaps

### 2. Decision 3's `INVALID_TOKEN` handling under-specifies the render state, and "join the same table" lands it in a dead-end

> **Resolved.** Rewrote Decision 3's `INVALID_TOKEN` paragraph to specify a concrete retryable render (not a plain table entry): `onInit` maps `?error=INVALID_TOKEN` to `login_view: signin` so the send affordance stays reachable, and a dedicated `login_notice_title`/`login_notice_desc` state drives a separate inline `Alert` above the form ("This link has expired or was already used — request a new one below"). Chose a dedicated notice state over reusing `login_error_alert` because that alert's title defaults to "You don't have access" on every load. Baked the same concrete mechanism into `tasks/02` item 5 (removed its "signin-view-or-error-state" either/or) so the implementer isn't left to decide.

Decision 3 (line 55) says `INVALID_TOKEN` "joins the parent's one error-code → message
table (which already carries `MEMBERSHIP_REQUIRED`, `EMAIL_NOT_VERIFIED`, …)" and "maps to
'this link has expired or was already used — **request a new one**.'" The design treats this
as purely a message-text entry, but the login page's error mechanism has **two** dimensions,
and the design only addresses one:

- **Render state.** `login.yaml`'s `onInit` sets `login_view: noaccess` for **any** inbound
  `?error` (`:30–37`: `_if _ne(_url_query: error, null) then noaccess`). The `noaccess`
  render is a **form-hiding dead-end**: the email input, password form, OAuth, and passkey
  blocks are all gated `visible: _eq [_state: login_view, signin]`, so `noaccess` shows only
  the error alert plus the footer. There is no way to re-request a link.
- **Message text.** The `onInit` title switch (`:47`) defaults every non-`EMAIL_NOT_VERIFIED`
  code to **"You don't have access to this app"** — actively wrong for an expired link (the
  user _does_ have access; the link just lapsed).

The other two named codes (`MEMBERSHIP_REQUIRED`, `EMAIL_NOT_VERIFIED`) are genuinely
terminal, so `noaccess` fits them. `INVALID_TOKEN` is **retryable**, so "join the same
table" the way they do contradicts the design's own "request a new one" promise. Again
`tasks/02` (item 5) already caught this — it explicitly requires `INVALID_TOKEN` to render
"so the user can request a new link … not the form-hiding `noaccess` block." **Fix:** in
Decision 3, specify that `INVALID_TOKEN` (unlike the terminal codes) renders in an actionable
state that keeps the magic-link send affordance reachable, rather than describing it as an
ordinary table entry alongside `MEMBERSHIP_REQUIRED`.

### 3. Mixed-mode login form composition (password + magic-link) is unspecified

> **Resolved.** Added a "Composition when both methods are on" paragraph to Decision 1: the `email` input is hoisted into the always-present zone (gated `emailAndPassword.enabled OR magicLink.enabled`) as the single canonical field both the password submit and magic-link send read (no duplicate `id: email`), and magic-link takes the primary slot only when no password submit does — primary in passwordless, an alternative-method button (peer of OAuth/passkey, below the "or" divider) in mixed. Validated the passwordless / mixed / password-only renders with a new mock (`mockups/screens/login-magic-link.html`) and referenced it from the design. Updated `tasks/02` items 1 and 2 to the hoisted-shared-input mechanism (replacing the earlier "whichever branch owns the email input" conditional-ownership wording).

Decision 1 says the page renders whichever methods config enables and that "OAuth and
passkey buttons still render … uniformly," but it never says how the **password form and the
magic-link send affordance coexist on one page** when both `emailAndPassword.enabled` and
`magicLink.enabled` are true. The concrete question is the email input: the shipped password
form owns `id: email` (`login.yaml:98`), so a naively-added magic-link branch would produce a
**second** email field in mixed deployments. `tasks/02` (item 1) resolves this ("Reuse the
existing `email` input where the password form is also present … when the password form is
absent, the magic-link branch owns the email input"), but the design records no such
decision. **Fix:** add a sentence to Decision 1 (or Decision 4) stating that in a mixed
deployment the password and magic-link paths share the one email input, and the magic-link
send is a secondary action alongside the password submit — so the design, not just the task,
carries the composition decision.

## Next Step

Run `/r:design-action-review user-account-better-auth/magic-link` to resolve, reject, or
defer each finding. All three are design-text corrections that align `design.md` with the
verified source and the already-authored tasks; #1 is the one that is actively misleading (it
directs an edit to a shared file that would break user-admin's invite flow).

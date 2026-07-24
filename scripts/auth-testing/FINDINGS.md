# Auth testing — design change requests

Bigger design / architecture changes surfaced while stepping through
[`CHECKLIST.md`](./CHECKLIST.md).

Small blockers and doc fixes are applied to the files directly (not tracked here).
Test-run bugs and unexpected states go in `CHECKLIST.md`'s "Notes / issues found".

**Legend:** `[ ]` open · `[x]` done · `[~]` deferred/needs discussion
Items are numbered `F1`, `F2`, … for reference (stable IDs — don't renumber).

---

- [~] **F1 — Login error-code mapping degrades to the generic default; root cause is a
  platform `get` bug, not the module.** On the login page
  (`modules/user-account/pages/login.yaml`), the `onClick.catch` maps
  `login_do.error.cause.code` through `_switch` tables to a friendly
  title/description/toast. Observed at runtime, every code falls to `default`:
  `INVALID_EMAIL_OR_PASSWORD` shows "Something went wrong…" instead of "Incorrect email
  or password", and `EMAIL_NOT_VERIFIED` shows a generic toast with no `noaccess`
  render. **Root cause confirmed via live repro + source trace:** the module accessor
  `login_do.error.cause.code` is _correct_ — the `Login` error is an `ActionError` whose
  `cause` carries the BetterAuth `.code`. But `@lowdefy/helpers` `get` refuses to
  descend into a non-plain object: `type.isObject(error)` is `false`, so its traversal
  halts _at_ the error and any read one level inside it (`.error.cause.code`,
  `.error.message`) returns the default. `_actions: login_do.error` returns the whole
  object (with `.cause.code` present); `_actions: login_do.error.cause.code` returns
  `null`. This is a platform bug affecting any config reading a nested field off a thrown
  action/request error, so the fix is upstream — no module change needed once it lands.
  **Design:**
  [`../../../lowdefy-design/designs/get-nested-object-reads/design.md`](../../../lowdefy-design/designs/get-nested-object-reads/design.md)
  (broaden `get`'s descent predicate; coordinates with `helpers-modernization` task 06).
  NB: a toast for `INVALID_EMAIL_OR_PASSWORD` is by-design (only the wall codes get the
  in-place alert); the bug was the _copy_. The `?error=` redirect path (`_url_query:
error`) reads a plain string, so it is unaffected — only the inline action-error path
  breaks. (Separate, non-bug observation during repro: a browser/password-manager
  autofill can set the password field without firing `onChange`, so `_state: password`
  stays `null` and the request 400s with `VALIDATION_ERROR` before any credential check
  — manual typing commits normally.)

- [ ] **F2 — No resend-verification affordance for a locked-out unverified user.** A user
      who signed up, lost/missed the verification email, and later returns to **log in**
      hits `EMAIL_NOT_VERIFIED`. The login page's intended `noaccess` alert copy is "Check
      your inbox for the verification link, then sign in again" — a **dead end** if the
      email is gone: `SendVerificationEmail` resend buttons live only on `signup.yaml` and
      `verify-email.yaml`, which a returning user has no obvious route back to. Checklist
      line 66 explicitly calls for "EMAIL_NOT_VERIFIED (**with resend affordance**)". Add a
      resend button (→ `SendVerificationEmail` for the entered email) to the login page's
      unverified state, or route the user to `verify-email` with the email prefilled.
      (Independent of F1 — stands even once the alert renders.)

- [ ] **F3 — Merge-on-signup creates the contact with an EMPTY email; breaks
      link-by-email + risks unique-index collision.** After email/password signup + verify,
      the `email.verified` hook creates the `user-contacts` row (system context) but writes
      `lowercase_email: ''` and `email: null` instead of the verified address
      (`admin@demo.test`). Verified in the DB. **Same root cause as F4** — a server error
      at verify time (`SERVER_ERROR: UpdateUserProfile requires a "userId" property.` at
      `@lowdefy/plugin-better-auth/dist/steps/UpdateUserProfile.js:38`, via
      `handleAuthStep → runRoutine → controlIf`). **Affects BOTH merge paths, confirmed via
      magic-link test:** a magic-link signup (`magic@demo.test`) went through the
      `user.create.before` branch (not `email.verified`) and _still_ produced a contact
      with `lowercase_email: ''`. So the empty email is **not** a quirk of the
      `email.verified` payload — the verified email fails to reach the shared
      `create-or-link-contact` upsert on **either** binding. (b) **The collision has now
      materialized, not just risked:** because both the admin signup and the magic-link
      signup keyed the upsert on `lowercase_email: ''`, the magic-link create **matched
      admin's pre-existing bare contact** and linked `magic@demo.test`'s
      `user.profile.contactId` to it — **two users now share one contact** (`aa320f44…`),
      violating one-user-per-contact. (Only reason the partial-unique index hasn't fired:
      admin's `user.profile.contactId` never got set, per F4.) Decision 7 is explicit the
      fragment must write the lowercased verified email when present and **omit** the field
      when absent (never `''`/`null`). Module's flagship endpoint — **high priority**.
      (c) **Data corruption compounds:** completing onboarding as `magic@demo.test` wrote
      that profile (`given_name: M`, `name: "M L"`) onto the **shared** contact `aa320f44…`
      — i.e. onto admin's contact record. So two identities' profiles now collide on one
      contact. Every symptom traces to the empty `lowercase_email` key.

- [ ] **F4 — `users.profile.contactId` is never linked after verification (no `profile`
      bag on the user).** Post-verify, the `users` doc carries no `profile` object at all,
      so `profile.contactId` (and `profile.profile_created`) are unset — checklist line 59
      ("profile.contactId linked on the user (hook)") fails. The `email.verified` path is
      supposed to write `profile.contactId` back via the `UpdateUserProfile` step
      (user-account Decision 7, "synthetic post-write" branch). **CONFIRMED via server
      error** `UpdateUserProfile requires a "userId" property.` (`UpdateUserProfile.js:38`)
      thrown at verify time — the step is invoked without a `userId`, so the link-back
      never runs and (per halt-on-first-error) the routine aborts. **CONFIRMED isolated to
      the `email.verified` (password) branch:** the magic-link test proved the
      `user.create.before` branch sets `profile.contactId` **inline via `:return`** fine —
      `magic@demo.test`'s user row got `profile.contactId` set (to the wrong contact, per
      F3, but set). So F4 is specifically the `email.verified` step invocation missing its
      `userId` arg; the OAuth/magic-link `user.create.before` path does not hit it. Fixing
      the `userId` mapping on the `email.verified` branch resolves F4 (F3's empty-email is
      separate and broader — see F3). Knock-on: `_user.profile.profile_created` (Decision 5)
      never resolves for password signups.

- [x] **F5** Incorrect finding

- [ ] **F6 — Signup captures first/last name, but the design routes name capture to
      onboarding.** `signup.yaml` renders `profile.first_name` + `profile.last_name` and
      passes `name` (first + last) to `SignUp`, so BetterAuth writes `users.name` ("A D").
      But user-account Decision 7 says the merge-on-signup contact create is **bare** ("no
      name copied from the signup/OAuth payload… so first login routes through
      onboarding"), and onboarding (Decision 5) owns canonical profile capture. Net today:
      the typed name lands only on `users.name`, never reaches the **contact** (the profile
      source of truth), and onboarding will ask for first/last name **again** — double
      entry, and `users.name` gets overwritten by the onboarding re-denorm anyway. Decide:
      (a) drop name from signup to match the design (pure email+password → onboarding), or
      (b) flow the signup-captured name into the contact profile and prefill/skip
      onboarding's name step. (Separate from F3/F4; surfaced because it made `users.name`
      inconsistent with the empty contact.)
      **Direction (user, 2026-07-24): option (a) — remove first/last name from the signup
      page.** Confirmed at retest that the signup-captured name does **not** prefill
      onboarding (fields came up blank), so keeping it on signup buys nothing but double
      entry. Signup should be pure email+password; onboarding owns name capture.

- [ ] **F7 — `_nunjucks` error on the user-admin `view` remove-modal title — root cause
      found: the `| trim` filter is unavailable in runtime `_nunjucks` (see F23).**
      `modules/user-admin/components/view/modal_remove.yaml:9` has
      `template: "Remove {{ name }} from {{ app | trim }} User Admin?"`. **Confirmed via
      live `lowdefy_eval_operator`:** the identical template with `| trim` removed parses and
      renders fine (`"Remove Jane from  Demo  User Admin?"`), while with `| trim` it throws
      `_nunjucks failed to parse`. So this is **not** about the live data context — it's the
      unsupported `trim` filter (same class as F21's `join`). **This is a real crash of the
      Remove-from-app modal** (its title fails to render). Fix: drop `| trim` (the `app_title`
      var is already clean) or trim the value with a Lowdefy operator in the `on` binding.
      Rolls up under **F23**.

- [x] **F8 — Demo router linked not-onboarded users to the retired `new` page (→ 404 on
      onboarding completion). FIXED.** `apps/demo/pages/router.yaml:26` (the app's
      `homePageId: router` entry) routed a user with `profile.profile_created != true` to
      `_module.pageId: { module: user-account, id: new }`. The redesign **retired `new` →
      `onboarding`** (module ships only `pages/onboarding.yaml`), so `id: new` resolved to a
      non-existent page → **404**. Confirmed as the "onboarding links to 404 on completion"
      symptom: onboarding's `enter_app` does `Link { home: true }` → router; if the `new`
      branch is taken (session-refresh lag after `UpdateSession`, or the flag not yet on
      `_user`), the user hits the dead `new` page. **Applied directly:** `id: new` →
      `id: onboarding`. Build stays green. (Not the cause of the earlier JIT-build hang —
      that was transient dev-server weirdness.)

- [ ] **F9 — Avatar picker looks unpolished (aesthetic).** The user avatar picker (the
      `profile-avatar` control shown on onboarding and the profile edit modal) reads as
      visually rough — needs a design pass. Low priority / cosmetic. TODO: attach a
      screenshot and specifics (spacing, sizing, color-swatch layout?) so the fix is
      actionable rather than "looks like rubbish".
      ![](../../Screenshot%202026-07-24%20at%2011.54.30.png)

- [ ] **F11 — Login on a direct visit (no `?callbackUrl=`) succeeds but never navigates —
      dead form, no feedback.** `Login` on the submit relies on the action itself navigating
      to the `?callbackUrl=` that an unauthenticated-page redirect sets
      (`modules/user-account/pages/login.yaml` ~L251–255 comment; there is no explicit `Link`
      on the happy path). Reaching `/user-account/login` **directly** (bookmark, typed URL,
      the signup footer, etc.) means no `callbackUrl`, so a successful sign-in mints a session
      and then does nothing visible — the user sits on the same form. **Confirmed:** two
      clicks minted two `user-sessions` rows for `admin@demo.test` with zero navigation;
      manually visiting `/` then routed correctly to onboarding. Two gaps to close:
      (a) default the post-login target to `/` (the router, which then resolves
      onboarding/home) when `callbackUrl` is absent, so login always lands somewhere; and
      (b) an **already-authenticated** visitor to `/login` should be bounced by the router
      rather than shown a live (and now no-op) sign-in form. (Distinct from F1, which is the
      error-mapping path; this is the success path.)

- [ ] **F10 — Mixed-deployment login UX: password form + magic-link button together is
      confusing (enhancement).** In the mixed config (`emailAndPassword` + `magicLink` both
      on), the login page shows the full password form _and_ a magic-link button below the
      "or" divider (the shipped composition — parent Decision 1: password primary,
      magic-link demoted). In testing this read as cluttered/ambiguous — two sign-in
      mechanisms competing for attention, unclear which to use. **Proposed alternative
      (method-first, progressive disclosure):** show only the **email input** + two method
      buttons ("Email me a link" and "Use password"); clicking **Use password** reveals the
      password field (+ submit + "Forgot?") and hides the other method buttons; a "back"
      affordance returns to the method choice. This keeps the passwordless-primary and
      password-only renders clean too (one method → no chooser). NB: this reworks parent
      Decision 1's "email hoisted, magic-link as an alternative-method button" layout — so
      it's a **design change to reconcile with the parent design**, not just a CSS tweak.
      Needs a design/product call; check it doesn't regress the OAuth/passkey button
      placement (they're peers below the divider today).

- [ ] **F12 — Dev-server JIT build hangs on the post-login navigation.** Twice on 2026-07-24,
      immediately after a successful login redirect, the destination page stuck on the
      "building page" JIT screen and never resolved; **opening the same URL in a new tab
      cleared it every time**. Presents as a dev-server build/HMR stall on the navigation
      that follows sign-in, not a module-config fault (builds are green throughout). Left
      uninvestigated by request — recorded so the fix batch can decide whether it's a
      tooling/dev-server issue to escalate upstream or a symptom of how the auth flow triggers
      navigation. (Same class as the transient JIT hang seen earlier while diagnosing F8.)

- [ ] **F13 — Onboarding profile fields should be configurable (required / optional /
      hidden), not hard-required.** Today onboarding's `fields.profile` (first/last name,
      etc.) are required, and `profile.profile_created` gates entry to the app — so every
      consumer must collect the same fields to get past onboarding. Add config (a module
      var, likely alongside the existing profile-field config) so a deployment can mark each
      onboarding field **required**, **optional**, or **hidden** — including hiding the whole
      step for apps that don't want to collect a name up front. **Default stays required**
      (fine for this deployment's use case); this is about giving consumers the escape hatch,
      not changing the default. Pairs with F6 (once name is dropped from signup, onboarding
      is the single place name is captured — so its configurability matters more). Needs a
      design note on how `profile_created` is satisfied when all fields are optional/hidden
      (mark complete on first visit vs. require an explicit continue).

- [ ] **F14 — Avatar selection is never persisted: no `profile.picture` is ever produced,
      so the header avatar always falls back to the default icon.** The whole avatar chain
      the header depends on is `state.profile.picture` → `update-profile` API →
      `write-profile` merges it onto the contact and re-denorms it to `users.image`
      (`modules/shared/contact/write-profile.yaml:104`, `image: _step:
reread_contact.profile.picture`) → header reads `_user.image`
      (`components/profile-avatar.yaml`, `components/user-avatar.yaml`). **But nothing ever
      produces `profile.picture`.** In onboarding (`pages/onboarding.yaml`) the avatar is only
      a live CSS-gradient preview: the "Change colour" button cycles a top-level
      `avatar_color_index` state key (seeded in `onInit`, L27/L82–107) that is **(a)** not
      under `state.profile`, so it's excluded from the `payload.profile: _state: profile`
      save (L172–175), and **(b)** never converted into a stored `picture` SVG. A repo-wide
      grep for `picture` finds only _readers_ (user-avatar, profile-avatar, write-profile) —
      no generator anywhere. Confirmed against the DB after a full onboarding submit: the
      contact + user `profile` bags have every typed field but **no `picture`/`image`**, and
      the header shows the fallback icon. Net: the avatar feature is non-functional
      end-to-end — the colour choice is ephemeral and no image is stored. Fix needs to
      (1) generate the gradient+initial SVG (from initials + the chosen `avatar_colors`
      entry) and (2) write it into `state.profile.picture` (or the save payload) so
      write-profile can denorm it. **Distinct from F9** (which is the picker's _aesthetics_);
      F14 is that its output is never saved. Also update the stale claim in
      `user-avatar.yaml:12-14` that "any user … already has a generated gradient+initial SVG
      stored in profile.picture" — currently untrue.

- [ ] **F15 — `_if` now rejects a non-boolean `test`, breaking every profile update from
      `/user-account/view` (and the 2FA tile render).** On this experimental build
      (`0.0.0-experimental-20260723141834`) the `_if` operator strictly requires `test` to
      be a boolean and throws otherwise (`Operator "_if" param "test" must be type
"boolean"`). Multiple module sites pass a possibly-`null`/`undefined` value straight
      into `test:`, relying on old truthy/falsy coercion:
      • `modules/user-account/api/update-profile.yaml:49` — `test: _payload:
set_profile_created`; **any** save that doesn't pass the flag (i.e. every non-onboarding
      profile edit) sends `null` → the write routine throws and **no profile update lands**.
      • `modules/user-account/components/view/tile_security.yaml:176` — `test: _request:
get_account.0.two_factor_enabled`; `null`/absent for a user without 2FA → the Security
      tile throws on render.
      These are the two confirmed during this run; the same `_if test: <raw value>` pattern
      almost certainly recurs elsewhere across the modules — **audit repo-wide**. Decision for
      the fix batch: treat as a **platform regression** (restore truthy coercion / clearer
      error) vs. **module fix** (wrap every such test in explicit boolean coercion, e.g.
      `_eq: [<value>, true]` or `_ne: [<value>, null]`). Possibly the same "stricter operator
      type handling in this experimental build" theme as F1 (which is a `get` regression) —
      worth checking they trace to one upstream change. **Blocks all `/user-account/view`
      profile editing until resolved.** Severity differs by site: the `update-profile.yaml`
      instance is inside the write routine, so it **aborts the profile save** (nothing lands);
      the `tile_security.yaml:176` instance is a **render**-time throw on the Security tile —
      logged as a client `ConfigError` but **non-blocking**: change-password and logout from
      that tile still succeed (confirmed this run). It also re-fires whenever the Security
      tile re-renders (e.g. after the change-password modal submits). So the audit should
      classify each `_if test:` site as write-blocking vs. render-noise.

- [ ] **F16 — Card action buttons render primary-tinted; wireframe specifies the default
      (untinted) button type.** On `/user-account/view` the buttons inside the tile cards
      (e.g. the Security tile's Manage / Set up / Disable, and peers) appear in the primary
      colour, whereas the mockup shows them as the neutral **default** Button type — primary
      should be reserved for the page's main action, not every card control. Adjust the
      Button `variant`/`color` on the card actions to the default (untinted) treatment to
      match the wireframe. Cosmetic / low-risk, but repo-wide across the view tiles.

- [ ] **F17 — User avatar was dropped from the `/user-account/view` header because the
      shared page-title component doesn't render it.** The implementing agent chose not to
      edit the shared `page_title` component (reasonable — it's cross-module surface), so the
      signed-in user's avatar is no longer rendered in the page header here, and by extension
      isn't shown consistently everywhere the shared header appears. Decide where the avatar
      belongs: extend the shared page-title/header component to render the user avatar (so it
      appears uniformly across pages, the "one correct way"), or add a sanctioned avatar slot
      the pages opt into. Pairs with F14 (even once the header renders an avatar, F14 means
      there's no stored `profile.picture` to show yet). Needs a design call on the shared
      header contract.

- [ ] **F18 — Active-sessions list shows the raw User-Agent string and bare IP instead of
      the humanised form in the mockups.** The Sessions surface renders e.g.
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)
Chrome/150.0.0.0 Safari/537.36` / `127.0.0.1 · expires 2026-07-31` verbatim, whereas
      the mockups show a friendlier rendering (parsed browser + OS, e.g. "Chrome on macOS",
      and a nicer location/time treatment). Add a User-Agent parse + presentation layer for
      the session rows (browser/OS/device from the UA, tidy IP/expiry copy) to match the
      mockup. Applies to both the account workspace Sessions tile and the user-admin `view`
      Security tile if they share the rendering.

- [ ] **F19 — Onboarding completion doesn't navigate — the user is stranded on the
      onboarding page after a successful save (same symptom as F11, different mechanism).**
      On submit, `pages/onboarding.yaml`'s `enter_app` step does `Link { home: true }`
      (L178–181) after `save_profile` + `refresh_session`. The save lands (profile written +
      `profile_created: true`, confirmed in the DB) but the page **does not navigate** — it
      stays on onboarding, exactly like the login no-op. Unlike **F11** (login relies on an
      absent `?callbackUrl=`), onboarding uses `Link home: true`, which targets the app's
      `homePageId` (router) unconditionally, so a plain missing-callback explanation doesn't
      cover it. Candidate causes to disambiguate in the fix: (a) `UpdateSession`
      (`refresh_session`) not resolving before the `Link`, so the client stalls; (b) the same
      post-auth dev-server JIT/HMR stall as **F12** (opening the destination in a new tab
      cleared that) masking or causing the non-navigation; or (c) a genuine `Link home: true`
      failure in this shell. Confirmed reachable another way: manually visiting `/`
      post-submit routes correctly to home (profile_created is set), so it's specifically the
      in-flow `enter_app` navigation that fails. Group with F11/F12 — likely one underlying
      post-auth navigation problem, but recorded separately so the fix batch verifies the
      onboarding path explicitly rather than assuming F11's fix covers it.

- [ ] **F20 — Change-password modal's "sign out other sessions" toggle renders with no
      visible label.** `modules/user-account/components/view/modal_changepw.yaml:55` —
      `changepw.revoke_other_sessions` (a `CheckboxSwitch`) sets `properties.title: "Sign out
my other sessions"` **and** `label.disabled: true`. For `CheckboxSwitch` the caption
      shown _next to the toggle_ is `properties.description` (schema: "Text to display next to
      the checkbox"); `properties.title` renders in the field-label area, which
      `label.disabled: true` then hides — so the control shows a bare switch with no text. Fix:
      move the copy to `properties.description: "Sign out my other sessions"` (drop the
      `label.disabled`/`title` combo), matching how `CheckboxSwitch` captions are meant to be
      set. Small UI defect. (Worth a quick repo-wide check for other `CheckboxSwitch` blocks
      using `title` + `label.disabled` and hitting the same blank-caption trap.)

- [~] **F21 — 2FA backup-codes "Copy" is broken (nunjucks parse error) AND can permanently
  lose the one-time codes.** _(FIXED directly 2026-07-24 — `modal_backupcodes.yaml:18` copy
  now uses the operator `_array.join: [ {_state: enroltotp.backup_codes}, "\n" ]` instead of
  nunjucks; eval-verified it returns the joined string. The **interaction redesign below is
  still open** → kept `[~]`.)_ **Root cause was misdiagnosed at first:** the original theory
  (a `\n` escaping trap in the double-quoted YAML) was **wrong** — the real cause is that the
  `join` filter is **unavailable in runtime `_nunjucks`** (see **F23**). Confirmed live via
  `lowdefy_eval_operator`: `{{ codes | join }}` fails to parse regardless of the separator,
  while `{{ x }}` works and `_array.join` works — so _any_ `| join` throws
  `_nunjucks failed to parse`, and the `CopyToClipboard` on the modal's `onClose` threw. (The
  grid at L40 renders because it uses a `{% for %}` loop, not a filter.) **Severity is high,
  not cosmetic:** copy is wired to `onClose` and "Copy" is the modal's `cancelText`, so
  clicking Copy **dismisses the modal and the copy fails silently** — and the backup codes are
  shown **once and never re-fetched**, so a user who clicks Copy (the natural action) loses
  their 2FA recovery codes with no way back. **Still open (batch):** reconsider the interaction
  so copy doesn't require closing (a copy/download control _inside_ the body that keeps the
  modal open), given the one-time nature; and re-confirm `state.enroltotp.backup_codes` is
  populated end-to-end now that the parse no longer masks it.

- [ ] **F22 — 2FA enrol modal (`modal_enroltotp.yaml`) is confusing: visual gaps, both
      actions shown at once, and the account password lingers in client state.** The set-up
      modal has a two-phase body gated on `state.enroltotp.uri` (Phase 1 password → Generate;
      Phase 2 QR + confirmation code), but the composition reads as muddled:
      (a) **No spacing between the password field and the "Generate QR code" button** —
      Phase-1 blocks (`enroltotp_intro_setup` / `enroltotp.password` / `enroltotp_generate`,
      L51–87) are stacked with no `layout.gap` on the modal content and no margins, so the
      password input sits flush against the button. Add a content gap.
      (b) **Both the body "Generate QR code" button AND the footer "Confirm & enable" button
      show in Phase 1.** "Confirm & enable" is the Modal's static `okText` (L18), so it's
      present in both phases; in Phase 1 it's premature — clicking it fires `onOk` →
      `TwoFactorVerify` with an empty confirmation code → error. The confirm/enable action
      should appear **only in Phase 2** (once `enroltotp.uri` is set). User's suggestion:
      move it out of the static footer into a phase-2-gated body button (mirroring the
      phase-1 Generate button), and/or drive the footer conditionally — so exactly one
      primary action is offered per phase.
      (c) **The account password persists in state across close/reopen.** `onOpen` resets
      `enroltotp: {}` (L21–25) but the observed behaviour is that `enroltotp.password` still
      carries the previously-typed password when the modal is reopened. Two problems: the
      reset isn't taking effect on reopen (investigate whether `onOpen` re-fires and whether
      the `PasswordInput` value is cleared by the parent `SetState`), and there's **no
      `onClose` reset** — so the account password sits in client state after the modal is
      dismissed, a hygiene/security concern for a credential field. Clear `enroltotp` (at
      least `.password`) on close, and confirm the open-time reset actually clears the input.
      Whole finding is one modal → treat as a single rework in the batch.

- [ ] **F23 — Runtime `_nunjucks` chokes on some filters (`join`, `trim` confirmed),
      crashing the template with `failed to parse`.** Root cause behind **F7** and **F21**.
      **Confirmed by REAL rendering** (the arbiter): the backup-codes `| join` crashed the
      copy (F21) and the remove-modal `| trim` crashed its title (F7); removing/replacing the
      filter resolves each. `| upper`, `| safe`, `| date('…')`, `[0]` indexing, and — per live
      testing — **`| first`** all render fine (the profile edit-modal and onboarding avatar
      initials, which use `{{ (given or '') | first | upper }}`, display correctly).
      ⚠️ **Caveat on method:** `lowdefy_eval_operator` reported `| first` (and `| join` with a
      variable separator) as "failed to parse" even though `| first` demonstrably works in
      block rendering — so **`eval_operator` gives false negatives for filter availability**
      and is NOT a reliable oracle here; trust real rendering. Because of that, the exact set
      of unsupported filters isn't fully mapped — **confirmed-broken: `join`, `trim`**;
      confirmed-fine: `upper`, `safe`, `date`, `first`, `[0]` indexing.
      **Affected runtime `_nunjucks` templates (confirmed-broken filters only):**
      – `| trim`: `modules/user-admin/components/view/modal_remove.yaml:9` (**F7**) — still open.
      – `| join`: `modules/user-account/components/view/modal_backupcodes.yaml` (**F21**) — fixed
      via `_array.join`.
      (The `| first` avatar templates in `onboarding.yaml:61`, `modal_profile.yaml:68`,
      `accept.yaml:109/235` render fine — **not** affected; earlier listing here was wrong,
      based on the eval false-negative. Not linked to F9.)
      NB `.yaml.njk` files (e.g. `modules/contacts/components/contact-selector.yaml.njk` with
      `| replace`) are **build-time** nunjucks (full filter set) and are **not** affected —
      only the runtime `_nunjucks` operator is. **Decision for the batch:** platform-fix
      (register the missing built-in filters in Lowdefy's runtime nunjucks env — the "one
      correct way", since authors reasonably expect standard nunjucks filters; user leaning
      this way — "might update `_nunjucks`") vs. module-fix (`| join` → `_array.join`,
      `| trim` → drop / string op). Until it lands, avoid `join`/`trim` in `_nunjucks` and
      first re-map which filters are actually unsupported **by real rendering, not
      `eval_operator`**.

- [ ] **F24 — Members list (`user-admin/all`) crashes on load with no filters: empty `$and`
      is illegal in MongoDB.** `modules/user-admin/requests/stages/members_filter.yaml:11`
      emits `$match: { $and: <_array.concat of four `_if … else: []` clauses> }`. On a clean
      page load **no filter is set**, so every clause resolves to `[]`, the concat is `[]`,
      and the stage becomes `$match: { $and: [] }` — which MongoDB rejects with
      `$and/$or/$nor must be a nonempty array` (surfaced at `get_all_members.yaml:8`). The
      stage comment claims "an empty filter matches all," but that only holds for `$match: {}`,
      **not** `$match: { $and: [] }`. **Impact: the Members tab fails to load every time until
      a filter is applied — blocks Phase 3.** Fix options: (a) drop the `$and` wrapper when the
      clause array is empty (emit `$match: {}`); e.g. build the match object conditionally, or
      (b) seed the array with a always-true clause. Prefer (a) — a bare `$match: {}` is the
      canonical "match all". Same empty-array-into-`$and` trap likely lurks in the **Excel
      export** path (the export reuses `members_filter.yaml`, per its header) and anywhere else
      that reuses this stage — audit those too. Small, clear fix — flagged for the batch (or
      can be applied directly to unblock Phase 3 on request).

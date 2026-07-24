# Auth testing — design change requests

Bigger design / architecture changes surfaced while stepping through
[`CHECKLIST.md`](./CHECKLIST.md).

Small blockers and doc fixes are applied to the files directly (not tracked here).
Test-run bugs and unexpected states go in `CHECKLIST.md`'s "Notes / issues found".

**Legend:** `[ ]` open · `[x]` done · `[~]` deferred/needs discussion
Items are numbered `F1`, `F2`, … for reference (stable IDs — don't renumber).

---

- [ ] **F1 — Login error-code mapping isn't resolving; every code degrades to the
      generic default.** On the login page (`modules/user-account/pages/login.yaml`), the
      `onClick.catch` maps `login_do.error.cause.code` through `_switch` tables to a
      friendly title/description/toast, and flips `login_view` to `noaccess` (in-place
      alert) for the hard-wall codes. Observed at runtime, the friendly copy never
      appears: `INVALID_EMAIL_OR_PASSWORD` shows the **generic default toast** ("Something
      went wrong…") instead of the mapped "Incorrect email or password", and
      `EMAIL_NOT_VERIFIED` shows a **generic toast with no in-place alert** instead of its
      intended `noaccess` render (title "Verify your email to continue"). This points at
      `login_do.error.cause.code` **not resolving to the code** at runtime — every
      `_switch` falls to `default`, and the toast's skip check (which gates on the same
      path) misses too. **Verify the real shape of the `Login` action error**
      (`error.cause.code` vs `error.code` vs `error.body.code` …) and fix the accessor used
      across the seed (`onInit`) and catch tables. NB: a toast for
      `INVALID_EMAIL_OR_PASSWORD` is by-design (only the wall codes get the in-place
      alert); the bug is the _copy_, not that it's a toast. (Same accessor feeds the
      `?error=` redirect path via `_url_query: error`, which uses a different source and
      may be unaffected — check both.)

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
      `handleAuthStep → runRoutine → controlIf`) shows the `email.verified` synthetic hook
      fires the merge-on-signup routine but with an **empty/mismatched context payload** —
      neither the verified user's `id` nor `email` is mapped into the routine steps.
      Consequences: (a) an invite to the same address won't match this contact (no key), so
      it mints a **second** contact — violating the one-contact-per-email invariant
      (checklist Phase 4 line 175, user-account Decision 7); (b) `''` **does** satisfy
      `$exists`, so the row is indexed under the partial-unique `lowercase_email` index — a
      second bare/empty-email contact would hit a duplicate-key error. Decision 7 is
      explicit that the fragment must write the lowercased verified email when present and
      **omit** the field entirely when absent (never store `''`/`null`). This is the
      module's flagship endpoint (Decision 7) — **high priority**.

- [ ] **F4 — `users.profile.contactId` is never linked after verification (no `profile`
      bag on the user).** Post-verify, the `users` doc carries no `profile` object at all,
      so `profile.contactId` (and `profile.profile_created`) are unset — checklist line 59
      ("profile.contactId linked on the user (hook)") fails. The `email.verified` path is
      supposed to write `profile.contactId` back via the `UpdateUserProfile` step
      (user-account Decision 7, "synthetic post-write" branch). **CONFIRMED via server
      error** `UpdateUserProfile requires a "userId" property.` (`UpdateUserProfile.js:38`)
      thrown at verify time — the step is invoked without a `userId`, so the link-back
      never runs and (per halt-on-first-error) the routine aborts. **Same root cause as F3**:
      the `email.verified` hook isn't supplying the verified user's `id`/`email` to the
      routine. Fixing the hook context should resolve both F3 and F4. Knock-on: router
      completeness signal (`_user.profile.profile_created`, Decision 5) can't resolve, so
      onboarding routing may misbehave.

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
      onboarding's name step. Needs a product call. (Separate from F3/F4; surfaced because
      it made `users.name` inconsistent with the empty contact.)

- [ ] **F7 — `_nunjucks` error on the user-admin `view` remove-modal title.** A recent
      client `OperatorError` ("\_nunjucks failed to parse nunjucks template. at
      modal_remove.") points at `modules/user-admin/components/view/modal_remove.yaml:7`
      (the Modal `title`). Static inspection found nothing wrong: the `{template, on}`
      shape is valid, the template parses, and `app_title` defaults to `""` so
      `{{ app | trim }}` gets a real string. Lowdefy reports both parse- and render-time
      nunjucks failures under the same message, so the real failure may be at render with
      the live `get_user_detail.0.name` context. Repro when we open the Remove-from-app
      modal in Phase 3. Build itself is green.

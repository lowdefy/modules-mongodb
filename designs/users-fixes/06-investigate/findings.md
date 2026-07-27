# Investigate — no root cause yet, repro before planning

Three findings that can't be handed to an agent or planned into a task, because
the mechanism isn't known. **The deliverable here is a reproduction**, not a fix.

Strong suspicion these are **one underlying post-auth navigation problem with
three faces** — all three appear immediately after an auth state change, and all
three clear when the destination is opened manually. Investigate together;
resolve as one if the repro confirms it.

Finding IDs are stable — carried over from the auth-testing run. Don't renumber.

---

## F11 — Login on a direct visit (no `?callbackUrl=`) succeeds but never navigates

`Login` on the submit relies on the action itself navigating to the
`?callbackUrl=` that an unauthenticated-page redirect sets
(`modules/user-account/pages/login.yaml` ~L251–255 comment; there is no explicit
`Link` on the happy path).

Reaching `/user-account/login` **directly** (bookmark, typed URL, the signup
footer) means no `callbackUrl`, so a successful sign-in mints a session and then
does nothing visible — the user sits on the same form.

**Confirmed:** two clicks minted two `user-sessions` rows for `admin@demo.test`
with zero navigation; manually visiting `/` then routed correctly to onboarding.

Two gaps to close:

- **(a)** Default the post-login target to `/` (the router, which then resolves
  onboarding/home) when `callbackUrl` is absent, so login always lands somewhere.
- **(b)** An **already-authenticated** visitor to `/login` should be bounced by
  the router rather than shown a live (and now no-op) sign-in form.

This is the one with a known fix — but see F19 before assuming it's sufficient.

Distinct from **F1** (`03-upstream/`), which is the error-mapping path; this is
the success path.

---

## F19 — Onboarding completion doesn't navigate — user stranded after a successful save

On submit, `modules/user-account/pages/onboarding.yaml`'s `enter_app` step does
`Link { home: true }` (L178–181) after `save_profile` + `refresh_session`. The
save lands (profile written + `profile_created: true`, confirmed in the DB) but
the page **does not navigate** — it stays on onboarding, exactly like the login
no-op.

**Why F11's fix demonstrably doesn't cover this:** F11 is a missing
`?callbackUrl=`; onboarding uses `Link home: true`, which targets the app's
`homePageId` (router) **unconditionally**. A plain missing-callback explanation
can't apply.

Candidate causes to disambiguate:

- **(a)** `UpdateSession` (`refresh_session`) not resolving before the `Link`, so
  the client stalls.
- **(b)** The same post-auth dev-server JIT/HMR stall as **F12** masking or
  causing the non-navigation.
- **(c)** A genuine `Link home: true` failure in this shell.

Confirmed reachable another way: manually visiting `/` post-submit routes
correctly to home (`profile_created` is set), so it's specifically the in-flow
`enter_app` navigation that fails.

Recorded separately from F11 so the fix batch **verifies the onboarding path
explicitly** rather than assuming F11's fix covers it.

---

## F12 — Dev-server JIT build hangs on the post-login navigation

Twice on 2026-07-24, immediately after a successful login redirect, the
destination page stuck on the "building page" JIT screen and never resolved.
**Opening the same URL in a new tab cleared it every time.**

Presents as a dev-server build/HMR stall on the navigation that follows sign-in,
not a module-config fault — builds are green throughout. Same class as the
transient JIT hang seen earlier while diagnosing the demo router fix.

Left uninvestigated by request at the time.

**Decide after repro:** a tooling/dev-server issue to escalate upstream, or a
symptom of how the auth flow triggers navigation. If the latter, it likely
collapses into F11/F19 rather than being its own finding.

This is also the reason F11 and F19 can't be confidently fixed blind — a fix
could appear to work or appear to fail purely on whether the JIT stall fires that
run. Establish whether F12 is real and separable **first**; it gates confidence
in the other two.

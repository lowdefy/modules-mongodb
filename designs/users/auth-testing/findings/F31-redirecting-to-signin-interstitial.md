# F31 — Unstyled "Redirecting to sign-in" interstitial shown mid-flow to a logged-in user

**Status:** `investigate` · **Area:** user-account / auth-flow (framework redirect page)

During the post-signup flow — after email verification and onboarding, on the way to the
**forced 2FA enrolment** page (`twoFactor.required: true`) — the user is briefly shown a
full-page interstitial reading:

```
Redirecting to sign-in...
Continue to sign-in if you are not redirected automatically.
```

Three separate problems on one screen:

1. **It's unstyled.** The page is the Lowdefy framework's generic redirect page
   (`apps/demo/.lowdefy/dev/lib/client/RedirectingPage.jsx`), **not** our module config, so
   it doesn't inherit the app's Ant styling. It cannot be restyled from module config — a fix
   is an **upstream / framework ask**.
2. **Wrong copy.** It says _"sign-in"_, but the actual destination is **2FA enrolment**, not
   the sign-in page.
3. **Shown to an already-authenticated user.** Being bounced through a "redirecting to
   sign-in" page while already logged in feels wrong — a signed-in user should not see a
   sign-in redirect at all.

## The open question

Not yet root-caused. Two hypotheses to separate with a deliberate repro:

- a **real auth-flow defect** — the forced-enrolment guard is redirecting through the
  sign-in path when it should route straight to enrolment; or
- a **symptom of the dev-server JIT hang** ([F12](./F12-dev-server-jit-hang.md)) — the
  interstitial is the framework page that shows while a JIT build stalls, not a deliberate
  auth redirect.

Developer is re-running the flow against a **production server** to see whether the
interstitial still appears there (real flow) or only under dev-server JIT (collapses into
F12). Decide the owning fix once that's known: upstream framework report (styling/copy) vs.
a module-side auth-flow correction.

## Run update — 2026-08-06

Re-ran on a **production server: navigation was clean — the interstitial did not appear.**
Strong signal this is the dev-server JIT stall ([F12](./F12-dev-server-jit-hang.md))
surfacing the framework redirect page, **not** a real auth-flow defect. Leaning toward
collapsing F31 into F12; kept open pending the developer's grouping pass.

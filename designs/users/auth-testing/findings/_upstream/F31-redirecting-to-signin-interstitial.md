# F31 — Unstyled "Redirecting to sign-in" interstitial shown mid-flow to a logged-in user

**Status:** `root-caused` · **Area:** user-account / auth-flow (framework redirect page) · **upstream**

During the post-signup flow — after email verification and onboarding, on the way to the
**forced 2FA enrolment** page (`twoFactor.required: true`) — the user is briefly shown a
full-page interstitial reading:

```
Redirecting to sign-in...
Continue to sign-in if you are not redirected automatically.
```

## Root cause — the 403 enrol redirect reuses the framework's generic 401 redirect page

Not a JIT stall (the earlier hypothesis) and not an auth-flow defect. It is a **deliberate,
correct redirect** rendered through a **generic screen with hardcoded sign-in copy**, and it
surfaces **only under the dev server**. Traced end-to-end through the generated
`.lowdefy/dev` client:

1. The forced-2FA gate resolves the caller as `enrol_required`. The dev page route returns
   **HTTP 403** with `redirect` → the **2FA-enrol** page — deliberately _not_ 401, with an
   explicit comment that a 401 would bounce the user to sign-in and cause the very loop the
   enrolment gate exists to avoid
   (`apps/demo/.lowdefy/dev/src/routes/jitPage.js:93-108`).
2. The client fetcher collapses **both 401 and 403** into one `{ authRedirect }` value
   (`.lowdefy/dev/lib/client/utils/usePageConfig.js:76-88`).
3. `.lowdefy/dev/client/Page.jsx:63-64` renders **one generic component** —
   `RedirectingPage` — for that value, and
   `.lowdefy/dev/lib/client/RedirectingPage.jsx:44` **hardcodes** the text
   _"Redirecting to sign-in…"_ (its own comment scopes it to "the 401 sign-in redirect").

The three complaints resolve:

| #   | Complaint                     | Verdict                                                                                                                                                |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Unstyled**                  | ✔ real — it is the framework's plain page, not module config, so it can't inherit Ant styling. Not fixable from module config.                         |
| 2   | **Wrong copy** ("sign-in")    | ✔ real — the 403-enrol path reuses the 401 component, whose copy is hardcoded. The destination is enrolment, not sign-in. **This is the fixable bug.** |
| 3   | **Shown to a logged-in user** | ✘ **not** a defect — it genuinely is an authenticated user on a legitimate 403 enrol redirect. Only the misleading copy makes it look wrong.           |

## Why production is clean (the re-run that "worked")

The prod re-run passing does **not** prove "JIT symptom" — it proves the interstitial is
**dev-client-only**. Prod's client handles the identical 401/403 contract
(`.lowdefy/server/src/routes/apiPage.js:33-61` returns the same shapes) but its
`.lowdefy/server/client/Page.jsx:62-71` **never imports or renders `RedirectingPage`** — on
401/403 it calls `window.location.assign(redirect)` silently. So the redirect happens with no
interstitial. The dev client is the only one that paints a screen for the redirect window.

## Not the same finding as F12

Previously hypothesised as a surface of the [F12](../_completed/F12-dev-server-jit-hang.md) JIT hang;
**that grouping is wrong.** F31 is `RedirectingPage` (the "Redirecting to sign-in" screen),
rendered **deterministically on every 401/403** in dev. F12 is `BuildingPage` (the "Building
page…" screen), a transient JIT-build stall. Different components, different triggers. They
only _co-occur_: F31's `window.location.assign` to the enrol page kicks off a cold JIT build
of that destination, and that build is what can stall (F12). F31 leads into F12; they are
distinct.

## Escalation — upstream (framework)

No module change fixes this. The fix belongs in the platform's dev client. Candidates (the
platform's to choose):

- Parameterise `RedirectingPage`'s copy by the redirect reason (401 sign-in vs 403 enrol), or
  make it generic ("Redirecting…"); and/or
- Style the dev redirect/building/error pages to the app theme (tracked more broadly as the
  unstyled-framework-page family).

Behaviourally the redirect is correct; this is a **copy + styling** report, dev-server only.

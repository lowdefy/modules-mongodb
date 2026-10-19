# 09 — login page

**Context**: Login page for the module (design.md — Decision 2). Mock:
`mockups/screens/login.html` (states: `signin` resting, `noaccess` =
authPages.error redirect render). Serves `authPages.signIn` and `authPages.error`.

**Task**:

1. **Build the page** — run the `mock-to-lowdefy` skill end to end (frame →
   layout → content) on `mockups/screens/login.html`: frame it (`phases/01-frame.md`,
   output to `mockups/frames/login.*`), do shared-component discovery mapping the
   `data-ldf-component="auth-page"` region onto the layout module's auth-page
   wrapper, translate to a Lowdefy block tree (`phases/02-layout.md`), and fill the
   slots with real blocks + mock data (`phases/03-content.md`). Both states as
   page/block state, not separate pages. Write into
   `modules/user-account/pages/login.yaml` (+ `components/*` via `_ref`).
2. **Wire it** — resolve every `TODO(request-substitute)`:
   - **Method enablement from `_build.authConfig`** (NOT module vars): password form
     when `emailAndPassword.enabled`, magic-link when `magicLink.enabled`, passkey
     button when `passkey.enabled`, one OAuth button per
     `_build.authConfig.providers` entry.
   - **OAuth display metadata** from the `providers` module var keyed by id
     (label/icon/order); a configured provider with no metadata entry falls back to
     its id.
   - **Dispatch**: email/password, magic-link, OAuth all through the one `Login`
     action (dispatch by parameter). Passkey → `PasskeySignIn` (upstream ask 6,
     [upstream-asks-2.md] — **NOT yet delivered**): gate on `passkey.enabled`, but if
     unavailable at build, apply the fallback — **drop the button** and note it.
   - **Error handling, one code→message table**: `MEMBERSHIP_REQUIRED`,
     `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_PASSWORD`, plus a catch-all `default`.
     Password errors return inline on the `Login` call → map in place; OAuth/
     magic-link failures redirect to `authPages.error` (this page) → read
     `_url_query: error` → map through the same table.
   - **2FA routing**: when `Login` signals two-factor-required, route to the module's
     `two-factor` page (`_module.pageId: two-factor`) — never leaves the module.
   - Successful sign-in navigates to `callbackUrl`.

**Acceptance Criteria**:

- Page matches the mock in the app theme; both states render.
- Methods appear exactly per `_build.authConfig`; OAuth buttons cross-reference the
  `providers` var with id fallback.
- Both error paths (inline + `_url_query`) map through one table with a working
  `default`; 2FA-required routes to `two-factor`; passkey button gated + fallback.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/login.yaml` (+ `components/*`)
- `designs/user-account-better-auth/mockups/frames/login.*` (provenance)

**Notes**:

- Depends on 01. Screens are independent — parallelizable after foundation.
- The demo `auth:` config enables the full method matrix (task 01) so the magic-link
  tab, OAuth buttons, and passkey button all build into a demo artifact and can be
  verified (task 20) — a demo enabling only `emailAndPassword` would leave those
  gated branches un-exercised.
- `Login` + query-error handling delivered upstream (ask 1/2); `PasskeySignIn` is
  ask 6, not delivered. Use the `lowdefy-docs` MCP / `/lowdefy-config` for schemas.

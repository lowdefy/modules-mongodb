# 18 — account workspace (`view`) page

**Context**: Account workspace — the `view` page that replaces view + edit (design.md
— Decision 5). Mock: `mockups/screens/account.html` (page + edit-profile,
change-password, enrol-totp, backup-codes modals). Protected. The densest screen —
extract each tile and modal into its own `components/*.yaml` via `_ref`.

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/account.html` (frame → layout → content). Shared-component
   discovery: the layout module page wrapper, `profile-avatar`/`user-avatar`
   (task 04), the `components.main_slots` extension point, and the QR block (task 02)
   for the enrol-totp modal. Tiles + modals as page/block state; extract deep regions
   via plain-path `_ref`. Regions:
   - **Profile tile**: contact fields + edit trigger; **edit-profile modal**
     (`fields.profile`).
   - **Security tile**: email + verified badge/resend; change-password control +
     **change-password modal**; 2FA control + **enrol-totp modal** (QR block renders
     the `totpURI`, copyable-text fallback) + confirm-code + **backup-codes modal** +
     disable; passkeys list + register/delete; linked-accounts list (read-only).
   - **Sessions tile**: session list (created, expiry, IP, user-agent — **no token
     column**) + "sign out other sessions".
   - **`main_slots`** appended under the main column.
     Write into `modules/user-account/pages/view.yaml` (+ `components/*`). Frame to
     `mockups/frames/account.*`. **Open question (design.md)**: Security as one tile vs
     separate 2FA/passkeys/sessions tiles — decide now the page is real; write pathways
     are fixed either way.
2. **Wire it** per Decision 5:
   - **Native reads** (read-only connections, all filtered to the caller): aggregate
     over `users`, `user-sessions`, `user-accounts`, `user-passkeys`, joined to
     `user-contacts` by `profile.contactId`. The `user-accounts` read feeds BOTH the
     linked-accounts list AND the **credential-presence** check (a `provider:
"credential"` row) — one query. Project the session **`token` out**.
   - **Profile tile**: edit modal saves via **`update-profile`** (task 07); display
     reads the contact directly.
   - **Security tile — visibility gates**:
     - **Change password** when `_build.authConfig.emailAndPassword.enabled` **AND**
       the credential row exists → **`ChangePassword`** (current + new +
       revoke-other-sessions option).
     - **2FA** when `_build.authConfig.twoFactor.enabled` **AND** the credential row
       exists → **`TwoFactorEnable`** (returns `totpURI` + backup codes, read from
       `_actions`) → **`TwoFactorVerify`** (confirm) → **`TwoFactorDisable`**.
     - **Passkeys** when `_build.authConfig.passkey.enabled` → **`PasskeyRegister`** /
       **`PasskeyDelete`**.
     - **Linked accounts** — read-only (visibility, not management).
     - **Email verified badge** — resend via **`SendVerificationEmail`** when
       unverified.
     - Password-gated controls simply **hide** for credential-less users (no
       set-password flow — out of scope).
   - **Sessions tile**: "sign out other sessions" → **`RevokeOtherSessions`**. No
     per-session revoke (deferred — token exposure).

**Acceptance Criteria**:

- Page matches the mock; all tiles + modals render; sessions omit the token; QR block
  renders the `totpURI`.
- Native reads filtered to the caller; every visibility gate matches Decision 5
  (deployment gate = `_build.authConfig`; per-user gate = credential read); credential
  presence reuses the linked-accounts read.
- Each action wired to the correct catalog action.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/view.yaml` + `modules/user-account/components/*`
  (tiles + modals)
- `designs/user-account-better-auth/mockups/frames/account.*`

**Notes**:

- Depends on 01 (connections), 02 (QR block), 04 (shared components), 07
  (`update-profile`). All actions here delivered upstream (ask 1). Use the
  `lowdefy-docs` MCP / `/lowdefy-config` for schemas and the MongoDB aggregation
  pipelines (`connections/mongodb`, `MongoDBAggregation`).
- The demo `auth:` config enables the full method matrix (task 01: `twoFactor` +
  `passkey` + a `providers` entry) so the 2FA, passkeys, and linked-accounts tile
  gates resolve true and build into a demo artifact — a demo enabling only
  `emailAndPassword` would leave those tiles un-exercised by the verify gate (task 20).

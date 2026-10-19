# 15 — accept-invitation page

**Context**: Accept-invitation page (design.md — Decision 4: public, thin,
engine-trusting). Mock: `mockups/screens/accept.html` (states: `no-session`,
`signed-in`, `already-member`, `expired`). Serves `authPages.acceptInvitation`. The
page holds no orchestration — its job is session-ensuring + one client call.

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/accept.html` (frame → layout → content), reusing the auth-page
   wrapper. All four states as page/block state: invitation summary
   (org/inviter/expiry); no-session login/signup buttons; signed-in accept button;
   already-member notice; expired notice. Write into
   `modules/user-account/pages/accept.yaml`. Frame to `mockups/frames/accept.*`.
2. **Wire it** per Decision 4:
   - Read the invitation **natively** from `user-invitations` by the **`invitationId`
     query parameter** (`_url_query.invitationId`; auth-emails accept-link contract) —
     org name, inviter, expiry, status, invited email — **display only**.
   - **No session** → login/signup buttons with a `callbackUrl` back to this page.
   - **Session + email matches** → accept button → **`AcceptInvitation`** client
     action; on success link into the app (the engine merges the `profile` fragment
     and copies invite-time attributes — not the page's job).
   - **Expired / mismatch / already-member** → the corresponding message (recovery is
     admin re-invite). Map errors with a `default` fallback.

**Acceptance Criteria**:

- Page matches the mock; all four states render.
- Invitation read natively by `_url_query.invitationId` (display only); state
  selection covers no-session / matches / expired / mismatch / already-member.
- Accept calls `AcceptInvitation`; no-session offers login/signup with callback.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/accept.yaml` (+ `components/*`)
- `designs/user-account-better-auth/mockups/frames/accept.*`

**Notes**:

- Depends on 01 (`user-invitations` connection). `AcceptInvitation` delivered
  upstream (ask 1); BetterAuth gates session-email ↔ invitation-email itself.

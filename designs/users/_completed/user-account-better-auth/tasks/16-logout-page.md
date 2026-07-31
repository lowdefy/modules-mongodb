# 16 — logout page

**Context**: Logout page (design.md — Module surface; signed-out confirmation). Mock:
`mockups/screens/logout.html` (single state).

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/logout.html` (frame → layout → content), reusing the auth-page
   wrapper. Slots: signed-out confirmation message, sign-in-again link. Write into
   `modules/user-account/pages/logout.yaml`. Frame to `mockups/frames/logout.*`.
2. **Wire it**: call the **`Logout`** action (engine-provided) on load (or on an
   explicit confirm, matching the mock), then render the signed-out confirmation with
   a link to `login` (`_module.pageId: login`).

**Acceptance Criteria**:

- Page matches the mock; `Logout` fires; confirmation renders with a sign-in link.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/logout.yaml`
- `designs/user-account-better-auth/mockups/frames/logout.*`

**Notes**:

- Depends on 01. `Logout` is an existing engine action.

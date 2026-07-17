# 17 — onboarding page

**Context**: Onboarding page (design.md — Decision 5: chrome-less first-login profile
completion; the old `new` page). Mock: `mockups/screens/onboarding.html`. Protected.
The contact already exists by first login (Decision 7) — this page only updates it.

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/onboarding.html` (frame → layout → content). Shared-component
   discovery: the chrome-less wrapper and the `fields.profile` field-block region
   (rendered from the module var, same blocks as the profile tile; honorific selector
   gated on `show_honorific`; ids `profile.`-prefixed so they bind `state.profile.*`).
   Reuse the migrated shared components (task 04). Write into
   `modules/user-account/pages/onboarding.yaml`. Frame to
   `mockups/frames/onboarding.*`.
2. **Wire it**: save → the **`update-profile`** API (task 07), sending the
   `state.profile.*` subtree as payload against the caller's own contact
   (`_user.profile.contactId`). On a successful save, set **`profile.profile_created:
true`** (the onboarding-complete marker) via the same API call. After save,
   navigate into the app; the app router reads `_user.profile.profile_created` to stop
   routing here (app-side, not this page's job).

**Acceptance Criteria**:

- Page matches the mock; `fields.profile` region renders.
- Save calls `update-profile` with the profile subtree; `profile_created` set true on
  success; navigates into the app after completion.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/onboarding.yaml` (+ `components/*`)
- `designs/user-account-better-auth/mockups/frames/onboarding.*`

**Notes**:

- Depends on 01, 04, 07. The marker is an explicit flag, not a derived signal
  (Decision 5). Payload, not state (CLAUDE.md).

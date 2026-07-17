# 13 — verify-email page

**Context**: Verify-email page (design.md — Module surface: one page, two renders —
post-signup "check your email" prompt, and the landing after the emailed link with a
success/error query). Mock: `mockups/screens/verify-email.html` (states:
`check-email`, `verified`, `expired`). Serves `authPages.verifyEmail`. Renamed from
today's `verify-email-request`.

**Task**:

1. **Build the page** — run `mock-to-lowdefy` end to end on
   `mockups/screens/verify-email.html` (frame → layout → content), reusing the
   auth-page wrapper. All three states as page/block state (check-email message +
   resend; verified success + continue; expired + resend). The check-email message
   comes from the `verify_email_message` var. Write into
   `modules/user-account/pages/verify-email.yaml`. Frame to
   `mockups/frames/verify-email.*`.
2. **Wire it**:
   - Resend button → **`SendVerificationEmail`** for the unverified email.
   - Landing render: BetterAuth's `GET /api/auth/verify-email` redirects here with a
     success or error query — read `_url_query` and select `verified` vs `expired`
     (error), mapping error codes with a `default` fallback.
   - `verified` offers a continue link into the app; `expired` re-offers resend.

**Acceptance Criteria**:

- Page matches the mock; all three states render.
- Resend calls `SendVerificationEmail`; render selected from `_url_query` with a
  `default` fallback.
- No `TODO(request-substitute)` markers remain.

**Files**:

- `modules/user-account/pages/verify-email.yaml`
- `designs/user-account-better-auth/mockups/frames/verify-email.*`

**Notes**:

- Depends on 01. `SendVerificationEmail` delivered upstream (ask 1).

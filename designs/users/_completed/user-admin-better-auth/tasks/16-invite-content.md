# Task 16: `invite` screen — pipeline phase 3 (content)

## Context

Third phase for the `invite` page. Fill task 15's placeholder slots with real,
mock-data-hydrated blocks; leave `TODO(request-substitute)` markers. Do not
restructure.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/03-content.md`.
**Mock:** `designs/user-admin-better-auth/mockups/screens/invite.html`
**Behaviour:** `design.md` Decision 7, Decision 8 (role catalog).

## Task

Fill the slots:

- **Email-entry card**: email input + Check button; the resolved/locked variant
  showing the email with a "use a different email" action.
- **Resting**: light inline hint ("Choose Check above…").
- **Checking**: spinner panel ("Checking access…").
- **Unknown**: blank invitation-details form — Full name (required), Phone, Job
  title; Roles `MultipleSelector` (options/labels/descriptions from the
  `auth.roles` catalog, read via the `_build.authConfig.roles` projection
  (Decision 8) — label primary, description subtitle); Member attributes
  (Region / Cost centre etc. from `fields.member_attributes`), with the "captured
  now — authorization parameters from first session" hint; Cancel / Send
  invitation.
- **Existing contact**: same form, prefilled from the resolved contact; email
  locked.
- **Already a member**: success panel + "View user" (links to `view`).
- **Pending invitation**: warning panel (sent-by / expiry) + Resend / Cancel.
- **Cancel confirm modal**: withdraw-invitation copy + Keep / Cancel.

Match mock visuals within the app theme; `TODO(request-substitute)` at every
mock-data site (resolved email, prefill values, sent-by/expiry, role options).

## Acceptance Criteria

- Every placeholder slot replaced with a real block; structure/ids from task 15
  unchanged.
- Role `MultipleSelector` renders catalog label + description; member-attribute
  fields from `fields.member_attributes`; the "captured now" hint present.
- All four resolution outcomes + resting + checking rendered as fillable layers;
  cancel confirm modal present.
- `TODO(request-substitute)` markers at all mock-data sites; `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/invite.yaml` — fill slots in place
- `modules/user-admin/components/*.yaml` — fill resolution layers + modal

## Notes

- The check → outcome state transitions, prefill data, and submit are the wire
  task (task 17). Here, mock data + markers + the visual layers only.

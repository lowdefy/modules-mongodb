# Task 17: `invite` screen — wire (check resolve, submit, cancel/resend)

## Context

Final phase for the `invite` page: resolve every `TODO(request-substitute)` marker
(task 16) into real requests, state, events, and action bindings. Use the
`lowdefy-docs` MCP (or `/lowdefy-config`). The invite routines (task 5) —
`check-invite-email`, `invite`, `cancel-invitation`, `resend-invitation` — are
already built; this task drives the email-first state machine off them.

Design section: Decision 7.

## Task

**Check → resolve** — the Check button calls `check-invite-email` (task 5), which
returns one of four states. Drive the resolution slot to show the matching layer:
**already a member** → member panel with "View user" link to the target's `view`;
**pending invitation** → pending panel with Resend / Cancel; **existing contact
(no membership)** → prefilled invitation-details form (bind the returned profile
fields into `state.profile.*`); **unknown** → blank form. While the call is in
flight, show the checking layer; lock the email once resolved (a "use a different
email" action re-opens entry).

**Submit** — Send invitation calls `invite` (task 5): reconcile any stale expired
`pending` row → create-or-link `contact` → `InviteMember` with `profile.contactId`

- roles + member attributes → audit event (all server-side in the routine, so an
  expired invite re-sent from here — or reached via the `all`-tab "Re-invite" button —
  leaves no duplicate). On success, return to `all` (or show confirmation). Roles
  submit as catalog-valid ids from the `auth.roles` catalog.

**Pending actions** — Resend → `resend-invitation`; Cancel → `cancel-invitation`
(via the confirm modal). Refetch/re-resolve after each.

## Acceptance Criteria

- Check calls `check-invite-email` and routes to the correct one of four
  resolution layers; the checking layer shows during the call; the email locks on
  resolution.
- Existing-contact prefills the form from the returned contact; unknown yields a
  blank form; already-member links to `view`; pending offers Resend/Cancel.
- Send invitation calls `invite` (create-or-link + `InviteMember` + audit event);
  roles submit as catalog ids; success returns to the list.
- Cancel/Resend call the task-5 routines through the confirm modal and re-resolve.
- Every task-16 marker resolved; `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/invite.yaml` — add `requests:` / state / events; resolve markers
- `modules/user-admin/components/*.yaml` — bind the resolution state machine + submit + actions

## Notes

- No email endpoint/hook is wired — the invite email rides `auth.email` inside the
  `InviteMember` routine (Decision 7); the module has no dispatch surface.
- The one-contact-per-email invariant is preserved by `create-or-link-contact`'s
  `lowercase_email` upsert (task 2) — the check is the UX front for it, not the
  enforcement.

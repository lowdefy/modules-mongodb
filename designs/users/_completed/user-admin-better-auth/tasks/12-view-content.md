# Task 12: `view` screen — pipeline phase 3 (content)

## Context

Third phase for the `view` page. Fill task 11's placeholder slots with real,
mock-data-hydrated blocks; leave `TODO(request-substitute)` markers. Do not
restructure.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/03-content.md`.
**Mock:** `designs/user-admin-better-auth/mockups/screens/view.html`
**Behaviour:** `design.md` Decisions 3, 4, 5, 6, 8.

## Task

Fill the slots:

- **Title-block**: avatar + status pill (Active/Suspended/…) + name.
- **Profile tile** (`SmartDescriptions`): contact fields from `fields.profile`.
  Edit → profile modal (form of `fields.profile` blocks binding `state.profile.*`,
  email locked).
- **Attributes tile** (`SmartDescriptions`): Roles (tags; orphaned role rendered
  as a flagged "no longer configured" chip) + member attributes from
  `fields.member_attributes`. Edit → attributes modal (role MultipleSelector whose
  options/labels/descriptions come from the `auth.roles` catalog, read via the
  `_build.authConfig.roles` projection (Decision 8) — label as option
  text, description as subtitle; an orphan can be removed but not re-added +
  member-attribute fields).
- **Global attributes tile** (`SmartDescriptions`): `fields.user_attributes`.
  Edit → global attrs modal.
- **Security tile**: Suspend (behind `suspension` var) / Remove from app / Sign
  out everywhere / Delete identity buttons + confirm modals; Active sessions list
  (device, IP, expiry; Current tag / Revoke); Auth methods (read-only tags). Add
  the "View as user" impersonation affordance behind the `impersonation` var
  (client action). Hint copy switches on multi-app vs single-app.
- **Apps tile**: cross-app badges (org name tags).
- **Activity tile** (`EventsTimeline`): event-type icon + actor avatar + title +
  relative time, optional description card.

Match mock visuals within the app theme; `TODO(request-substitute)` at every
mock-data site (field values, roles, sessions, badges, timeline, session count,
membership scenario).

## Acceptance Criteria

- Every placeholder slot replaced with a real block; structure/ids from task 11
  unchanged.
- Tiles use `SmartDescriptions`; Activity uses `EventsTimeline`; role picker
  renders catalog label + description; orphan chip flagged.
- Security-tile actions/modals present; Suspend gated on `suspension` var;
  impersonation affordance gated on `impersonation` var.
- `TODO(request-substitute)` markers at all mock-data sites; `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/view.yaml` — fill slots in place
- `modules/user-admin/components/*.yaml` — fill / split tiles and modals

## Notes

- Multi-app vs single-app degradation (Apps tile hidden, suspend-dialog blast
  radius, delete enabled, "suite"/"every app" copy collapse) is driven by the
  person's other-membership count — wired in task 13. Here, render the multi-app
  variant with markers; leave the single-app branch as a `when:`/state hook the
  wire task fills.
- Edit modals call the task-3 routines; Security actions call the task-4 routines
  — those bindings are the wire task.

# Task 8: `all` screen — pipeline phase 3 (content)

## Context

Third phase of the `mock-to-lowdefy` pipeline for the `all` page. Input: task 7's
layout (final structure, `Html` placeholder slots) + the original mock (visual
contract) + `design.md` Decision 2 (behaviour). Output: the same page with every
slot replaced by a real, mock-data-hydrated block, and a `TODO(request-substitute)`
marker at every mock-data site. Do **not** restructure — only replace slot blocks
and fill properties.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/03-content.md`
(`.claude/skills/mock-to-lowdefy/phases/03-content.md`). Block schemas come from
the `lowdefy-docs` MCP (or `/lowdefy-config`).

**Mock:** `designs/user-admin-better-auth/mockups/screens/all.html`
**Behaviour:** `design.md` Decision 2.

## Task

Fill the slots with real blocks + mock data:

- **Title-block**: title (default "Users", overridable by `app_title`), Download
  Excel button (present only when the `download` var is true), Invite user button
  (links to `invite`).
- **Members tab**: search input (name/email), Role filter (multi-select whose
  options + labels come from the `auth.roles` catalog, read via the
  `_build.authConfig.roles` projection — Decision 8), Status segmented selector
  (All/Active/Suspended), Clear, sort-filters (Sort-by selector + asc/desc toggle,
  default updated descending). `AgGridBalham` table with columns Name (avatar +
  name), Email, Roles (tags; render an orphaned role — held in data, absent from
  the catalog — as a flagged "no longer configured" chip), Status
  (Active/Suspended tag), the `table_columns` slot, Created / Updated / Signed up
  dates. Row click → `view`. Pagination footer.
- **Invitations tab**: search (invitation email), Status segmented
  (All/Invited/Expired), Clear, sort-filters (default expiry). Table with Email,
  Invited by (avatar + name), Roles, Status (Invited/Expired tag), Expires,
  Actions (Resend/Cancel for Invited; Re-invite for Expired). Pagination footer.

Match the mock's visuals within the app theme. Leave `TODO(request-substitute)`
at every mock-data site (table rows, counts, filter options, badge counts).

## Acceptance Criteria

- Every placeholder slot is replaced by a real block hydrated with mock data;
  structure/ids/`layout:` from task 7 are unchanged.
- Role filter and role columns render catalog-style labels; orphaned-role chip is
  visually flagged.
- Download button is gated on the `download` var; Invite button links to `invite`.
- A `TODO(request-substitute)` marker sits at every mock-data site (these are YAML
  comments — the build stays green).
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/all.yaml` — fill slots in place
- `modules/user-admin/components/*.yaml` — fill / split as content grows

## Notes

- Use `AgGridBalham` for the tables (never other AG Grid themes).
- Status derivation, split-role handling, org scoping, and the actual pipelines
  are the wire task (task 9) — here, mock data + markers only.

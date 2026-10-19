# Task 5: Restack the onboarding profile row for the standard width

## Context

`modules/user-account/pages/onboarding.yaml` sets `max_width: 560` (line ~22) so it can lay
honorific + first name + last name on one row. That row comes from the **shared** component
`modules/shared/profile/form_core.yaml`, referenced with `path: ../shared/profile/form_core.yaml`
and `vars: { show_honorific: {_module.var: fields.show_honorific} }`.

`form_core.yaml` today (a full-width `profile_name_row` Box, `layout.span: 24`, `gap: 8`):

- `profile.title` (Selector) — `span: 6`, only when `show_honorific`.
- `profile.given_name` (TextInput) — `span: 9` with honorific, `span: 12` without.
- `profile.family_name` (TextInput) — `span: 9` with honorific, `span: 12` without.

At `420` (card body ~356px after padding) the three-across row is tight: span-6 ≈ 89px, span-9 ≈
133px. **Critical constraint:** `form_core.yaml` is _also_ consumed by the profile edit modal
(`modules/user-account/components/view/modal_profile.yaml`), which is wider. Any restack must
read well in **both** places — don't fix onboarding by breaking the modal.

## Interfaces

- **Consumes:** `auth_page.max_width` default `420` (Task 1).
- **Touches shared surface:** `modules/shared/profile/form_core.yaml` is used by both
  `onboarding.yaml` and `modal_profile.yaml`.

## Task

1. **Remove `max_width: 560`** from `onboarding.yaml` (line ~22) so it inherits `420`. Remove
   the stale "Wider than the default auth card" comment above it.

2. **Restack the honorific + name row so it reads well at `420`** without regressing the profile
   modal. Preferred approach (satisfies "reads well in both" mechanically rather than by
   convention): **parameterize the honorific placement** in `form_core.yaml` via a new
   `_var` — e.g. `honorific_row: full` (honorific on its own row above the names, names split
   50/50 below) vs the current inline behavior — defaulting to today's inline layout so
   `modal_profile.yaml` is unchanged, and passing the stacked variant from `onboarding.yaml`.
   Alternatively narrow the honorific to a tighter inline span if that reads cleanly at `420` in
   both consumers.

   Whichever you choose, the honorific must stay optional (`show_honorific`), the name fields
   stay `required: true`, and the block ids (`profile.title`, `profile.given_name`,
   `profile.family_name`) — which are their state paths — must not change. The onboarding submit
   (`validate_onboarding` → `save_profile` CallAPI → `refresh_session` → `enter_app`) reads
   these paths; audit refs before touching ids.

3. **Verify both consumers.** Render `onboarding` and open the profile edit modal (via the
   `view` page's `modal_profile`) and confirm each reads well — use `lowdefy_screenshot_page`
   for onboarding, and the MCP to inspect/screenshot the modal. Consult `lowdefy_get_schema` for
   any block/layout props you add (`Box`/`Selector`/`TextInput` span semantics).

## Acceptance Criteria

- No `max_width` override on `onboarding.yaml`; it renders at `420` with the honorific + name
  fields readable (not cramped) — honorific on its own row or a clean narrow inline field.
- The profile edit modal (`modal_profile`) renders the same fields with **no visual regression**
  from before.
- All three field ids/state paths unchanged; onboarding submit still validates and saves.
- `pnpm ldf:b` from `apps/demo` succeeds.

## Files

- `modules/user-account/pages/onboarding.yaml` — modify — drop `560`; pass the restack variant
  to `form_core`.
- `modules/shared/profile/form_core.yaml` — modify — parameterize honorific placement (default
  = current behavior so the modal is unchanged).

## Notes

- The design explicitly flags this shared-component coupling: "verify the restacked layout reads
  well in both, or parameterize the honorific span." Parameterizing keeps "one correct way"
  intact — one component, one default, one opt-in variant — rather than forking the file.
- Heading normalization (Task 8) will re-touch `onboarding_title`; leave the title styling to
  that task.

# Task 4: Add demo verification pages for `user-avatar` and `user-multi-selector`

## Context

The design's verification calls for demo coverage of the two **new** components (the single-select
`user-selector` has no in-repo consumer and gets no demo page):

- A page that `_ref`s `user-avatar` and renders avatar + name correctly for users **with and
  without** a `profile.picture`.
- A page that `_ref`s `user-multi-selector`, renders a multi-select picker filtered to
  `is_user: true` users, and writes an **array** of selected ids to its bound state path.

The demo app lives at `apps/demo`. It wires `user-account` as a module entry (`apps/demo/modules.yaml`,
id `user-account`, `file:../../modules/user-account`). Pages are registered under the `pages:` list in
`apps/demo/lowdefy.yaml` (e.g. `- _ref: pages/avatar.yaml`). An existing `apps/demo/pages/avatar.yaml`
is an unrelated `PageHeaderMenu` demo — do not repurpose it; add new page(s).

This task depends on Tasks 2 and 3 (the components must exist and be exported).

## Task

**1. Create a demo page exercising `user-avatar`** (e.g. `apps/demo/pages/user-avatar-demo.yaml`).
Render at least two `user-avatar` instances via
`_ref: { module: user-account, component: user-avatar, vars: { user: <doc> } }`:

- one with a populated `profile.picture` (any non-empty string / data URI) and a `profile.name` →
  shows the image + name;
- one with `profile.picture` absent/empty → shows the `UserOutlined` fallback icon;
- optionally a third with `show_name: false` to confirm the name hides.

Use inline literal `user` doc objects so the page is self-contained (no DB dependency). Wrap the page
in the layout module's page wrapper consistent with other demo pages if appropriate, or keep it a
simple `Box`/`PageHeaderMenu` page like `avatar.yaml`.

**2. Create a demo page exercising `user-multi-selector`** (e.g.
`apps/demo/pages/user-multi-selector-demo.yaml`). `_ref` the component via
`_ref: { module: user-account, component: user-multi-selector, vars: { label: Assignees } }`, bound to
a state path (e.g. `assignees`). Add a small read-back display (a `Title`/`Html` showing
`_state: assignees`) so a reviewer can confirm the selection writes an **array** of ids. This requires
the demo app to have a reachable user-contacts collection / `app_name` so the options request resolves;
mirror whatever the existing user-account demo wiring uses.

   You may instead combine both demos onto a **single** page if cleaner — the design says "a new
   sample page" and only requires both behaviours be demonstrated.

**3. Register the new page(s)** in `apps/demo/lowdefy.yaml` under the `pages:` list with `_ref` entries
(e.g. `- _ref: pages/user-avatar-demo.yaml`). Per repo rule, a page file not referenced in
`lowdefy.yaml` is not loaded.

## Acceptance Criteria

- New demo page(s) exist and are registered in `apps/demo/lowdefy.yaml`.
- `pnpm ldf:b` in `apps/demo` builds cleanly with the new pages.
- Running the demo, the `user-avatar` page shows a picture+name for a populated doc and the
  `UserOutlined` fallback for an empty-picture doc.
- The `user-multi-selector` page renders a multi-select of `is_user: true` users and the read-back
  display shows an **array** of selected ids.

## Files

- `apps/demo/pages/user-avatar-demo.yaml` — create (avatar demo; name at your discretion)
- `apps/demo/pages/user-multi-selector-demo.yaml` — create (multi-selector demo; may be merged with above)
- `apps/demo/lowdefy.yaml` — modify — register the new page(s) under `pages:`

## Notes

- Keep `avatar.yaml` (the existing unrelated `PageHeaderMenu` demo) untouched.
- The `user-multi-selector` options request needs `app_name` and the `user-contacts-collection`
  connection — both already configured for the demo's `user-account` entry. If the demo has no seeded
  `is_user: true` users, the picker will render empty but still demonstrate the array-write contract.

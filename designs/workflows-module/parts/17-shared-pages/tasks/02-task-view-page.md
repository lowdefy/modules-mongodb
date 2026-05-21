# Task 2: Ship `pages/task-view.yaml` — read-only task page

## Context

Part 17 ships three shared task-action pages plus one workflow overview page under `modules/workflows/pages/` (a directory that doesn't exist yet — this is the first task to create it).

`task-view` is the read-only surface for any task action. The page is addressed by `?action_id=<id>` URL query; the `action` doc determines what gets rendered. No writes, no role gate guard on buttons (there are no buttons), no `required_after_close` banner, no stale-URL redirect (view is always reachable).

Establishing this page first sets the page-shell pattern that `task-edit` (task 3) and `task-review` (task 4) build on:

- `layout.page` wrapper from the layout module.
- `layout.card` for content sections.
- Reuse of part 16's request files at `modules/workflows/requests/`. Task-view fires only `get_action.yaml` (no workflow fetch, no entity fetch — per design § "Reused module-shipped requests" and `onMount` sequence steps 4 and 5).
- Universal-fields display via `_ref` to part 24's component path (part 24 hasn't shipped; this is a path-stub).

## Task

Create `modules/workflows/pages/task-view.yaml` matching the design § "Task pages" → `pages/task-view.yaml` bullet:

- **Page id:** `task-view` (gets auto-scoped to `workflows/task-view` by the module entry id).
- **URL query:** `?action_id=<id>`.
- **Top-level wrap:** `_ref` to `layout.page` with content_width and chrome.
- **Requests:** `get_action.yaml` and `get_workflow.yaml` reused from part 16's `modules/workflows/requests/`. Do **not** fetch the entity doc on task pages (per design § "Reused module-shipped requests" — task pages don't render entity-context fields or back-links in v1).
- **`onMount` sequence:** eight steps per design § "`onMount` sequence (task pages)". For task-view specifically:
  1. `action_id` presence guard — Link back if `_url_query.action_id` is null.
  2. `Request: get_action`.
  3. Stale-URL redirect guard — **omitted** on view (view is always reachable; see design § "Stale-URL redirect guards (task pages)" allowlist).
  4. `Request: get_workflow` — **skipped** on view (no form-state priming needed for read-only).
  5. `Request: get_entity` — **skipped** (per design — task pages don't fetch entity).
  6. `action_role_check` — sets `_state.action_allowed`. For view this is informational only (no buttons to gate); still emit it so the sequence stays in sync with part 16 and so apps that author `onMount` handlers can read `_state.action_allowed`.
  7. `SetState` — no form state to prime on view; emit as a no-op slot (kept for sequence parity per design — "this step is a no-op slot (kept for sequence parity so adding a future input doesn't shift step numbers)").
  8. Author-supplied `pages.view.events.onMount` from `_var: page_config.events.onMount`, default `[]`.

  Pattern to follow: see `modules/workflows/templates/view.yaml.njk` lines 41–91 — it emits the same eight-step skeleton. Adapt for plain-YAML (not Nunjucks) since task pages are static, not resolver-emitted. Specifically: no Nunjucks render-time vars (`{{ entity_collection }}` etc.) — task pages know their structure at write time.

- **Blocks** (inside `layout.page.blocks`):
  - **Action header card:** title from `_request: get_action.title` (or workflow YAML, TBD by the worked-example fixture), current status badge from `_global: action_statuses.{_request: get_action.status.0.stage}`.
  - **Universal-fields display:** `_ref` to `../components/universal-fields/universal-fields.yaml` with `vars: { mode: display, kind: task, action_data: { assignees, due_date, description } }` — mirror the pattern from `templates/view.yaml.njk` line 103–114.
  - **Status timeline:** render `_request: get_action.status` array as a timeline. Each entry shows the stage badge + `created.timestamp` + (when present) `error_message`. v1 shape — a simple ordered list is fine.
  - **Comment timeline:** events filtered by `action_ids` includes `_request: get_action._id` AND `metadata.comment` is populated, ordered by `created.timestamp` DESC. Use the events module's existing request pattern if one exists; otherwise inline a small request that hits the events collection. (Comment-timeline shape refinement is explicitly out-of-scope per design — ship the v1 shape and iterate later.)

- **Layout composition:** wrap each content section in `layout.card` (no shadow / chrome variant — see part 16's templates for the established style).

- **Author chrome slots:** task-view supports `pages.view.events.onMount` only (per design § "What's supported on task actions"). Do NOT wire `formHeader` / `formFooter` / `title` / `requests` / `modals` / `maxWidth` — those are rejected at build time by part 4's validator.

## Acceptance Criteria

- `modules/workflows/pages/task-view.yaml` exists and parses as valid Lowdefy YAML.
- Page id is `task-view` (kebab-case per CLAUDE.md `pages/` convention for module-shared pages).
- `layout.page` wrap with `id: task-view`, `content_width` and `hide_title` settings appropriate to a view page (match part 16's `view.yaml.njk` choices).
- `onMount` array contains the eight steps in order, with step 3 (stale guard) and step 5 (get_entity) explicitly absent and step 7 a SetState no-op — leave comments in the YAML matching part 16's template comments (`# Step 3 (stale-URL guard) — intentionally omitted on view.`).
- `_request: get_action` resolves correctly when the page loads with a valid `?action_id`. The page does NOT emit `get_workflow` in onMount (the design says task-view *skips* step 4 — `get_workflow` is task-edit-only) and does NOT emit `get_entity` (the design says task pages don't fetch the entity doc).
- Universal-fields component `_ref` matches the path used by part 16's `view.yaml.njk` (`../components/universal-fields/universal-fields.yaml`) — even though part 24 hasn't shipped the file. Lowdefy build will fail until 24 ships; that's expected.
- `action_role_check` `_ref` matches the path used by part 16 (`../components/action_role_check.yaml`).
- Page builds cleanly **once parts 18 and 24 ship** the missing components. Until then, build failure is expected and acceptable per the part 17 design's posture.

## Files

- `modules/workflows/pages/task-view.yaml` — **create** — the read-only task page.

## Notes

- This is the first file in `modules/workflows/pages/` — the directory needs to be created.
- Re-read the design's task-view bullet: action header (title from YAML, current status badge), universal-fields display, status timeline, comment timeline. Four content sections inside the layout.card wrap.
- Comment timeline references the events module's data shape — check `modules/events/` for the canonical events request pattern. If the request shape requires fields from `events-collection` that the consumer doesn't have, fall back to a Lowdefy `Request` block hitting the events collection directly with a `$match` on `action_ids` and `metadata.comment.$exists: true`.
- Keep the file at sub-200-line scale by extracting any repeated chunks (status badge rendering, timeline row) into nested blocks; do NOT extract into separate component files for v1 — single-file ownership keeps drift surface low. Component extraction is a follow-up if a real second consumer emerges.
- See part 16's `view.yaml.njk` for the request/event/block patterns to mirror. Strip the Nunjucks-specific bits (`{{ entity_collection }}`, `_build.array.concat` for the `requests` and `onMount` arrays — task pages don't need the build-time concat because there are no per-action vars to merge).

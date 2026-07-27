# Task 6: Register the four shared pages in `module.lowdefy.yaml`

## Context

The current `modules/workflows/module.lowdefy.yaml` declares enum components, the `action_form_configs` global, and the part 19 Apis — but has no `pages:` block (the comment in the file says "page/menu exports ... lands in part 20").

Part 17 ships four new pages: `task-edit`, `task-view`, `task-review`, `workflow-overview`. They need to be registered in the manifest so:

1. The Lowdefy build picks them up (without registration, page YAML files in `pages/` aren't loaded).
2. Consuming apps can reference them via `_module.pageId: { id: task-edit, module: workflows }` etc.

Part 20 owns the broader manifest wiring (`exports.pages`, vars, secrets, connections). This task adds the four page entries incrementally, in the same posture parts 4 / 15 / 19 took — adding their slice and leaving a note for part 20 to consolidate.

## Task

Update `modules/workflows/module.lowdefy.yaml`:

1. **Add `pages:` block** at the top level (alongside `components:`, `api:`, `global:`):

   ```yaml
   pages:
     - _ref: pages/task-edit.yaml
     - _ref: pages/task-view.yaml
     - _ref: pages/task-review.yaml
     - _ref: pages/workflow-overview.yaml
   ```

2. **Add `exports.pages` entries** under the existing `exports:` block:

   ```yaml
   exports:
     # ... existing components and api entries ...
     pages:
       - id: task-edit
         description: Shared task-action edit page — status selector + universal fields + Save. Addressed by ?action_id=<id>.
       - id: task-view
         description: Shared task-action view page — read-only universal fields + status timeline + comment timeline. Addressed by ?action_id=<id>.
       - id: task-review
         description: Shared task-action review page — read-only fields + approve / request_changes buttons. Addressed by ?action_id=<id>.
       - id: workflow-overview
         description: Workflow detail page — header + action cards with form_data DataView. Addressed by ?workflow_id=<id>.
   ```

3. **Update the leading comment** to mention that part 17's shared pages are now registered:

   ```yaml
   # This manifest declares the part-04 enum components ..., the part-15 global
   # register (action_form_configs), the part-17 shared pages (task-edit /
   # task-view / task-review / workflow-overview), and the part-19 operational
   # APIs ... The remaining module surface ... lands in part 20.
   ```

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` contains a top-level `pages:` array with four `_ref` entries pointing at the files created in tasks 2–5.
- `exports.pages` contains four entries with `id` matching the page filenames (without `.yaml` suffix) and descriptions matching the design's bullet for each page.
- Leading comment updated to reflect part 17's contribution.
- File parses as valid YAML; `pnpm ldf:b` succeeds (assuming parts 18 and 24 have shipped — otherwise expected build failure on the missing component path-stubs).
- The four pages are resolvable from consuming apps via `_module.pageId: { id: <page-id>, module: workflows }`.

## Files

- `modules/workflows/module.lowdefy.yaml` — **modify** — add `pages:` block, extend `exports`, update leading comment.

## Notes

- Other parts followed the same incremental pattern: parts 4, 15, 19 each added their slice and left a placeholder comment for part 20 to consolidate. Don't reshape the file structure; just add the new section.

- The CLAUDE.md "Register new APIs in lowdefy.yaml" rule has a parallel for pages — a `pages/*.yaml` file that isn't referenced won't be loaded.

- `exports.pages` is what makes the pages addressable from consuming apps. Without the export, consumers can't `_module.pageId` resolve them. Both the `pages:` array AND the `exports.pages` entries are required.

- The page id matches the filename: `task-edit.yaml` → `id: task-edit`. The module entry id prefix (`workflows`) is added automatically at consume time. So a consuming app sees URLs like `/workflows/task-edit?action_id=...`.

- Build check: after this task, `pnpm ldf:b` against the demo app should attempt to resolve the four pages. If parts 18 / 24 / `layout.card` / `layout.floating-actions` haven't shipped yet, the build will fail on those missing components — that's expected per the part 17 posture. Confirm the failure is exclusively on the dependency path-stubs, not on the part 17 page files themselves.

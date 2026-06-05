# Task 3: Render layer

## Context

Part 30's display contract is salvaged unchanged on disk: per-app cells spread at the top level of the action doc (`action.demo`, `action['app-a']`), sticky display across transitions, top-level `status_title`, accumulated `metadata`. The only change is **when** rendering happens — during the plan phase against the planned post-commit doc, not on write. This task builds the pure render helpers the planners call; it does not wire them into a phase yet.

The one access-model change from Part 34 D7: links become a **per-verb `links` map** (`{ view, edit, review, error }` per slug) computed by `computeEngineLinks`, replacing Part 30's single `<slug>.link`.

This task depends on task 4 because `computeEngineLinks` uses the `entry_id` connection field for build-time `_module.pageId` scoping, and references the renamed fixed-page ids (`workflow-action-view/edit/review` — final ids per review-14 #1; task 18 flips the implemented interim `workflow-simple-*` strings) and the unprefixed derived-page ids (`{workflow_type}-{action_type}-{verb}`) per Part 34 D10.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/render/`:

- `parseNunjucks.js` — **move** from `src/blocks/ContactSelector/parseNunjucks.js` (per Part 30). Update the original import site(s).
- `renderTree.js` — recursive Nunjucks walker (Part 30 D13). Walks an object/array tree rendering every string template against a context.
- `renderStatusMap.js` — orchestrator for action-doc cell rendering. Inputs: the `status_map` cell for the target stage, the planned action doc, the merged metadata. Output: the rendered cell ready to spread into the action doc (`<slug>.message`, etc.).
- `computeEngineLinks.js` — per-verb link **map** computation. For built-in kinds, builds `links: { view, edit, review, error }` per slug from the **kind × stage × verb** table (Part 34 D7), each cell `null` where the slug doesn't declare the verb or the stage has no meaningful page. Per-verb *role gates* do **not** enter this computation (they filter `visible_verbs` on read). Uses `entry_id`-scoped pageId. `urlQuery` carries `action_id` for simple/form, `workflow_id` for tracker. Supersedes Part 30 D4's single-link computation.
- `substituteActionIdSentinel.js` — for `kind: custom` cell links per Part 30 D5 (sentinel substitution in author-authored links).
- `renderEventDisplay.js` — renders the event payload `display` block per Part 30 D14 (plain Nunjucks strings).
- `*.test.js` for each.

## Acceptance Criteria

- `parseNunjucks` lives under `render/` and the old ContactSelector import path is updated (no dangling import).
- `computeEngineLinks` returns a `{ view, edit, review, error }` map per slug, with `null` for undeclared verbs / page-less stages; it does **not** consult role gates.
- The link table targets use the final Part 34 D10 page ids: fixed simple-kind pages `workflow-action-{verb}` (final ids per review-14 #1; task 18 coordinates the flip); derived per-type pages `{workflow_type}-{action_type}-{verb}` (unprefixed).
- Simple-kind special case (review-14 #4): the `error` verb targets the **view** page (`workflow-action-view`) — the simple kind has no error page (Part 40 D4); form kind's `error` verb targets its generated `-error` page as normal.
- `renderStatusMap` produces a cell that, when spread, yields sticky `<slug>.message` (prior value carried unless overwritten).
- Built-in kinds reject author `link:` (validation lives in task 6); custom kinds run through `substituteActionIdSentinel`.
- All helpers are pure (no I/O).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/parseNunjucks.js` — create (moved from `src/blocks/ContactSelector/parseNunjucks.js`)
- `src/blocks/ContactSelector/parseNunjucks.js` — delete; update importers
- `plugins/modules-mongodb-plugins/src/connections/shared/render/renderTree.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/render/renderStatusMap.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/render/substituteActionIdSentinel.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/render/renderEventDisplay.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/render/*.test.js` — create

## Notes

- These are the same algorithms Part 30 specified; the only behavioural delta is the per-verb links **map** (vs single link). Keep the on-disk doc shape identical to Part 30.
- `computeEngineLinks` is the write-path-coupled half of the Part 34 access work (per D16) — it lives with the rebuild, unlike the read-path `visible_verbs_filter` (task 7).

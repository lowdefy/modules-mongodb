# Consistency Review 3

## Summary

Three inconsistencies found after task-file creation. All resolved — two auto-resolved (stale alternative inside one task file; connection-ID drift between design and tasks). One held for user input (events dependency) and resolved as option (a): `events` goes back into `dependencies` because `workflow-api.yaml`'s `changeStamp` ref consumes it.

## Files reviewed

- **Design:** `designs/workflows-module/parts/20a-module-manifest-static/design.md`
- **Reviews:** `review/review-1.md`, `review/consistency-2.md`
- **Tasks:** `tasks/tasks.md` + `tasks/01..08-*.md` (all eight)
- **Cross-referenced specs (read-only):** `designs/workflows-module-concept/module-surface/spec.md`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`

## Inconsistencies found

### 1. `dependencies: [layout]` vs task 1+2 wiring `events` for `changeStamp`

**Type:** Internal contradiction (design.md vs tasks/02-manifest-deltas.md driven by tasks/01-add-connection-files.md)
**Source of truth:** Ambiguous — see below.
**Files affected:** `design.md` (`dependencies` section, line 52–56), `tasks/01-add-connection-files.md` (specifies `changeStamp: _ref: { module: events, component: change_stamp }` on `workflow-api.yaml`), `tasks/02-manifest-deltas.md` (declares `events` as a dependency).
**Resolution:** **Option (a) selected by user.** `events` returns to `dependencies` because `workflow-api.yaml` consumes the events module's `change_stamp` component. The design's `### dependencies` section was rewritten to list both `layout` and `events` with concrete per-dependency rationales, and the paragraph that previously argued "events is not used at all" was replaced with a corrected version explaining that `events` is real (via `changeStamp`) and `notifications` alone defers to 20b. `review-1.md` finding #4's resolution annotation was updated to record the original (b) decision being revised by this consistency review. Tasks 1 and 2 already matched option (a), so no task-file changes were needed.

**Quote — design.md line 52–56:**
> ### `dependencies`
> - `layout` — consumed by every shared page (`module: layout` refs in `pages/task-edit.yaml`, ...).
>
> The static surface does not consume `events` or `notifications` anywhere — a grep over `modules/workflows/{pages,components,api}/` finds no `module: events` or `module: notifications` refs. Those modules become real dependencies in part 20b once the per-action endpoint lands...

**Quote — `tasks/01-add-connection-files.md` (workflow-api.yaml spec):**
> - `changeStamp: { _ref: { module: events, component: change_stamp } }` — wires the events module's change_stamp into engine writes

**Quote — `tasks/02-manifest-deltas.md`:**
> ```yaml
> dependencies:
>   - id: layout
>   - id: events
>     description: Provides the `change_stamp` component referenced by the `workflow-api` connection.
> ```

**Why the design's grep missed this.** The design's grep was over `modules/workflows/{pages,components,api}/` — none of those exist yet for the connection layer. The grep correctly reported "no cross-module refs in the directories that already exist," but the new `connections/` directory the tasks create *will* contain a cross-module ref if `changeStamp` is wired.

**Why `changeStamp` matters.** The plugin schema at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` line 54–58 documents `changeStamp` as "resolves to the events module change_stamp at app build time (typically via `_ref: { module: events, component: change_stamp }`). The engine reads it at handler entry and stamps every workflow + action doc write with it via `created` and `updated`." It is *optional* in the schema (`required: ['databaseUri']` only), so the connection file can omit it — but then engine writes go un-stamped.

**Two valid paths.** (a) Wire `changeStamp` in the connection and add `events` to dependencies (matches the on-disk plugin pattern, contradicts the design's "no `events` dep" line). (b) Drop the `changeStamp` ref from `workflow-api.yaml` and leave engine writes un-stamped in 20a, deferring the dep to 20b alongside the rest of the events/notifications wiring.

### 2. Task 5 body and Notes contradicted each other on connection ID

**Type:** Internal contradiction (one task file contradicting itself)
**Source of truth:** The workflow concept spec (`module-surface/spec.md:159`: `entity_collection` is "the MongoDB collection connection id (e.g. 'leads-collection')") + cross-task consistency (tasks 4, 6, 7 all use `leads-collection`).
**Files affected:** `tasks/05-demo-leads-pages.md`.
**Resolution:** Updated the task body to use `id: leads-collection` (not `leads`) for the inline `MongoDBCollection` connection, and updated both narrative mentions ("backed by the `leads-collection` connection") to match. Replaced the contradictory Notes paragraph with a clean single-line rationale citing the concept spec. The four lead pages' `connectionId` references now consistently point at `leads-collection`.

### 3. Design's "Files added under apps/demo" said `leads` connection; concept spec + tasks say `leads-collection`

**Type:** Design-vs-Task drift (design lagged behind the task layer, which is correctly backed by the concept spec)
**Source of truth:** `designs/workflows-module-concept/module-surface/spec.md:159` — `entity_collection` is defined as "the MongoDB collection connection id (e.g. 'leads-collection')."
**Files affected:** `design.md` line 112 (the `apps/demo/lowdefy.yaml` two-edits bullet).
**Resolution:** Updated the design's bullet to specify `leads-collection` as the connection ID with a one-line rationale citing the concept spec. The design's "Tracker-only demo wiring" section already uses `leads-collection` consistently in narrative; only the operational-edits bullet had the stale `leads` name.

## No issues found in

- `tasks/tasks.md` ordering rationale and dependency table — consistent with the design's six-step proposed change.
- `tasks/03-author-readme.md` — fully aligned with review-1 #9 (vars.entities worked example).
- `tasks/04-demo-workflow-config.md` — child workflow shape matches review-1 #6 resolution (one `kind: task` "install-step" action; spec's minimal shim).
- `tasks/06-wire-workflows-module-entry.md` — `entities` map shape + key consistent with the design.
- `tasks/07-lead-view-workflow-buttons.md` — admin-style framing for Close/Cancel buttons matches the design's "Child workflow rendering — skipped in 20a" section.
- `tasks/08-e2e-spec.md` — single filename + walk-through automation aligned with review-1 #12.
- Part 27 retirement — no orphan references remain in tasks (the cleanup from consistency-2 was thorough).
- Plugin pin (`^0.6.0`) — consistent across design, task 1, task 2, task 3.

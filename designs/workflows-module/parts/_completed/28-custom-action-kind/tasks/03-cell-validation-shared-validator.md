# Task 3: Permit `view_link:` for custom + shared link-shape validator

## Context

(Depends on task 2, which made `custom` a live kind.)

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

- `validateTrackerStartLink` (line 361) validates a tracker's
  `tracker.start_link` against an exact link shape: `pageId` (non-empty string),
  optional `urlQuery` (plain object), where the reserved sentinel keys
  `action_id` / `entity_id` (`TRACKER_URL_QUERY_SENTINEL_KEYS`, line 359) must
  carry exactly `true` and all other `urlQuery` keys must be strings. Allowed
  top-level keys are exactly `pageId` / `urlQuery`
  (`TRACKER_START_LINK_ALLOWED_KEYS`, line 358).

- `validateStatusMapCells` (line 431) already branches on
  `isCustom = action.kind === "custom"` to permit a `link:` cell (line 466:
  built-in kinds reject `link:`, custom does not). It does **not** yet permit
  `view_link:`, and it does not validate the internal shape of `link:` /
  `view_link:` cells.

A custom action's cells carry `{ message?, link?: { pageId, urlQuery? },
view_link?: { pageId, urlQuery? } }`. Both `link` and `view_link` use the **same
link shape** that `validateTrackerStartLink` already enforces — so the validation
logic must be extracted and shared, not duplicated (CLAUDE.md "one correct way").

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. **Extract** the link-shape-validation body of `validateTrackerStartLink` into a
   shared helper, e.g.
   `validateEngineLinkShape(workflow, action, link, label)` where `label`
   identifies the source for error messages (`tracker.start_link`,
   `status_map.{stage}.{slug}.link`, `status_map.{stage}.{slug}.view_link`). The
   helper enforces: top-level keys ⊆ `{ pageId, urlQuery }`; `pageId` non-empty
   string; `urlQuery` (if present) a plain object whose sentinel keys
   (`action_id` / `entity_id`) are exactly `true` and whose other values are
   strings. Reuse the existing `TRACKER_START_LINK_ALLOWED_KEYS` /
   `TRACKER_URL_QUERY_SENTINEL_KEYS` sets (rename them if the shared naming reads
   better, but keep one source of truth).

2. Rewrite `validateTrackerStartLink` to call the shared helper (it keeps its own
   `if (!action.tracker?.start_link) return;` guard and passes
   `tracker.start_link` as the label).

3. Extend the `isCustom` branch of `validateStatusMapCells` to also permit
   `view_link:` (so neither `link:` nor `view_link:` trips the engine-managed
   rejection for custom), and to validate both cells' shape via the shared helper.
   Built-in kinds still reject both `link:` and `view_link:`.

## Acceptance Criteria

- `validateTrackerStartLink` and the custom cell validation share one link-shape
  validator — no duplicated shape logic.
- `kind: custom` cell with a valid `link:` and/or `view_link:` validates.
- `kind: custom` cell rejects: missing/empty `pageId`; a sentinel key whose value
  is not exactly `true`; an unknown top-level key; a non-string non-sentinel
  `urlQuery` value.
- A built-in kind (`check`/`form`/`tracker`) with a `link:` **or** `view_link:`
  cell still rejects.
- Existing `validateTrackerStartLink` tests still pass (behaviour preserved
  through the extraction).
- New `makeWorkflowsConfig.test.js` cases pass.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — extract shared link-shape validator; rewire `validateTrackerStartLink`; extend `validateStatusMapCells` `isCustom` branch for `view_link:` + shape validation.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add custom-cell valid/invalid cases and a built-in-kind `view_link:` rejection.

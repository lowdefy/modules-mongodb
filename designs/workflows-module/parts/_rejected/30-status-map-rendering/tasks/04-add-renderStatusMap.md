# Task 4: Add `renderStatusMap` orchestrator

## Context

`renderStatusMap` is the single entry point for rendering an action's `status_map[stage]` cell. It is called by `createAction` (initial insert), `updateAction` (single update), and the Cancel/Close cascade (per-action sweeps). It uses the `renderTree` walker (Task 1) and the sentinel-swap helper (Task 2).

Sticky display means an absent cell is normal — the helper must return an empty object so the caller can spread it without touching previous-stage fields on the action doc.

Render context (per design D10) is the merged action doc plus merged metadata:

```js
const renderCtx = {
  ...mergedActionDoc, // pre-write doc, or in-memory draft on initial insert
  ...mergedMetadata, // { ...actionDoc.metadata, ...payload.metadata }
};
```

The caller-supplied override (`payload.action_display`, per D8) replaces the per-slug subtree of the cell after deep-clone but before render — so the override can still reference metadata via Nunjucks. Overrides work even if no cell exists; they're written under the slug's top-level key like any rendered field.

For `kind: custom`, run `substituteActionIdSentinel` on the rendered tree to swap `{ action_id: true }` → `actionId`. For built-in kinds, no sentinel pass.

## Task

Add `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.js` exporting a default function:

```js
renderStatusMap({ actionConfig, stage, mergedActionDoc, actionDisplay, mergedMetadata, actionId }) → { renderedCell }
```

Inputs:

- `actionConfig` — resolved per-action config; carries `kind` and `status_map`.
- `stage` — the new stage.
- `mergedActionDoc` — `{ ...actionDocBeforeWrite, ...callerFields }` at the call site, or the in-memory draft for the initial-insert path.
- `actionDisplay` — caller-supplied `payload.action_display` (object keyed by slug, or `null` / `undefined`).
- `mergedMetadata` — `{ ...actionDocBeforeWrite.metadata, ...payload.metadata }`.
- `actionId` — used by sentinel substitution on the custom-kind path; on initial insert this is `draft._id`.

Output: `{ renderedCell }` — an object ready to spread onto the `$set` payload. `{}` when no cell exists and no override is supplied.

Steps:

1. Look up `cell = actionConfig.status_map?.[stage]`. If absent and no `actionDisplay` keys apply, return `{ renderedCell: {} }`.
2. Deep-clone the cell (so mutation of the clone doesn't mutate config). Start from `{}` if no cell.
3. For each slug in `actionDisplay`, replace `clone[slug]` with the override's slug subtree.
4. Build `renderCtx = { ...mergedActionDoc, ...mergedMetadata }`.
5. `rendered = renderTree(clone, renderCtx)`.
6. If `actionConfig.kind === 'custom'`, `rendered = substituteActionIdSentinel(rendered, actionId)`.
7. Return `{ renderedCell: rendered }`.

Add `renderStatusMap.test.js` covering:

- Cell renders against `mergedActionDoc` fields (e.g. `{{ key }}`, `{{ assignees[0].name }}`).
- Cell renders against merged metadata (e.g. `{{ physical_id }}` where `mergedMetadata.physical_id = 'D-42'`).
- Absent cell returns `{ renderedCell: {} }`.
- `actionDisplay.{slug}` replaces the per-slug subtree before render; the override's Nunjucks expressions are evaluated against the same context.
- `actionDisplay` for a slug with no original cell still produces a rendered slug entry.
- Sentinel swap runs only for `kind: custom` (assert that a `{ action_id: true }` in a `task` cell would not be swapped — but the validator catches that case; this is shape behaviour).
- For `kind: custom`, sentinel swap produces the action UUID at the `link.urlQuery.action_id` path.
- `status_title` is rendered as a top-level scalar (string in, string out).

## Acceptance Criteria

- Helper and test file exist under `src/connections/shared/`.
- All test cases pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.test.js` — create.

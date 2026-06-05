# Task 3: Planner refreshes `doc.tracker` (incl. `start_link`) on every plan; widen typedef

## Context

Task 2 made `computeEngineLinks` read `action.tracker.start_link` off the composed action doc — but nothing puts it there. `planActionTransition.js` narrows the persisted `tracker` field to `{ workflow_type }` on the insert path only (lines 156–159):

```js
tracker:
  actionConfig.kind === 'tracker'
    ? { workflow_type: actionConfig.tracker.workflow_type }
    : null,
```

and the update path just spreads the loaded doc, so a tracker doc never carries `start_link` and never refreshes it.

Design D1: the planner refreshes the tracker block from config **on every plan**, joining the existing denormalisation block at lines 178–183 (`doc.access = actionConfig.access; doc.workflow_type = loadedWorkflow.workflow_type;` — the one pattern by which `computeEngineLinks` gets config-derived fields: off the composed doc, never a synthesized view). This refresh is a denormalisation detail, **not** a config-versioning mechanism — edits to `start_link` on deployed workflows remain external-migration territory like every other config change.

## Task

1. **`planActionTransition.js`** — in the persisted-denormalisation block (next to `doc.access` / `doc.workflow_type`, before `renderStatusMap` and `computeEngineLinks` run), assign on both operations:

   ```js
   doc.tracker =
     actionConfig.kind === 'tracker'
       ? {
           workflow_type: actionConfig.tracker.workflow_type,
           ...(actionConfig.tracker.start_link != null
             ? { start_link: actionConfig.tracker.start_link }
             : {}),
         }
       : null;
   ```

   Remove the now-redundant narrowed `tracker:` field from the insert draft literal (the denorm assignment supersedes it; it runs before `computeEngineLinks`, so link computation sees the refreshed block). Extend the denormalisation comment (lines 178–181) to mention `tracker` alongside `access` / `workflow_type`.

2. **`types.js`** (`plugins/modules-mongodb-plugins/src/connections/shared/types.js:59`) — widen the `ActionDoc` tracker property:

   ```js
   * @property {{ workflow_type: string, start_link?: { pageId: string, urlQuery?: Object } } | null} tracker
   ```

3. **`planActionTransition.test.js`** — update and extend:
   - The existing `tracker kind: unblock from blocked lands action-required` test passes `actionConfig: makeConfig({ kind: 'tracker' })` with **no `tracker:` block** — after this change that fixture would throw reading `actionConfig.tracker.workflow_type`. Give tracker-kind configs a `tracker: { workflow_type: ... }` block (config validation guarantees one exists in real config, so the fixture should too).
   - New: **update path refreshes the block** — plan an `unblock` on a tracker action whose loaded doc has `tracker: { workflow_type: 'child-type' }` but whose `actionConfig.tracker` declares `start_link`; assert `result.doc.tracker` equals `{ workflow_type, start_link }`.
   - New: **end-to-end link materialisation** — tracker config with `start_link` (both sentinels + a static) and `access: { demo: { view: true, edit: true } }`; `unblock` from `blocked` lands `action-required`; assert `result.doc.demo.links.edit` equals the substituted link (`action_id` → the action `_id`, `entity_id` → the doc's `entity_id`, static verbatim, `pageId` unscoped). This exercises task 2's arm through the planner.
   - New (or assert within an existing case): **non-tracker kinds get `tracker: null`** on update as well as insert.
   - Existing spawn test (`tracker spawn births via the none row`) keeps its `expect(result.doc.tracker).toEqual({ workflow_type: 'child-type' })` assertion — no `start_link` in that fixture, so the refreshed block must not grow an undefined-valued key.

## Acceptance Criteria

- `doc.tracker` is config-refreshed on **both** insert and update plans; `start_link` present iff declared in config; `null` for non-tracker kinds.
- An unblock into `action-required` on a tracker with `start_link` + a slug-declared `edit` verb persists `{slug}.links.edit` with sentinels substituted (end-to-end through `computeEngineLinks`).
- Typedef widened in `types.js`.
- `npx jest planActionTransition` passes from repo root; the full `npx jest plugins/modules-mongodb-plugins` suite stays green (the engine handler tests exercise the planner with tracker fixtures).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — modify — `doc.tracker` refresh in the denormalisation block; drop the narrowed insert-draft field; comment update.
- `plugins/modules-mongodb-plugins/src/connections/shared/types.js` — modify — widen the `tracker` property on `ActionDoc`.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.test.js` — modify — fixture fix + new cases.

## Notes

- Depends on task 2 (the end-to-end assertion goes through the new `computeEngineLinks` arm).
- Placement matters: the assignment must sit with the existing denorm block (after the draft is built, before `renderStatusMap` / `computeEngineLinks`) so link computation reads the refreshed block. Like `access` / `workflow_type`, it intentionally overrides anything arriving via `payload.fields`.
- Search the wider engine test suites (e.g. handler tests under `src/connections/`) for tracker-kind `actionConfig` fixtures lacking a `tracker:` block — any such fixture now throws and needs the block added. `git grep -n "kind: 'tracker'" plugins/` is a quick sweep.

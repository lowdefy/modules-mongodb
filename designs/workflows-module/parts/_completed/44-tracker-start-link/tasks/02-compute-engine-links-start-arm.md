# Task 2: Second tracker arm in `computeEngineLinks` — emit the start link

## Context

`plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` computes the per-slug, per-verb engine link map `{ view, edit, review, error }` for built-in action kinds (Part 34 D7). Its tracker branch (lines 68–79) today has a single arm: when the slug declares `view` and `child_workflow_id != null`, emit `links.view` to the child's `workflow-overview`. A tracker that is unblocked but whose child hasn't been started (`action-required`, `child_workflow_id: null`) gets all-null links — a dead row.

Part 44 gives that state a navigation target: when the author declares `tracker.start_link` (`{ pageId, urlQuery? }`), the engine emits it as the action's **`edit`-verb** link — "may start the child." The function reads `start_link` off the composed action doc (`action.tracker.start_link`); task 3 makes the planner put it there. This task is a pure-function change with unit tests — its tests construct action docs directly.

Sentinel convention (design D3): in `start_link.urlQuery`, the value `true` on key `action_id` means "substitute the tracker action's `_id`" (this becomes the `parent_action_id` the destination page hands to `start-workflow`), and `true` on key `entity_id` means "substitute the action's `entity_id`" (the parent workflow's entity, for prefilling the child doc's parent reference). All other values are static strings passed through verbatim. Substitution happens here, inside the new arm — mirroring how the existing arms construct `urlQuery` directly with concrete values (NOT by calling `substituteActionIdSentinel.js`, which is the custom-kind cell-link mechanism). Config validation (task 1) guarantees only valid shapes reach the engine.

## Task

Modify the tracker branch of `computeEngineLinks`:

1. Keep the existing `view` arm unchanged (child exists → `view` link to `workflow-overview`, entry-scoped, `urlQuery: { workflow_id }`).
2. Add a second arm: emit `links.edit` when **all** of:
   - the slug declares the `edit` verb (`'edit' in verbsDeclared` — role gates do NOT enter this computation, consistent with the existing arms; `visible_verbs` filters at read time),
   - the action's stage is `action-required`,
   - `action.child_workflow_id == null` (the null-child guard makes precedence explicit: if a child somehow exists at `action-required`, the view arm wins and edit stays null),
   - `action.tracker?.start_link` is declared.

   The emitted link:
   - `pageId` — used **verbatim** (NOT wrapped in `scoped(entryId, ...)`): it's an app page id, or a module page already build-resolved via `_module.pageId` in the app's `workflow_config`.
   - `urlQuery` — present iff declared on `start_link`; each entry substituted: `action_id: true` → `action._id`, `entity_id: true` → `action.entity_id`, string values verbatim.

3. `blocked` and all other pre-child stages stay linkless (the stage condition handles this).
4. Update the header comment's tracker line (currently lines 21–22) to describe both arms, e.g.:
   - child exists → `view` to child `workflow-overview` (urlQuery `workflow_id`)
   - `action-required` + null child + declared `tracker.start_link` → `edit` to the start link's page, **pageId verbatim (not entry-scoped)**, urlQuery sentinels `action_id` / `entity_id` substituted, statics verbatim.

Add tests to `computeEngineLinks.test.js` (existing style: direct calls with literal action docs, `ENTRY = 'workflows'`):

- **Pre-child start link emitted**: tracker at `action-required`, `child_workflow_id: null`, `access: { demo: { view: true, edit: true } }`, `tracker: { workflow_type: 'device-installation', start_link: { pageId: 'ticket-new', urlQuery: { action_id: true, entity_id: true, source: 'onboarding' } } }`, with `_id` and `entity_id` set on the doc. Expect `links.demo.edit` to equal `{ pageId: 'ticket-new', urlQuery: { action_id: <_id>, entity_id: <entity_id>, source: 'onboarding' } }` — pageId NOT prefixed with `workflows/` — and `links.demo.view` null.
- **`edit` not declared** → `links.demo.edit` null even with `start_link` declared at `action-required` (view-only trackers stay display-only).
- **No `start_link` declared** → `edit` null at `action-required` (today's behaviour preserved).
- **`blocked` stays linkless** with `start_link` + `edit` declared.
- **Child-exists precedence**: child set while stage reads `action-required` → `view` arm emits the child-overview link, `edit` null.
- **`start_link` without `urlQuery`** → `links.edit` is `{ pageId }` with no `urlQuery` key (or assert the exact emitted shape you implement — keep it deliberate).
- Existing tracker test (`tracker kind: only view, ...`) keeps passing unchanged.

## Acceptance Criteria

- New arm emits exactly under the four conditions above; all existing tests in `computeEngineLinks.test.js` still pass.
- `pageId` is verbatim — no entry scoping.
- Sentinel substitution covers `action_id`, `entity_id`; statics pass through; no mutation of the config object (build a fresh `urlQuery`).
- Header comment table updated.
- `npx jest computeEngineLinks` passes from repo root.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — modify — second tracker arm + header comment.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.test.js` — modify — new tracker start-link cases.

## Notes

- Do NOT touch `substituteActionIdSentinel.js` — that's the custom-kind cell-link path; built-in kinds construct `urlQuery` directly (its header says so).
- Don't add defensive handling for invalid `urlQuery` values (`true` on other keys, non-strings) — `makeWorkflowsConfig` (task 1) rejects them at build time; the engine trusts validated config, consistent with the rest of the file.
- The composed docs in this codebase carry `tracker: { workflow_type }` today; `start_link` arrives on the doc via task 3's planner refresh. This task's tests construct the doc shape directly and don't depend on task 3.

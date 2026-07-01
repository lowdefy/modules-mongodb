# Task 2: Retarget the check engine-link branch to `{workflow_type}-check`

## Context

`plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js`
builds, per app slug, a per-verb link map `{ view, edit, review, error }` for
each action. For **check**-kind actions it currently points every verb at the
shared module pages `workflow-action-{verb}`, with a special case that maps the
`error` verb to `workflow-action-view` (lines 116–121):

```js
const page =
  kind === "check"
    ? verb === "error"
      ? "workflow-action-view"
      : `workflow-action-${verb}`
    : `${action.workflow_type}-${action.type}-${verb}`;
```

Part 56 (D3) replaces the three shared check pages with a **single
per-workflow** check page, `{workflow_type}-check`, that derives its mode from
the loaded action. Every non-null check cell — `error` included — now targets
that one page; the page reads `?action_id` and derives mode. The per-verb cells
themselves stay (the display layer still uses them for `visible_verbs`), only
their `pageId` changes. This **collapses the `error`-verb special case**.

## Task

1. In `computeEngineLinks.js`, change the check branch so every non-null check
   cell targets `{workflow_type}-check` (entry-scoped via the existing `scoped()`
   helper), dropping the `error → workflow-action-view` special case. The
   form/tracker/custom branches are unchanged. The resulting `page` selection for
   the check/form loop becomes:

   ```js
   const page =
     kind === "check"
       ? `${action.workflow_type}-check`
       : `${action.workflow_type}-${action.type}-${verb}`;
   ```

2. Update the JSDoc block at the top of the file (the `check ->` bullet, ~lines
   20–22) to describe the new single per-workflow target and the removal of the
   error-verb special case.

3. Rewrite the affected unit tests so they assert the new target verbatim:
   - `computeEngineLinks.test.js` (~lines 16–17, 62, 66–79): every check
     expectation becomes `{entry}/{workflow_type}-check`. The **dedicated
     error-verb test** (currently asserting `workflow-action-view`) is
     **rewritten** to assert the new `{workflow_type}-check` target — not merely
     edited.
   - The check-link retarget also breaks **check-action expectations across the
     handler suite**. In every test below, each
     `workflows/workflow-action-{view,edit,review}` expectation for a **check**
     action becomes `workflows/{workflow_type}-check`; **form-action
     expectations are unaffected**:
     - `GetEntityWorkflows.test.js` (~151–152, 316, 329, 342, 465, 492)
     - `GetEventsTimeline.test.js` (~151–153)
     - `StartWorkflow.test.js` (~335, 348, 352)
     - `GetWorkflowAction.test.js` (~245–247)
     - `GetWorkflowActionGroupOverview.test.js` (~152–153, 484)
     - `GetWorkflowOverview.test.js` (~157–158)
     - `planActionTransition.test.js` (~244, 419–423, 508)

## Acceptance Criteria

- For a check action, every declared/non-null verb cell (`view`, `edit`,
  `review`, `error`) resolves to `{entry}/{workflow_type}-check` with
  `urlQuery: { action_id }`.
- No code path emits `workflow-action-view`/`-edit`/`-review` for a check action.
- Form and tracker link computation is byte-for-byte unchanged.
- `pnpm jest` (the plugins package) passes for `computeEngineLinks.test.js` and
  every handler suite listed above.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — modify — collapse the check branch to `{workflow_type}-check`; update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.test.js` — modify — retarget check expectations; rewrite the error-verb test.
- `GetEntityWorkflows.test.js`, `GetEventsTimeline.test.js`, `StartWorkflow.test.js`, `GetWorkflowAction.test.js`, `GetWorkflowActionGroupOverview.test.js`, `GetWorkflowOverview.test.js`, `planActionTransition.test.js` — modify — retarget check-action link expectations only.

## Notes

- Line numbers are from the design and drift as files change — locate by the
  string `workflow-action-` and by `kind === 'check'`.
- This task is server-side only; it does not create the `{workflow_type}-check`
  page (Tasks 8 + 10 do). After this task the links point at a page id that does
  not yet resolve at runtime — acceptable; unit tests assert the string, and the
  page lands before the e2e retarget (Task 12).

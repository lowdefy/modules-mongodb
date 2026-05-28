# Task 3: Add `computeEngineLinks` helper

## Context

For built-in action kinds (`task`, `form`, `tracker`), the engine writes `action[slug].link` on every stage transition. The link is a deterministic function of `(kind, stage, slug's access verbs)`. Authors cannot write `link:` in cells for these kinds — the validator (Task 11) rejects it. For `kind: custom`, the engine returns `{}` here; the author's `link` flows through the rendered cell instead.

`task` link defaults (per design D4):

| Stage              | Slug has `edit` verb                             | Slug has only `view` verb | Slug has no relevant verb |
| ------------------ | ------------------------------------------------ | ------------------------- | ------------------------- |
| `action-required`  | `task-edit`                                      | `task-view`               | `null`                    |
| `in-progress`      | `task-edit`                                      | `task-view`               | `null`                    |
| `changes-required` | `task-edit`                                      | `task-view`               | `null`                    |
| `in-review`        | `task-review` if `review` verb, else `task-view` | `task-view`               | `null`                    |
| `done`             | `task-view`                                      | `task-view`               | `null`                    |
| `error`            | `task-view`                                      | `task-view`               | `null`                    |
| `blocked`          | `null`                                           | `null`                    | `null`                    |
| `not-required`     | `null`                                           | `null`                    | `null`                    |

Per-kind URL shape (every `pageId` is prefixed with `${entryId}/` so engine-written links match Lowdefy's build-time `_module.pageId` scoping at runtime — see design D4 § Mechanic):

| Kind      | `pageId`                                                       | `urlQuery`                                       |
| --------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `task`    | `{entryId}/task-{verb}` (per stage × verb table above)         | `{ action_id: actionDoc._id }`                   |
| `form`    | `{entryId}/{actionDoc.workflow_type}-{actionDoc.type}-{verb}`  | `{ action_id: actionDoc._id }`                   |
| `tracker` | `{entryId}/workflow-overview`                                  | `{ workflow_id: actionDoc.child_workflow_id }`   |

`tracker` returns `link: null` when `actionDoc.child_workflow_id` is null (tracker not yet started).

`_module.pageId` is a **build-time** operator — by the time the engine runs, all `_module.pageId: <name>` references in YAML have been resolved to concrete strings of shape `${entryId}/${name}`. The runtime engine has no `_module.pageId` to call, so the helper composes the scoped id by hand. The workflows module entry id is threaded into the engine via the new `entry_id` field on the WorkflowAPI connection schema (wired by Task 6 from `_module.id: true` in `connections/workflow-api.yaml`); callers (`updateAction`, `createAction`, Cancel/Close sweep) read it from `context.entry_id` and pass it into `computeEngineLinks` as `entryId`.

## Task

Add `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.js` exporting a default function:

```js
computeEngineLinks({ actionConfig, stage, actionDoc, entryId }) →
  // { [slug]: { $mergeObjects: ['$<slug>', { link: <linkOrNull> }] } } for built-in kinds
  // {} for kind: custom
```

Inputs:
- `actionConfig` — the resolved per-action config; carries `kind` and `access`.
- `stage` — the new stage being transitioned to.
- `actionDoc` — the merged action doc (`{ ...actionDocBeforeWrite, ...callerFields }` at the call site, or the in-memory draft for the initial-insert path). Read `_id`, `type`, `workflow_type`, `child_workflow_id` off this.
- `entryId` — the workflows module entry id (from `context.entry_id`). Required for built-in kinds; the helper prefixes every emitted `pageId` with `${entryId}/`. Throw if missing on a built-in-kind path (engine-runtime safety — a build that forgot to wire `entry_id` should fail loudly).

Implementation outline:
1. If `actionConfig.kind === 'custom'`, return `{}`.
2. Discover slugs: keys of `actionConfig.access` excluding the reserved `roles` and `notification_roles`.
3. For each slug, compute the link object (or `null`) from the per-kind rule above against the slug's access verbs and the new stage. Compose every non-null `pageId` as `${entryId}/<convention-name>` (e.g. `${entryId}/task-edit`, `${entryId}/${actionDoc.workflow_type}-${actionDoc.type}-edit`, `${entryId}/workflow-overview`).
4. Wrap each slug's update as a `$mergeObjects` expression so existing slug subtree fields (notably the rendered `message`) survive: `{ [slug]: { $mergeObjects: [`$${slug}`, { link: <computed> }] } }`.

Add `computeEngineLinks.test.js` covering:
- `task` kind: edit slug at every stage (`action-required` → `task-edit`, `done` → `task-view`, `blocked` → `null`, etc.).
- `task` kind: view-only slug always lands on `task-view` for non-null stages.
- `task` kind: `review` verb at `in-review` produces `task-review`; without the `review` verb it falls back to `task-view`.
- `task` kind: slug with no relevant verb → `link: null`.
- `form` kind: `pageId` interpolates `actionDoc.workflow_type` and `actionDoc.type`; `urlQuery: { action_id }`.
- `tracker` kind: with `child_workflow_id` set → `{ pageId: '${entryId}/workflow-overview', urlQuery: { workflow_id } }`.
- `tracker` kind: with `child_workflow_id` null → `link: null`.
- `tracker` kind: passing a merged doc with `child_workflow_id` set produces a link that references it (covers the StartWorkflow parent-tracker path from D11).
- `custom` kind: returns `{}` regardless of stage/access.
- `roles` and `notification_roles` keys in `access` are never treated as slugs.
- Every emitted `pageId` is prefixed with `${entryId}/`. Assert against `entryId: 'workflows'` and `entryId: 'wf-2'` to confirm multi-mount scoping produces `'workflows/task-edit'` and `'wf-2/task-edit'` respectively.
- Missing `entryId` on a built-in-kind call throws.

## Acceptance Criteria

- Helper and test file exist under `src/connections/shared/`.
- All test cases above pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.test.js` — create.

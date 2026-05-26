# Part 30 — Engine-managed action display

**Layer:** engine handlers + config resolver + display surfaces. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/`, `modules/workflows/`.

Action documents are supposed to carry the **display fields the UI reads — `message`, `link`, `status_title` per app slug** — so the UI is dumb and other services (notifications, audit, external syncs) read the same fields the user sees. The mechanic was lost in implementation: the engine writes nothing related to `status_map` onto action docs, and the display surfaces read fields that don't exist (the lookup falls through `&&` guards silently). This part wires up engine-managed display as a first-class concern, splitting it into two streams:

- **Author content (`message`, `status_title`).** Rendered from `status_map` cells via Nunjucks. Sticky across transitions — a cell only changes the fields it sets; everything else carries through.
- **Engine-managed navigation (`link`).** Computed per transition from `(kind, stage, access verbs)` for built-in kinds. Authors don't write `link:` in cells for built-in kinds. `kind: custom` (Part 28) is the exception — apps own their navigation entirely, so authors do write `link:` in cells.

## Proposed change

1. **Engine renders `status_map[newStage]` and writes the rendered cell onto the action doc on every stage write.** New shared helper `renderStatusMap.js` runs Nunjucks against `{ ...actionDoc, ...mergedMetadata }`, applies any caller-supplied per-app override, and returns the rendered cell. `createAction.js`, `updateAction.js`, and any caller that appends to `action.status[]` use the helper.
2. **Per-app cells land at the top level of the action doc, matching the events schema.** A status_map cell like `{ app-a: {...}, app-b: {...}, status_title: '...' }` is spread onto the action doc as `action['app-a']`, `action['app-b']`, `action.status_title`. App-name keys are discovered dynamically from the keys present in each cell.
3. **Display is sticky.** Each transition only writes the fields present in the new cell. Previous-stage values for slugs the new cell doesn't mention persist on the doc. Authors only write a cell where content actually changes. Explicit suppression is `field: null` in the cell.
4. **Engine computes `link` per (kind, stage, access verbs) for built-in kinds.** `kind: task | form | tracker` — engine writes `action[slug].link` on every transition from a `linkDefaults` table keyed on `(kind, stage)` and the slug's access verbs. Author cannot write `link:` in a cell for these kinds (validator rejects). For `kind: custom`, authors write `link:` in the cell; engine renders Nunjucks + substitutes the `{ action_id: true }` sentinel, no defaulting.
5. **`metadata` accumulates on the action across transitions.** Caller passes `metadata: {...}` in the submit/start payload. The engine merges `{ ...oldMetadata, ...newMetadata }`, writes the merged object to `action.metadata`, and uses it as part of the render context. Templates at later stages can reference data set by earlier stages.
6. **Render context is `{ ...actionDocBeforeWrite, ...mergedMetadata }`.** Templates can reference any field on the action (`key`, `assignees`, `due_date`, `description`, `form_data`, `entity_id`, etc.) plus anything in metadata. Action fields are read from the pre-write doc — or for the initial-insert path, the in-memory draft being built — so a stage's render reflects "the action that arrived at this stage."
7. **Shape validation only — no coverage requirement.** Build-time validation checks each authored cell's shape (per-slug values are `{ message?: string }` for built-in kinds; `{ message?: string, link?: object }` for custom). No requirement that every reachable stage has a cell — sticky display fills the gap when a cell is omitted. Engine never throws on missing cell; missing cell just means "no display change beyond the auto-computed link."
8. **Display surfaces stop reading `status_map` and read the rendered top-level fields.** `components/actions-on-entity.yaml`, `pages/workflow-overview.yaml`, `pages/group-overview.yaml` switch from `a.status_map[stage][appName].message` / `.link` to `a[appName].message` / `.link`. `appName` resolves from `_module.var: app_name`.

## Key decisions

### D1. Why render-on-write instead of render-on-read

The reference implementation in an existing app's `WorkflowAPI/UpdateWorkflowActions/` connection renders at transition time and writes the result. Three reasons we follow it:

- **Display is dumb.** The list page, the entity-overview component, the workflow-overview page, the group-overview page — none of them need to know about `status_map`. They read top-level fields off the action doc and render. That's also true for any other consumer: notifications can quote `action.demo.message` in an email, the audit log can capture what the user actually saw, an external sync can map fields directly.
- **Renders that depend on `metadata` produced at submit time can't be reproduced on read.** If the action transitioned to `error` with `metadata.error_reason` set, the rendered message at that moment is the truth; re-rendering against the current action doc would produce a stale or wrong value because metadata for past stages isn't kept per-stage.
- **One template engine in one place.** Nunjucks runs once on write. UI doesn't run templates; consumers don't run templates.

### D2. Top-level per-app keys

Per-app cells spread onto the action doc at top level (`action.demo`, `action['app-a']`), matching the events-collection schema and the reference codebase.

### D3. Sticky display, not snapshot-per-stage

Reference hardcodes its two app slugs and nulls them on every transition in a first `$set` stage. That works for reference because cells are written for every stage and the slug universe is statically known. Neither holds for us: modules-mongodb is multi-app with config-driven slugs, and we want cells to be optional for stages where display doesn't change.

We don't null. Each transition writes only the fields the new cell mentions; everything else on the doc persists. The update pipeline collapses to one `$set`:

```
[
  { $set: {
      updated: <stamp>,
      status: { $concatArrays: [[<new entry>], '$status'] },
      metadata: <merged>,
      ...renderedCell,                     // sticky: only keys present in cell
      ...engineDrivenLinkFields,           // built-in kinds: links computed per slug
  } },
]
```

Implications:

- **No resolver-emitted slug universe.** Drop `status_map_app_slugs` — engine doesn't need it.
- **Cells become deltas.** Author writes a cell only at stages where `message` or `status_title` changes for some slug. Subsequent stages without a cell inherit the previous render.
- **Author-side explicit suppression.** Stale `message` cleared by writing the next cell with `message: null` for the relevant slug.
- **`link` is engine-driven for built-in kinds — sticky-leak doesn't apply.** See D4. Links recompute every transition; never stale.
- **`link` is author-driven for `kind: custom`.** Stale-link concern applies there: author either re-authors the cell at every stage they care about, or accepts stickiness. Part 28 owns this trade-off.

### D4. Engine-driven links for built-in kinds

For `kind: task | form | tracker`, the engine writes `action[slug].link` on every transition. The link is a function of `(kind, stage, slug's access verbs)`. Authors cannot write `link:` in cells for these kinds — validator rejects.

`kind: task` (the table the engine ships):

| Stage              | Slug has `edit` verb                          | Slug has only `view` verb     | Slug has no relevant verb |
|--------------------|-----------------------------------------------|-------------------------------|---------------------------|
| `action-required`  | `task-edit`                                   | `task-view`                   | `null`                    |
| `in-progress`      | `task-edit`                                   | `task-view`                   | `null`                    |
| `changes-required` | `task-edit`                                   | `task-view`                   | `null`                    |
| `in-review`        | `task-review` if `review` verb, else `task-view` | `task-view`               | `null`                    |
| `done`             | `task-view`                                   | `task-view`                   | `null`                    |
| `error`            | `task-view`                                   | `task-view`                   | `null`                    |
| `blocked`          | `null`                                        | `null`                        | `null`                    |
| `not-required`     | `null`                                        | `null`                        | `null`                    |

`kind: form` uses the same shape against form-emitted page IDs from Part 13. `kind: tracker` links to the child workflow's `workflow-overview` (page ID resolved via the existing `child_workflow_id` field on tracker action docs).

Mechanic: engine produces `{ pageId, urlQuery: { action_id: <id> } }` (or `null`) per slug, every transition. Pages are resolved via `_module.pageId` — i.e. the engine writes `pageId: <module-scoped-id>` and Lowdefy's normal page-id resolution takes it from there.

`urlQuery` is always `{ action_id }`. Cases where an action's page needs additional data are served by the page calling `get_action` server-side and reading from the fetched doc (including `metadata`) — not via the URL. URLs only carry identity; everything else flows through the action doc.

Reference-implementation validation: the reference codebase encodes equivalent (kind, stage, verb) → page mapping by hand in each `status_map.{stage}.{slug}.link.pageId` cell across the workflow configs. The pattern is consistent — slugs with the `review` verb get the review page at `in-review`; slugs without get the view page. This part codifies that pattern in the engine.

### D5. Engine still substitutes the `action_id` sentinel for `kind: custom` links

For `kind: custom`, author-written `link:` in cells uses the `{ action_id: true }` sentinel convention so the cell config doesn't need to know the action's UUID at authoring time. Engine substitutes it post-render, before writing onto the action doc.

For built-in kinds, the engine builds the `urlQuery` directly with the UUID — no sentinel needed.

### D6. Reserved keys inside a status_map cell

Cells look like:

```yaml
# built-in kinds (task / form / tracker) — no link authoring
status_map:
  action-required:
    demo:    { message: 'Awaiting installation of {{ form_data.physical_id }}' }
    status_title: 'Awaiting installation details'

# kind: custom — link authoring allowed
status_map:
  action-required:
    'app-a':
      message: 'Review the document'
      link:
        pageId: 'app-side-review-page'
        urlQuery: { action_id: true }
    status_title: 'In review'
```

Top-level keys inside a cell that are **NOT** treated as app slugs:

- `status_title` — rendered as a top-level scalar/string. Goes onto the action doc as `action.status_title`. Goes through Nunjucks render same as everything else.

Anything else at cell top level is treated as an app slug. Per-slug value shape:

- **Built-in kinds:** `{ message?: string }` only. `link:` rejected by validator.
- **Custom kind:** `{ message?: string, link?: { pageId: string, urlQuery?: object, input?: object } }`.

### D7. How display surfaces know which `appName` to read

Display surfaces need to read `action[appName]` and `appName` varies per app. Going with `_module.var: app_name` — declared on the workflows manifest as `required: true`, so the build fails fast if a host app mounts workflows without setting it. No fallback to `_global` — explicit per-mount config beats two-places-to-set-the-same-value.

Multi-mounted setups (workflows mounted twice with different app slugs) each get their own `vars.app_name`, and each instance reads its own slug from action docs.

**Forward-looking:** Lowdefy is adding an `_app: slug` operator that will replace `_module.var: app_name` repo-wide. This part uses `_module.var: app_name` today; migration to `_app: slug` is tracked separately.

### D8. Caller-supplied per-app override (sticky-style)

Reference allows the caller to pass `display.{appName}` in the update payload, which replaces the cell's app subtree. We keep this with sticky semantics:

```js
submit({
  metadata: { physical_id: 'D123' },
  display: { demo: { message: 'Special handling for {{ physical_id }}' } }
})
```

Mechanics: if `payload.display?.[slug]` exists, it replaces `cell[slug]` after the deep-clone, before Nunjucks render. The override is still rendered (so it can reference metadata). It's still subject to the same per-kind shape rules (built-in kinds: only `message`; custom: `message` and `link`). Overrides work even when no cell exists for the stage — they're written under the slug's top-level key like any rendered field.

This is a deliberate small feature surface. The 80% case is config templates; the override is the escape hatch for one-off transitions that need bespoke copy.

### D9. Shape-only validation; no coverage requirement

The validator checks each authored cell's shape against the action's kind. Three rules:

1. **Cell-stage key** must be a valid `ACTION_STATUS` value (existing rule, unchanged).
2. **Per-slug value shape:**
   - `kind: task | form | tracker`: `{ message?: string }` only. `link:` rejected with `"link is engine-managed for kind: ${kind}; remove it from status_map.${stage}.${slug}. To restrict navigation per slug, edit access.{slug}.verbs instead."`.
   - `kind: custom`: `{ message?: string, link?: { pageId: string, urlQuery?: object, input?: object } }`.
3. **Reserved key**: `status_title` value must be string or null.

**No coverage requirement.** Cells are optional per stage; sticky display fills the gap. A workflow with no `status_map` at all is valid — every transition produces an engine-computed link (for built-in kinds) and an empty `message`, `status_title` stays null.

Tracker note: trackers cannot reach `error` in v1 — no engine path propagates child-workflow failure upward. With cells optional, this doesn't translate into a validator rule; an author who writes `status_map.error.{slug}.message` for a tracker gets dead config but no validation error. Acceptable cost of relaxing the validator — child-failure propagation is a separate design concern and any `error` work there will revisit this.

### D10. Render context = action-doc-before-write + merged metadata

Not the post-write doc — that would create a self-reference (the doc's render reflects its own rendered fields). Caller's mental model is "this transition is happening to *this* action that's in *this* state right now." The render reflects that snapshot, with the new metadata layered on top.

```js
const renderCtx = {
  ...actionDocBeforeWrite,                              // _id, type, key, assignees, due_date, etc.
  ...{ ...actionDocBeforeWrite.metadata, ...newMetadata }, // accumulated metadata wins over action-doc fields
};
```

Where `newMetadata` is from `payload.metadata` (start/submit), `null`-defaulted.

**Start (initial insert):** `actionDocBeforeWrite` is the **draft action doc being built** by `createAction` — not `null`. The draft already has `_id`, `type`, `kind`, `key`, `assignees`, `due_date`, `description`, `action_group`, `entity_id`, `entity_collection`, etc. populated from config and payload. `currentActionDoc = null` is a fetch optimisation (no Mongo round-trip needed because the doc doesn't exist yet), not a render-context decision. Templates at the initial stage can reference any of those draft fields.

**Update (Submit / Cancel / Close / reevaluate / fireTrackerSubscription):** `actionDocBeforeWrite` is the freshly-fetched doc from the engine's pre-write read.

Workflow-level fields (`workflow_type`, `entity_id`, `entity_collection`) are already on the action doc — accessible. We don't surface a `workflow:` sub-object in render context to keep the surface flat.

### D11. One pipeline builder, three call sites

Cancel and Close currently push `{ stage: 'not-required' }` onto every non-terminal action in one `MongoDBUpdateMany`. Render-on-write means each action's update payload is different (different render context per action), so a single `MongoDBUpdateMany` no longer fits.

**Wire shape:** Cancel/Close cascade switches to `bulkWrite` (one round trip carrying N per-action `updateOne` ops). Per-action `updateOne` calls in a loop would be N sequential round trips — real regression on sweeps hitting 20-100+ actions per workflow.

**Pipeline construction:** factored into a single helper `buildActionStageUpdate({ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp })` → returns a single-stage aggregation pipeline:

```js
[
  { $set: {
      updated: changeStamp,
      status: { $concatArrays: [[{ stage: newStage, event_id: eventId, created: changeStamp }], '$status'] },
      metadata: mergedMetadata,
      ...renderedCell,           // sticky author content (message, status_title)
      ...engineLinks,            // built-in kinds: { [slug]: { ...existingSlug, link: <computed> } } per slug present in access; custom: {} (links are inside renderedCell)
  } },
]
```

For built-in kinds, `engineLinks` is computed per slug declared in the action's `access` block (slugs are the keys of `access` excluding the reserved `roles` and `notification_roles`). For each slug, the helper emits a `$set` for `{slug}.link` using a Mongo `$mergeObjects` of the existing slug value plus the new `link`:

```js
// inside the $set above, for each access-slug:
[slug]: { $mergeObjects: [`$${slug}`, { link: <engine-computed-link-or-null> }] }
```

This preserves `message` stickiness on the slug subtree while overwriting `link` every transition. (For slugs that haven't been written yet, `$mergeObjects` against `null` returns just the new `link` subtree.)

For `kind: custom`, `engineLinks = {}` — the author's `link` flows through `renderedCell`.

Three call sites, one builder:

- `updateAction` calls `renderStatusMap` + `buildActionStageUpdate`, wraps the pipeline in `MongoDBUpdateOne`. Replaces today's `$set` + `$push` shape; the `$concatArrays` form handles the prepend.
- `createAction` calls `renderStatusMap` and link-computation directly against the in-memory draft, embeds the rendered cell + computed links + `metadata` in the `InsertOne` payload. No pipeline (it's an insert).
- Cancel/Close cascade fetches the non-terminal actions, then per action: calls `renderStatusMap` + `buildActionStageUpdate`, pushes `{ updateOne: { filter: { _id }, update: <pipeline> } }` onto a `bulkWrite` op array, sends one `bulkWrite`.

`fireTrackerSubscription` (Part 10) and `reevaluateBlockedActions` (Part 11) call `updateAction` and inherit render + link computation automatically.

### D12. No backfill for in-flight action docs

The new top-level `<app-slug>` / `status_title` fields are written only on stage transitions going forward. There are no current consumers of this module — it's wip and currently non-functional — so the question of stranded in-flight docs doesn't arise. The demo app's actions will get fresh rendered cells on the next transition triggered by exercising the demo flows; no backfill migration, no UI fallback, no quiescence procedure.

If a real consumer adopts this module before transitioning all its in-flight workflows, the rollout will need one of: a one-shot backfill that walks live action docs and writes the cell, a runtime read-fallback through `status_map[stage]` in the UI for one release, or quiescence. That's a future concern; not in scope here.

### D13. Render walks the cell tree; doesn't JSON-stringify-roundtrip

Reference uses `JSON.stringify` → Nunjucks → `JSON.parse`. Works but type-lossy for edge cases (`undefined`, `Date`, dot-notation keys with reserved chars). We do a recursive walk:

```js
function renderTree(node, ctx) {
  if (typeof node === 'string') return parseNunjucks(node, ctx);
  if (Array.isArray(node)) return node.map((n) => renderTree(n, ctx));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = renderTree(v, ctx);
    return out;
  }
  return node;
}
```

For `kind: custom`, after render run `substituteActionIdSentinel` on the rendered tree to swap `{ action_id: true }` → UUID. For built-in kinds, no sentinel pass — the engine builds `urlQuery` directly with the UUID when computing the link.

## Current state

### Engine — `status_map` is never written

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`:

- [`shared/createAction.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/shared/createAction.js) builds the action doc from config but copies only `type, kind, key, action_group, status, tracker, entity_*, assignees, due_date, description, child_*`. **No `status_map` lookup, no render.**
- [`shared/updateAction.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/shared/updateAction.js) — same gap.
- [`StartWorkflow/StartWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) — calls `createAction`; inherits the gap.
- [`SubmitWorkflowAction/handleSubmit.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — reads `actionConfig.access` but never `actionConfig.status_map`.
- [`CancelWorkflow/CancelWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js):84-96 — `MongoDBUpdateMany` pushes `{ stage: 'not-required' }` onto each affected action's status. No render.
- [`CloseWorkflow/CloseWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js):84-130 — same shape, sweeps blocked/non-terminal to `not-required`.

### Resolver — passes `status_map` through but doesn't validate cell shape

`modules/workflows/resolvers/`:

- [`makeWorkflowsConfig.js`](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js):15 — `status_map` is in `ACTION_FIELDS`, gets `pick()`ed into runtime config.
- [`makeWorkflowsConfig.js`](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js):154-163 — validates `status_map` keys against `ACTION_STATUSES` (good).
- **No per-cell shape validation.** Built-in-kind cells can illegally declare `link:` today; nothing rejects it.

### Display layer — reads fields that don't exist

- [`components/actions-on-entity.yaml`](../../../../modules/workflows/components/actions-on-entity.yaml):92-99 — reads `a.status_map[stage][appName]`. `a.status_map` is `undefined`. The `&&` chain falls through.
- [`pages/workflow-overview.yaml`](../../../../modules/workflows/pages/workflow-overview.yaml):158, 177, 196 — `_state: actions_list.$.status_map` → `undefined`. Subsequent `_get` for `[stage][appName].message` / `.link` resolves to nothing.
- [`pages/group-overview.yaml`](../../../../modules/workflows/pages/group-overview.yaml):274, 293, 312 — same.

## Proposed data flow

### Write path (Start / Submit / Cancel / Close / auto-unblock)

```
caller payload ──┬──→ engine handler
                 │       │
                 │       ├── fetch actionDocBeforeWrite (skipped on Start — draft doc is used instead)
                 │       ├── lookup actionConfig.status_map[newStage]
                 │       │       (may be undefined — sticky display means that's fine)
                 │       │
                 │       ├── deep-clone the cell (if present), or start from {}
                 │       ├── apply payload.display[slug] override(s)
                 │       │
                 │       ├── mergedMetadata = { ...actionDocBeforeWrite.metadata, ...payload.metadata }
                 │       ├── renderCtx     = { ...actionDocBeforeWrite, ...mergedMetadata }
                 │       │
                 │       ├── renderTree(cell, renderCtx)              ── Nunjucks on every string
                 │       ├── for kind: custom — substituteActionIdSentinel(cell, _id)
                 │       │
                 │       ├── for built-in kinds — compute engineLinks per access-slug × (kind, stage, verbs)
                 │       │
                 │       └── Mongo update (single $set pipeline):
                 │             [{ $set: {
                 │                updated,
                 │                status: { $concatArrays: [[new entry], '$status'] },
                 │                metadata: merged,
                 │                ...renderedCell,
                 │                ...engineLinks,
                 │             } }]
                 │
                 └──→ (caller never touches status_map)
```

Initial-stage insert (`StartWorkflow` → `createAction`):

```
caller payload ──→ createAction(currentActionDoc = null)
                     ├── build draft action doc (assignees, due_date, key, type, entity_*, …)
                     ├── (no fetch — initial insert; render against the in-memory draft per D10)
                     ├── lookup cell, render against draft + mergedMetadata, sentinel swap
                     └── single InsertOne with full doc shape including rendered cell
```

### Read path (display surfaces)

```
get-entity-workflows / get-workflow-overview / get-action-group-overview
       │
       └── $lookup actions → returns docs with top-level
                            { demo: { message, link }, 'app-a': {...}, status_title, ... }

UI page:
  message: { _state: actions_list.$[_module.var: app_name].message }
  link:    { _state: actions_list.$[_module.var: app_name].link }
```

No template engine in the UI. No nested traversal. The action doc carries everything for the current stage.

## Schema additions

### Action doc (Mongo)

New top-level fields written by the engine:

| Field                       | Type              | Source                                              | Lifecycle |
| --------------------------- | ----------------- | --------------------------------------------------- | --------- |
| `<access-slug>.message`     | string \| null    | Rendered cell `message` for the slug, or unchanged from previous stage if cell omits the slug | Sticky. Written when an authored cell sets it; persists across transitions until the next cell mentions it or an explicit `null` clears it. |
| `<access-slug>.link`        | object \| null    | **Built-in kinds:** engine-computed from `(kind, stage, slug's access verbs)`. **Custom kind:** rendered from authored cell's `link:` field. | Recomputed every transition for built-in kinds — never stale. For custom kind, sticky like `message` — author re-authors per stage that changes it. |
| `status_title`              | string \| null    | Rendered cell `status_title`, or unchanged from previous stage if cell omits it | Sticky. |
| `metadata`                  | object \| null    | Caller-supplied; accumulated `{ ...old, ...new }`   | Set on every write that includes `metadata` in payload. |

Existing fields untouched (`_id`, `type`, `kind`, `key`, `status[]`, `action_group`, `entity_*`, `assignees`, `due_date`, `description`, etc.).

### Workflow config (resolver output)

No new fields. Engine doesn't need a slug universe (no nulling). The existing `access` block per action carries the slug set used for link computation.

### Module manifest

`modules/workflows/module.lowdefy.yaml` already declares `app_name` as `required: true` (used for access filtering and event display keying). This part **extends** the var's role: the same slug also picks the per-app cell read from the action doc.

Update the description to reflect the unified role:

```yaml
vars:
  app_name:
    type: string
    required: true
    description: >
      The host app's deployment slug. Three roles, all keyed by the same value:
      (1) access filtering — `access.{app_name}` per action;
      (2) event display — keys the default log-event display block (events module's display_key projection);
      (3) action display — picks `action[app_name].message` / `.link` on display surfaces.
```

A single `app_name` per mount drives all three. Multi-mount setups (workflows mounted twice with different `app_name` vars) get fully separate access gates, event keys, and status-map reads per instance — confirmed as the intended unification.

## Worked example

**Config** (`apps/demo/modules/workflows/workflow_config/installation/install-step.yaml`):

```yaml
type: install-step
kind: task
action_group: g1
access:
  demo: [view, edit]               # demo gets edit links at edit-allowed stages
  customer: [view]                 # customer always gets view links
status_map:
  action-required:
    demo: { message: Install {{ metadata.physical_id }}. }
    customer: { message: Installation pending. }
    status_title: Installation pending
  in-progress:
    demo: { message: 'Installing — {{ assignees[0].name }} on site.' }
    status_title: In progress
  done:
    demo: { message: Installation complete. }
    customer: { message: Installation complete. }
    status_title: Complete
```

Notes on the config:
- No `blocked` cell, no `not-required` cell. Sticky display: when the action transitions to `blocked`, last-written `message` persists; when it transitions to `not-required` (via close-sweep), same.
- No `link:` anywhere. Engine computes link per slug from `(kind, stage, access verbs)` — see D4.
- `customer` cell omitted at `in-progress` — `customer.message` from `action-required` ("Installation pending.") persists through `in-progress` until `done` overrides it.

**StartWorkflow payload:**

```js
{ workflow_type: 'installation', entity_id: 'lead-1', entity_collection: 'leads',
  metadata: { physical_id: 'D-42' } }
```

**Action doc after Start (stage = `action-required`):**

```js
{
  _id: 'a3f2-uuid',
  type: 'install-step',
  kind: 'task',
  status: [{ stage: 'action-required', created: stamp, event_id: null }],
  metadata: { physical_id: 'D-42' },
  // authored cell:
  demo: {
    message: 'Install D-42.',
    link: { pageId: 'task-edit', urlQuery: { action_id: 'a3f2-uuid' } },        // engine — demo has edit verb
  },
  customer: {
    message: 'Installation pending.',
    link: { pageId: 'task-view', urlQuery: { action_id: 'a3f2-uuid' } },        // engine — customer has view only
  },
  status_title: 'Installation pending',
}
```

**Submit to `in-progress` with new metadata:**

```js
submit({
  currentActionId: 'a3f2-uuid',
  actions: [{ type: 'install-step', status: 'in-progress' }],
  metadata: { assignees: [{ name: 'Alice' }] },
})
```

**Action doc after submit:**

```js
{
  _id: 'a3f2-uuid',
  status: [
    { stage: 'in-progress', created: stamp, event_id: e1 },
    { stage: 'action-required', created: oldstamp, event_id: null },
  ],
  metadata: { physical_id: 'D-42', assignees: [{ name: 'Alice' }] },   // accumulated
  demo: {
    message: 'Installing — Alice on site.',                            // overwritten by in-progress cell
    link: { pageId: 'task-edit', urlQuery: { action_id: 'a3f2-uuid' } }, // engine recomputes for new stage; same target here
  },
  customer: {
    message: 'Installation pending.',                                  // STICKY — in-progress has no customer entry
    link: { pageId: 'task-view', urlQuery: { action_id: 'a3f2-uuid' } }, // engine recomputes for in-progress
  },
  status_title: 'Installation pending',                                // STICKY — in-progress cell omitted status_title
}
```

**Transition to `blocked` (via close-sweep or upstream block):**

```js
{
  status: [{ stage: 'blocked', ... }, ...prior],
  demo: {
    message: 'Installing — Alice on site.',                            // STICKY from in-progress
    link: null,                                                         // engine — blocked has no link for either slug
  },
  customer: {
    message: 'Installation pending.',                                   // STICKY
    link: null,
  },
  status_title: 'Installation pending',                                 // STICKY
}
```

Note no cell exists for `blocked`. The transition still produces a clean doc: every slug's `link` recomputed to `null` (engine, per D4), `message` and `status_title` carry through.

## Files changed

### New files

- `plugins/modules-mongodb-plugins/src/utils/parseNunjucks.js` — moved from `src/blocks/ContactSelector/parseNunjucks.js` (single source of truth; `ContactSelector` import updated to point here). `utils/` is a new top-level dir under `src/` — matches the reference codebase's layout for cross-cutting helpers and avoids the name clash with `connections/shared/`.
- `plugins/modules-mongodb-plugins/src/connections/shared/substituteActionIdSentinel.js` — sentinel-swap helper for `kind: custom` cell links. Named to avoid collision with the existing `shared/populateIds.js` (UUID assigner for new action drafts).
- `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.js` — render orchestrator. Inputs: `{ actionConfig, stage, actionDocBeforeWrite, payloadDisplay, mergedMetadata, actionId }`. Outputs: `{ renderedCell }` — the rendered cell ready to spread (Nunjucks applied; sentinel substituted for custom kind). Returns `{}` for absent cells (sticky display).
- `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.js` — `(actionConfig, stage, actionId) → { [slug]: { $mergeObjects: [...] } }` for built-in kinds; `{}` for `kind: custom`. Encapsulates the (kind, stage, access verbs) link defaults table from D4.
- `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.js` — builds the single-stage `$set` aggregation pipeline from `{ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp }`. Per D11.
- `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.test.js` — unit tests: render with action+metadata context, absent cell returns `{}`, sentinel swap for custom kind only, override merge, accumulated metadata.
- `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.test.js` — unit tests: task kind link table (edit slug, view slug, review slug, no-verb slug per stage), form kind table, tracker kind, custom kind returns `{}`.
- `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.test.js` — unit tests: pipeline shape; `$concatArrays` prepend; sticky `message` via `$mergeObjects`; engine links replace `link` field on each access slug.

### Modified

- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.jsx` — update the `parseNunjucks` import from `./parseNunjucks.js` to `../../utils/parseNunjucks.js`. Delete the old local file as part of the move.
- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` — call `renderStatusMap` + `computeEngineLinks` against the in-memory draft doc; embed the merged result + `metadata` in the returned draft.
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — call `renderStatusMap` + `computeEngineLinks` + `buildActionStageUpdate`; replace today's `$set` + `$push` update doc with the resulting aggregation pipeline.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — replace inline `MongoDBUpdateMany` (lines 84-96) with: fetch non-terminal actions, loop, call the three helpers per action, push `updateOne` ops onto an array, send one `bulkWrite`. Per D11. Per-action `status[]` entry stays `{ stage: 'not-required', created, event_id }` — workflow-level `cancelled` carries `reason`, per-action sweep does not (preserve today's behaviour).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — same shape for the sweep at lines 84-130. Same no-`reason`-on-action-entries rule applies.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — already routes through `updateAction`. No structural change; verify metadata flows through.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — pass `payload.metadata` through to `createAction` for each starting action.

`SubmitWorkflowAction/fireTrackerSubscription.js` and `SubmitWorkflowAction/reevaluateBlockedActions.js` both write stages via `updateAction` already. They inherit render + link computation automatically — no edits needed.

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — add `validateStatusMapCells(workflow, action)`: validate per-cell shape only (per D9). Built-in kinds reject `link:` in cells; custom accepts `{ message?, link? }`. No coverage validation. No `status_map_app_slugs` emission (engine doesn't need it).
- `modules/workflows/module.lowdefy.yaml` — update `app_name` var description to reflect its third role (action display); no schema change.
- `modules/workflows/components/actions-on-entity.yaml` — switch reads from `a.status_map[stage][appName]` to `a[appName]` (and `a.status_title`).
- `modules/workflows/pages/workflow-overview.yaml` — same switch at lines 158, 177, 196.
- `modules/workflows/pages/group-overview.yaml` — same at lines 274, 293, 312.
- `modules/workflows/api/start-workflow.yaml` — add `metadata: { _payload: metadata }` and `display: { _payload: display }` to the `StartWorkflow` action's `properties`, documenting the two new caller-facing payload fields (per D8 + Proposed-change item 5).
- `modules/workflows/resolvers/makeWorkflowApis.js` — extend the emitted-api payload mapping at lines 71-80 to pass `metadata: { _payload: metadata }` and `display: { _payload: display }` through every `update-action-{action_type}` Api. Both fields then flow into the `SubmitWorkflowAction` plugin handler via `request.metadata` / `request.display`.
- `modules/workflows/README.md` — add `metadata` and `display` to the Start / Submit payload documentation. `display` should be documented as the per-call override path, scoped to one transition (not persisted to the action config); shape is `{ [slug]: cellShapeForKind }` matching the cell shape rules from D6.

### Demo + tests

- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — strip authored `link:` from existing cells (engine now drives links). Optionally trim cells to demonstrate sticky display (drop `not-required` cell, etc.). Add a templated message referencing `{{ metadata.* }}` to match the worked example.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-*.yaml` — strip authored `link:` from cells. Otherwise no changes — sticky display means missing stages (e.g., no `action-required` cell) are fine.
- `apps/demo/lowdefy.yaml` (or wherever the workflows module is mounted) — `vars.app_name: demo` already set (no change).
- New tests in `StartWorkflow.test.js`, `updateAction.test.js`, `CancelWorkflow.test.js`, `CloseWorkflow.test.js`:
  - On Start, action doc has rendered `message` for slugs in the cell, plus engine-computed `link` per slug × stage.
  - On Submit to a stage with a cell, `message` overwrites; engine recomputes link.
  - On Submit to a stage with NO cell, `message` persists (sticky); engine still recomputes link.
  - On Submit to `blocked`, links are null for all slugs; messages persist from previous stage.
  - `metadata` accumulates across transitions.
  - Override path: `payload.display.demo = { message: 'custom {{ x }}' }` with `metadata: { x: 1 }` renders `'custom 1'`.
  - Cancel/Close sweep: each affected action gets `status` prepend + sticky message + recomputed link.
- New tests in `makeWorkflowsConfig.test.js`:
  - Cell shape validation: built-in kind cell with `link:` in a slug throws.
  - Cell shape validation: custom kind cell with valid `{ message, link }` passes.
  - No coverage requirement: workflow with no `status_map` at all passes.

## Non-goals

- **A general-purpose template engine in the UI.** Display surfaces stay dumb. Anything that needs runtime templating reads metadata fields directly or calls a server API.
- **Per-status custom render functions.** Authors can't supply JS render functions — Nunjucks templates only.
- **Render history.** The action carries the current stage's render. Past stages' rendered text is gone; the `status[]` array carries only `{ stage, created, event_id }`. If audit needs past-render history, log it to `events` at transition time (separate concern).
- **Validating Nunjucks templates against the render context at build time.** A template that references `{{ nonexistent_field }}` renders to empty string; the build doesn't catch it. Out of scope.
- **Replacing the existing `actions-on-entity` rendering library.** The component still uses ActionSteps — only the per-card message/link source changes.

## Related

- [Part 04 — workflows-config resolver](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) — the resolver this part extends.
- [Part 12 — resolver pages](../12-resolver-pages/design.md) — emits `action_config.status_map` onto page templates. Templates don't read it (engine-side concern), so no change there — the resolver-emitted field is now redundant for display but kept as authoring metadata.
- [Part 18 — actions-on-entity](../_completed/18-entity-components/design.md) — the component this part rewires.
- [Part 28 — custom action kind](../28-custom-action-kind/design.md) — `kind: custom` owns its `link:` authoring per cell; engine renders Nunjucks + substitutes the `{ action_id: true }` sentinel but doesn't compute defaults. Built-in kinds in this part do not author `link:`. Part 28 absorbs this contract when it lands.
- Reference: an existing app's `WorkflowAPI/` connection — `getStatusConfig.js`, `parseStatusConfig.js`, its sentinel-swap helper, `createAction.js`, `updateAction.js`. Relevant snippets quoted inline in this design where needed.

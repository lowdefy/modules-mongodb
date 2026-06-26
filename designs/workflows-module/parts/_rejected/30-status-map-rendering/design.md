# Part 30 — Engine-managed display

**Layer:** engine handlers + config resolver + display surfaces. **Size:** M. **Repo:** `plugins/modules-mongodb-plugins/src/connections/`, `modules/workflows/`.

The workflows engine writes documents that downstream surfaces render dumb-ly — action docs read by display pages, event docs read by the events timeline. Both surfaces are supposed to receive **pre-rendered strings** so the UI never runs a template engine; both currently get something else. This part wires both up under one principle: render-on-write, downstream surfaces stay dumb.

**Action display.** Action docs are supposed to carry the **display fields the UI reads — `message`, `link`, `status_title` per app slug** — so the UI is dumb and other services (notifications, audit, external syncs) read the same fields the user sees. The mechanic was lost in implementation: the engine writes nothing related to `status_map` onto action docs, and the display surfaces read fields that don't exist (the lookup falls through `&&` guards silently). Two streams:

- **Author content (`message`, `status_title`).** Rendered from `status_map` cells via Nunjucks. Sticky across transitions — a cell only changes the fields it sets; everything else carries through.
- **Engine-managed navigation (`link`).** Computed per transition from `(kind, stage, access verbs)` for built-in kinds. Authors don't write `link:` in cells for built-in kinds. `kind: custom` (Part 28) is the exception — apps own their navigation entirely, so authors do write `link:` in cells.

**Event display.** Engine-written events flow through `context.callApi('new-event', module: 'events')` from connection-plugin JS code. That boundary bypasses Lowdefy's payload-evaluation pass — operator-shaped values in the payload reach `new-event`'s `_payload: display` unevaluated and land in Mongo as literal objects. The timeline block (`EventsTimeline.js:225`) has no operator evaluator. The cross-repo [`event_display` idiom](../../../../../docs/idioms.md#event-display) (plain Nunjucks template strings, rendered by the writing layer) only holds when the writing layer is a Lowdefy YAML CallApi — engine-written events break it. This part renders event display in the engine before `context.callApi`, against a fixed render context, so the timeline block reads the same plain-string shape every other module's events already produce.

## Proposed change

1. **Engine renders `status_map[newStage]` and writes the rendered cell onto the action doc on every stage write.** New shared helper `renderStatusMap.js` runs Nunjucks against `{ ...actionDoc, ...mergedMetadata }`, applies any caller-supplied per-app override, and returns the rendered cell. `createAction.js`, `updateAction.js`, and any caller that appends to `action.status[]` use the helper.
2. **Per-app cells land at the top level of the action doc, matching the events schema.** A status_map cell like `{ app-a: {...}, app-b: {...}, status_title: '...' }` is spread onto the action doc as `action['app-a']`, `action['app-b']`, `action.status_title`. App-name keys are discovered dynamically from the keys present in each cell.
3. **Display is sticky.** Each transition only writes the fields present in the new cell. Previous-stage values for slugs the new cell doesn't mention persist on the doc. Authors only write a cell where content actually changes. Explicit suppression is `field: null` in the cell.
4. **Engine computes `link` per (kind, stage, access verbs) for built-in kinds.** `kind: task | form | tracker` — engine writes `action[slug].link` on every transition from a `linkDefaults` table keyed on `(kind, stage)` and the slug's access verbs. Author cannot write `link:` in a cell for these kinds (validator rejects). For `kind: custom`, authors write `link:` in the cell; engine renders Nunjucks + substitutes the `{ action_id: true }` sentinel, no defaulting.
5. **`metadata` accumulates on the action across transitions.** Caller passes `metadata: {...}` in the submit/start payload. The engine merges `{ ...oldMetadata, ...newMetadata }`, writes the merged object to `action.metadata`, and uses it as part of the render context. Templates at later stages can reference data set by earlier stages.
6. **Render context is `{ ...actionDocBeforeWrite, ...mergedMetadata }`.** Templates can reference any field on the action (`key`, `assignees`, `due_date`, `description`, `form_data`, `entity_id`, etc.) plus anything in metadata. Action fields are read from the pre-write doc — or for the initial-insert path, the in-memory draft being built — so a stage's render reflects "the action that arrived at this stage."
7. **Shape validation only — no coverage requirement.** Build-time validation checks each authored cell's shape (per-slug values are `{ message?: string }` for built-in kinds; `{ message?: string, link?: object }` for custom). No requirement that every reachable stage has a cell — sticky display fills the gap when a cell is omitted. Engine never throws on missing cell; missing cell just means "no display change beyond the auto-computed link."
8. **Display surfaces read the rendered top-level fields.** The three read aggregations (`api/get-entity-workflows.yaml`, `api/get-workflow-overview.yaml`, `api/get-action-group-overview.yaml`) already project `message` / `link` from `$<app_name>.message` / `$<app_name>.link` on each action doc — they resolve `undefined` today because the engine never writes those top-level keys. Once the engine writes `action[appName].message` / `.link`, the projections start resolving and the display surfaces fed by them (`actions-on-entity.yaml`, `workflow-overview.yaml`) light up without code changes. `pages/group-overview.yaml` is the only display surface that additionally reads `a.status_map[stage][appName].message` / `.link` directly off the action doc — it switches to `actions_list.$.message` / `.link` (matching `workflow-overview`). `appName` already resolves from `_module.var: app_name` inside the aggregations.
9. **Engine renders event-display templates before `context.callApi('new-event')`.** All engine event writes flow through `dispatchLogEvent.js`. New helper `renderEventDisplay.js` runs `renderTree` on the event payload's `display` field against a fixed render context `{ user, action, workflow, interaction, status_before, status_after }`. The three event-display source layers — engine-default templates, YAML-authored `params.event_overrides[interaction].display.{app}.{field}` (baked into the API endpoint's `properties` by Part 13's resolver), and pre-hook `event_overrides.display.{app}.{field}` — are all **plain Nunjucks template strings** — matching the shape of the [`event_display` idiom](../../../../../docs/idioms.md#event-display) (the workflow path replaces the idiom's generic `target` binding with the domain-specific `action` — see D14). No `_nunjucks: { template, on }` wrapping anywhere on the engine path. The events module (`new-event.yaml`, `EventsTimeline.js`) is unchanged.

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

`kind: form` uses the same stage × verbs shape against the page IDs emitted by [`makeActionPages`](../../_completed/12-resolver-pages/design.md) — `{workflow_type}-{action_type}-{verb}` for `verb ∈ [edit, view, review, error]` (Part 12 design.md:25-26), then build-scoped to `${entryId}/{workflow_type}-{action_type}-{verb}` at runtime. Verb-gating is per-app (only verbs in `access.{vars.app_name}` emit), so an engine-computed `link.pageId` for a verb the host app didn't emit will point at a non-existent page — caller responsibility, not engine responsibility (matches today's per-app page-set rule, Part 12 design.md:32). `kind: tracker` links to the child workflow's `workflow-overview`.

Per-kind rule (each cell is the `link` value engine writes per access-slug × stage; `{entry_id}` is the workflows module entry id, threaded into the engine — see mechanic below):

| Kind      | `pageId`                                                         | `urlQuery`                                      |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `task`    | `{entry_id}/task-{verb}` (per the stage × verb table above)      | `{ action_id: action_doc._id }`                 |
| `form`    | `{entry_id}/{action_doc.workflow_type}-{action_doc.type}-{verb}` | `{ action_id: action_doc._id }`                 |
| `tracker` | `{entry_id}/workflow-overview`                                   | `{ workflow_id: action_doc.child_workflow_id }` |

**Mechanic.** `_module.pageId` is a **build-time** operator — by the time the engine runs, all `_module.pageId: <name>` references in YAML have already been resolved to concrete strings of shape `${entryId}/${name}` (build/walker.js:387). The runtime engine has no `_module.pageId` to call, so it must compose the scoped id by hand. To do that the engine needs the module entry id at runtime:

1. New `entry_id` field on the WorkflowAPI connection schema (string, required).
2. The workflows module wires it at build time via `entry_id: { _module.id: true }` in `connections/workflow-api.yaml` — `_module.id: true` resolves to the entry id under which the workflows module is mounted (walker.js:479).
3. `computeEngineLinks` reads `context.entry_id` and composes `${entry_id}/task-${verb}`, `${entry_id}/${workflow_type}-${type}-${verb}`, `${entry_id}/workflow-overview` to match Lowdefy's scoping rule exactly.

This supports D7's multi-mount case: each mount has its own entry id, each mount's engine writes links scoped to its own page set.

Tracker subcase: the link is `null` when `action_doc.child_workflow_id` is null (tracker not yet started). The parent-tracker `updateAction` in `StartWorkflow.js:117-128` sets `child_workflow_id` in the same call that pushes `in-progress` — so link computation must run against `{ ...actionDocBeforeWrite, ...fields }` (the merged doc), not the pre-write doc, or the `in-progress` cell gets a link with `workflow_id: null`. See D11 for the merge-doc rule that applies to all three call sites.

`urlQuery` is **not** always `{ action_id }` — trackers use `workflow_id`, as above. The general rule is: URL carries identity, page fetches the rest server-side. For `task` / `form`, identity is `action_id` (page calls `get_action`); for `tracker`, identity is `workflow_id` (page calls `get_workflow_overview`).

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
  metadata: { physical_id: "D123" },
  action_display: {
    demo: { message: "Special handling for {{ physical_id }}" },
  },
});
```

The field is `action_display` (not `display`) to avoid the name collision with the existing `params.event_overrides.{interaction}.display.{app}` channel that targets the **event** doc's display block (`{ title, detail?, icon? }` per app — see `dispatchLogEvent.js` and `mergeEventOverrides.js`). `action_display` overrides the **action**'s per-app cell (`{ message?, link? }` per app), pairs naturally with `action.metadata`, and keeps the two channels unambiguous in payloads, tests, and docs.

Mechanics: if `payload.action_display?.[slug]` exists, it replaces `cell[slug]` after the deep-clone, before Nunjucks render. The override is still rendered (so it can reference metadata). It's still subject to the same per-kind shape rules (built-in kinds: only `message`; custom: `message` and `link`). Overrides work even when no cell exists for the stage — they're written under the slug's top-level key like any rendered field.

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

Not the post-write doc — that would create a self-reference (the doc's render reflects its own rendered fields). Caller's mental model is "this transition is happening to _this_ action that's in _this_ state right now." The render reflects that snapshot, with the new metadata layered on top.

```js
const renderCtx = {
  ...actionDocBeforeWrite, // _id, type, key, assignees, due_date, etc.
  ...{ ...actionDocBeforeWrite.metadata, ...newMetadata }, // accumulated metadata wins over action-doc fields
};
```

Where `newMetadata` is from `payload.metadata` (start/submit), `null`-defaulted.

**Start (initial insert):** `actionDocBeforeWrite` is the **draft action doc being built** by `createAction` — not `null`. The draft already has `_id`, `type`, `kind`, `key`, `assignees`, `due_date`, `description`, `action_group`, `entity_id`, `entity_collection`, etc. populated from config and payload. `currentActionDoc = null` is a fetch optimisation (no Mongo round-trip needed because the doc doesn't exist yet), not a render-context decision. Templates at the initial stage can reference any of those draft fields.

**Update (Submit / Cancel / Close / reevaluate / fireTrackerSubscription):** `actionDocBeforeWrite` is the freshly-fetched doc from the engine's pre-write read.

Workflow-level fields (`workflow_type`, `entity_id`, `entity_collection`) are already on the action doc — accessible. We don't surface a `workflow:` sub-object in render context to keep the surface flat.

### D11. One pipeline builder, three call sites

Cancel and Close currently push `{ stage: 'not-required' }` onto every non-terminal action in one `MongoDBUpdateMany`. Render-on-write means each action's update payload is different (different render context per action), so a single `MongoDBUpdateMany` no longer fits.

**Wire shape:** Cancel/Close cascade loops `MongoDBUpdateOne` per affected action — one community-plugin call per action. The community plugin (`@lowdefy/community-plugin-mongodb`) deliberately omits `MongoDBBulkWrite` because its change-log feature relies on per-op before/after reads that don't compose with a single bulk round-trip; every other engine write already goes through change-logged single-doc paths, and the cascade staying on that pattern keeps the engine's write surface uniform. Cancel/Close are infrequent user-triggered operations — sweep latency for typical 20-100 affected actions is sub-second on `_id`-indexed writes, and per-action change-log entries actually improve audit granularity vs today's single `MongoDBUpdateMany` log entry. If a real-world deployment hits sweep-latency problems later, adding `MongoDBBulkWrite` to the community plugin (with a change-log compatibility story) becomes a separate, scoped piece of work — out of scope here.

**Pipeline construction:** factored into a single helper `buildActionStageUpdate({ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp })` → returns a single-stage aggregation pipeline:

```js
[
  {
    $set: {
      updated: changeStamp,
      status: {
        $concatArrays: [
          [{ stage: newStage, event_id: eventId, created: changeStamp }],
          "$status",
        ],
      },
      metadata: mergedMetadata,
      ...renderedCell, // sticky author content (message, status_title)
      ...engineLinks, // built-in kinds: { [slug]: { ...existingSlug, link: <computed> } } per slug present in access; custom: {} (links are inside renderedCell)
    },
  },
];
```

For built-in kinds, `engineLinks` is computed per slug declared in the action's `access` block (slugs are the keys of `access` excluding the reserved `roles` and `notification_roles`). For each slug, the helper emits a `$set` for `{slug}.link` using a Mongo `$mergeObjects` of the existing slug value plus the new `link`:

```js
// inside the $set above, for each access-slug:
[slug]: { $mergeObjects: [`$${slug}`, { link: <engine-computed-link-or-null> }] }
```

This preserves `message` stickiness on the slug subtree while overwriting `link` every transition. (For slugs that haven't been written yet, `$mergeObjects` against `null` returns just the new `link` subtree.)

For `kind: custom`, `engineLinks = {}` — the author's `link` flows through `renderedCell`.

Three call sites, one builder. **Engine-link merge rule:** all three sites compute `mergedActionDoc = { ...actionDocBeforeWrite, ...callerFields }` and pass that into both `renderStatusMap` (so templates see caller-supplied fields) and `computeEngineLinks` (so per-kind link inputs — most notably tracker `child_workflow_id` — reflect what this transition is writing). Render context for templates extends `mergedActionDoc` further with merged metadata (per D10).

- `updateAction(context, { actionId, newStage, fields, actionDisplay = {}, metadata = null, eventId, currentActionId, force })` calls `renderStatusMap` + `computeEngineLinks` against `{ ...actionDocBeforeWrite, ...fields }`, then `buildActionStageUpdate`, wraps the pipeline in `MongoDBUpdateOne`. Replaces today's `$set` + `$push` shape; the `$concatArrays` form handles the prepend. New params vs today: `actionDisplay` (per-call cell override, D8) and `metadata` (caller-supplied accumulating bag, D10) — both flow into the render context. Both default safely so engine-internal callers (`fireTrackerSubscription`, `reevaluateBlockedActions`) that have no caller-supplied display or metadata simply omit them; sticky display fills the gap and `metadata` stays at its prior value. Covers the `StartWorkflow` parent-tracker path at `StartWorkflow.js:117-128` — the same call that sets `child_workflow_id` produces an `in-progress` cell whose tracker link references it.
- `createAction(context, { workflow, action, actionDisplay, metadata, eventId })` calls `renderStatusMap` + `computeEngineLinks` against the in-memory draft (no separate `fields` — the draft is already the merged source of truth), embeds the rendered cell + computed links + `metadata` in the `InsertOne` payload. No pipeline (it's an insert). New params vs today: `actionDisplay` and `metadata`, mirroring `updateAction`.
- Cancel/Close cascade fetches the non-terminal actions, then per action: calls `renderStatusMap` + `computeEngineLinks` (sweep doesn't supply caller fields, so the merged doc is just `actionDocBeforeWrite`), then `buildActionStageUpdate`, then `MongoDBUpdateOne({ filter: { _id }, update: <pipeline> })` — one community-plugin call per action (N sequential round-trips, keeps change-logging per op).

`fireTrackerSubscription` (Part 10) and `reevaluateBlockedActions` (Part 11) call `updateAction` and inherit render + link computation automatically.

**Force/fetch unification.** Today `updateAction` skips the pre-write fetch when `force: true` (the fetch only existed to feed the `shouldUpdate` priority gate, which force bypasses). With render-on-write, both paths need the pre-write doc for template context — so `updateAction` is changed to fetch the action doc unconditionally. `force` is narrowed to control only whether `shouldUpdate` runs; it no longer affects fetching. This drops the two-branch shape, removes the asymmetry between user-submit and engine-internal callers, and uniformly gives both the priority gate and the renderer the freshest possible doc (so they observe any earlier writes in the same submit — auto-unblocks, tracker propagation, etc.). Cost: one extra Mongo read per force call (handful per submit at most, sub-ms each). The Cancel/Close cascade does not go through `updateAction` (it composes the helpers directly and writes via `bulkWrite`), so sweep-scale operations are unaffected.

**Cancel/Close ordering.** The cascade's post-sweep summary recompute (the `MongoDBFind` over all actions in `CancelWorkflow.js:98-129` and the equivalent block in `CloseWorkflow.js`) runs **after** the per-action loop completes — same read-after-write order as today's `MongoDBUpdateMany` + summary read. The switch from `MongoDBUpdateMany` to a per-action `MongoDBUpdateOne` loop only changes the per-action update mechanic; it preserves the existing two-write structure so the summary always reads post-sweep state.

### D12. No backfill for in-flight action docs

The new top-level `<app-slug>` / `status_title` fields are written only on stage transitions going forward. There are no current consumers of this module — it's wip and currently non-functional — so the question of stranded in-flight docs doesn't arise. The demo app's actions will get fresh rendered cells on the next transition triggered by exercising the demo flows; no backfill migration, no UI fallback, no quiescence procedure.

If a real consumer adopts this module before transitioning all its in-flight workflows, the rollout will need one of: a one-shot backfill that walks live action docs and writes the cell, a runtime read-fallback through `status_map[stage]` in the UI for one release, or quiescence. That's a future concern; not in scope here.

### D13. Render walks the cell tree; doesn't JSON-stringify-roundtrip

Reference uses `JSON.stringify` → Nunjucks → `JSON.parse`. Works but type-lossy for edge cases (`undefined`, `Date`, dot-notation keys with reserved chars). We do a recursive walk:

```js
function renderTree(node, ctx) {
  if (typeof node === "string") return parseNunjucks(node, ctx);
  if (Array.isArray(node)) return node.map((n) => renderTree(n, ctx));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = renderTree(v, ctx);
    return out;
  }
  return node;
}
```

For `kind: custom`, after render run `substituteActionIdSentinel` on the rendered tree to swap `{ action_id: true }` → UUID. For built-in kinds, no sentinel pass — the engine builds `urlQuery` directly with the UUID when computing the link.

### D14. Engine renders event display before `callApi('new-event')`

Engine-written events flow through `context.callApi('new-event', module: 'events')` from connection-plugin JS code (`dispatchLogEvent.js`). Lowdefy's payload-evaluation pass doesn't cross that boundary — JS-literal objects ship verbatim to `new-event`, where `_payload: display` returns the same literal, and the timeline block has no operator evaluator. The [`event_display` idiom](../../../../../docs/idioms.md#event-display) (plain Nunjucks template strings, rendered by the writing layer) only holds when the writer is a Lowdefy YAML CallApi — every other module's case. Engine-written events break it.

Fix: render in the engine before `context.callApi`. Same `renderTree` helper as action display.

**Render context** (fixed; everything below is already in scope inside `dispatchLogEvent` and its caller — no extra fetches):

| Binding         | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| `user`          | `context.user` — invoking user                                                   |
| `action`        | post-write action doc — the action this event is about                           |
| `workflow`      | workflow doc — workflow-level fields not on the action (`key`, `summary`, …)     |
| `interaction`   | `submit_edit` / `approve` / `request_changes` / `not_required` / `resolve_error` |
| `status_before` | prior stage, or `null` for the initial write                                     |
| `status_after`  | new stage                                                                        |

**Why `action`, not `target` (the idiom's name).** The [`event_display` idiom](../../../../../docs/idioms.md#event-display) names the "entity being changed" binding `target` and documents the shape as module-specific. The spirit is "the noun is module-specific"; the workflow path uses `action` because every other surface in this module (designs, code, concept specs) calls it that. Renaming to `target` only at the template-binding layer is a context switch with no payoff — app authors writing workflow event-override templates are unlikely to also be authoring contacts/companies templates concurrently. Each module's README documents its binding noun; workflows = `action`.

**`action` exposes the full post-write action doc:** `_id`, `workflow_id`, `workflow_type` (the _parent_ workflow's type), `type`, `kind`, `key`, `action_group`, `status[]`, `entity_id`, `entity_collection`, `assignees[]`, `due_date`, `description`, `tracker.child_workflow_type` (tracker only — the _child_ workflow's type, renamed from `tracker.workflow_type` to disambiguate from the top-level `workflow_type` — see Schema additions § Action doc), `child_workflow_id` (tracker only), `metadata`, `status_title`, `<app-slug>.message`, `<app-slug>.link`, `created`, `updated`, plus any caller-supplied `references`.

**`workflow` exposes workflow-level fields not denormalised onto the action:** `_id`, `key`, `display_order`, `status[]` (workflow open/closed/cancelled), `summary` (`{done, not_required, total}`), `form_data`, `parent_action_id` / `parent_entity_id` / `parent_entity_collection`, `created`, `updated`. (`workflow_type`, `entity_id`, `entity_collection` are on the action doc too — reach them via either binding.) `workflow.key` is the common reach; `workflow.summary` matters for group-complete and workflow-close events.

**`interaction` lets the engine default be one template.** Without it the default has to either be one bland line for all interactions or branch in JS to pick a template per interaction. With it, a single template can vary by interaction — e.g. via `{% if interaction == 'request_changes' %}...` or a per-verb map lookup. The engine's actual default template is the "marked X as Y" shape committed at the bottom of "Modified" for `dispatchLogEvent.js`; this paragraph just notes that `interaction` is what makes any single-template default possible.

**No top-level `metadata` binding.** Metadata is reachable via `action.metadata.physical_id` — the action doc already carries the merged metadata (D5/D6). Surfacing a parallel top-level `metadata` binding would collide with the event-payload field `metadata` that `dispatchLogEvent` writes onto each event doc (`action_type`, `workflow_type`, `interaction`, `current_key`, `status_before`, `status_after`, `comment`), making `{{ metadata.X }}` ambiguous in any template that mixes event-payload and action-metadata reads. Dropping the alias closes the collision and trims one binding from a render context that intentionally stays narrow.

**`status_before` and `status_after` top-level.** Derivable from `action.status[1].stage` / `action.status[0].stage` post-write — top-level aliases are the convenience.

**Plain templates, no `on:` — all three source layers.** Author syntax for every event-display source on the engine path is plain Nunjucks template strings. Three channels feed `dispatchLogEvent` via `mergeEventOverrides` (in merge order: default → YAML → pre-hook):

1. **Engine-default templates** — the `DEFAULT_TITLE_TEMPLATE` / `DEFAULT_DETAIL_TEMPLATE` constants at the top of `SubmitWorkflowAction/dispatchLogEvent.js`. Plain strings, owned by this part.
2. **YAML-authored overrides** — `params.event_overrides[interaction].display.{app}.{field}`, baked into the per-action submit API's `properties` by `makeWorkflowApis.emitEventOverrides` (Part 13). Authored in the workflow's action YAML as `event.{interaction}.display.{app}.title` etc. Plain strings.
3. **Pre-hook returns** — `preHookResponse.event_overrides.display.{app}.{field}`, JS-shaped object literals returned from a pre-hook routine. Plain strings.

No `_nunjucks: { template, on }` operator wrapping anywhere on the engine-write path. The `on:` syntax used inside `_build.function`-wrapped callbacks in modules like `contacts/api/create-contact.yaml` is an implementation detail of how a Lowdefy YAML CallApi caller wires runtime bindings into a template — it has no parallel here, because the engine knows its own context directly.

**Why the YAML channel matters specifically.** Lowdefy's `evaluateOperators` pass walks API `properties` and resolves every registered operator before the connection handler runs (`evaluateOperators.js:50-220`; cross-checked in [Part 32 review-1 finding #3](../../_completed/32-drop-static-overrides/review/review-1.md)). A YAML author who writes `event.submit_edit.display.demo.title: "{{ user.profile.name }} ..."` (plain string) ships an unrendered Nunjucks template through to the handler — `renderEventDisplay` resolves it against the engine context. Correct. A YAML author who writes `event.submit_edit.display.demo.title: { _nunjucks: { template: "...", on: { user: true, action_type: true } } }` (the cross-repo `event_display` idiom in use in modules like `contacts/api/create-contact.yaml`) gets the operator evaluated by Lowdefy's pre-handler pass against the **CallApi caller's** page-side context — `action_type` doesn't exist in page state, so it resolves empty; `user` resolves from page state, not the engine's `context.user`. The handler then re-runs `renderTree` on the already-rendered string (no-op — no braces remain), and the event ships with wrong/empty values. This is a behaviour change from the cross-repo idiom and the README (Task 15) must call it out: workflow event templates are plain Nunjucks strings — the `_nunjucks: { template, on }` wrapping does not work on the engine path. Enforcement is by documentation + Lowdefy's own operator-pass behaviour, not by special handling in `renderTree`; the walker keeps its simple shape (D13). No consumers exist today, so there's no migration tolerance to engineer.

**Post-write action doc, not pre-write.** Events describe what just happened. `action = post-write action doc` and `status_after = newStage` give templates the obvious bindings to write `"{{ user.profile.name }} moved {{ action.key }} to {{ status_after }}"`. Different from action display's pre-write context (D10) — there, the cell describes the state being transitioned to; here, the event describes the transition having occurred.

**No `entity` binding.** The underlying business entity (the lead, lot, company the workflow operates on) is **not exposed**. Two reasons:

1. **Cost.** The engine doesn't fetch the entity doc today. Exposing `entity` would add a Mongo round-trip per submit purely for event rendering.
2. **Shape varies per app.** Entity field names (`entity.name` vs `entity.company_name` vs `entity.title`) are app-specific. A binding whose shape we can't pin down would produce silently-empty `{{ entity.name }}` references in templates written for one app and reused in another.

If an app needs entity-specific text in event copy, the workaround is clean: pass the relevant string in `metadata` at submit time (caller payload, or a pre-hook that fetches the entity and returns `event_overrides.metadata.entity_name`). Identity (the entity ID) is reachable via `action.entity_id` for timeline-side linkout.

## Current state

### Engine — `status_map` is never written

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`:

- [`shared/createAction.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/shared/createAction.js) builds the action doc from config but copies only `type, kind, key, action_group, status, tracker, entity_*, assignees, due_date, description, child_*`. **No `status_map` lookup, no render.**
- [`shared/updateAction.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/shared/updateAction.js) — same gap.
- [`StartWorkflow/StartWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) — calls `createAction`; inherits the gap.
- [`SubmitWorkflowAction/handleSubmit.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js) — reads `actionConfig.access` but never `actionConfig.status_map`.
- [`CancelWorkflow/CancelWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js):84-96 — `MongoDBUpdateMany` pushes `{ stage: 'not-required' }` onto each affected action's status. No render.
- [`CloseWorkflow/CloseWorkflow.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js):84-130 — same shape, sweeps blocked/non-terminal to `not-required`.

### Resolver — passes `status_map` through but doesn't validate cell shape

`modules/workflows/resolvers/`:

- [`makeWorkflowsConfig.js`](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js):15 — `status_map` is in `ACTION_FIELDS`, gets `pick()`ed into runtime config.
- [`makeWorkflowsConfig.js`](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js):154-163 — validates `status_map` keys against `ACTION_STATUSES` (good).
- **No per-cell shape validation.** Built-in-kind cells can illegally declare `link:` today; nothing rejects it.

### Display layer — projected and read fields that don't exist

Three `$lookup` aggregations project `message` / `link` from `$<app_name>.{message|link}` on each action doc — the engine never writes those top-level keys, so projections resolve to `undefined` and downstream surfaces render blank.

- [`api/get-entity-workflows.yaml`](../../../../../modules/workflows/api/get-entity-workflows.yaml):62-71 — projection feeds `components/actions-on-entity.yaml` (which renders an `ActionSteps` block off `entity_workflows.$.actions`; the component itself never references `status_map`).
- [`api/get-workflow-overview.yaml`](../../../../../modules/workflows/api/get-workflow-overview.yaml):40-49 — projection feeds `pages/workflow-overview.yaml`, which already reads `actions_list.$.message` / `.link` directly. Display is in the target shape; just resolves undefined today.
- [`api/get-action-group-overview.yaml`](../../../../../modules/workflows/api/get-action-group-overview.yaml):48-57 — same projection. The page that consumes it (`pages/group-overview.yaml`) ignores the projected fields and instead reads `a.status_map[stage][appName].message` / `.link` directly off the action doc.
- [`pages/group-overview.yaml`](../../../../../modules/workflows/pages/group-overview.yaml):274, 293, 312 — `a.status_map` is undefined; the `_get` chain falls through to `default: null`. The only display surface whose page-side code still reads `status_map` and so the only one this part edits on the page side.

### Engine — event display ships operator literals unrendered

- [`dispatchLogEvent.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js):106-122 — single entry point for engine-written events. Builds a JS-literal payload (engine default + runtime `comment` + pre-hook `event_overrides`) and calls `context.callApi('new-event', module: 'events')`. **No render pass.** Operator-shaped values in `display` (e.g. engine-default `_nunjucks: { template, on }` literals, pre-hook returns of the same shape) ship verbatim.
- [`modules/events/api/new-event.yaml`](../../../../../modules/events/api/new-event.yaml):8-13 — does `_payload: display`, which returns the literal it received. Operator objects are stored as Mongo docs.
- [`EventsTimeline.js`](../../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js):225 — `sanitize(title)`; expects a string. A literal `{ _nunjucks: ... }` object renders empty or `[object Object]`.

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
                 │       ├── apply payload.action_display[slug] override(s)
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

| Field                         | Type                  | Source                                                                                                                                       | Lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<access-slug>.message`       | string \| null        | Rendered cell `message` for the slug, or unchanged from previous stage if cell omits the slug                                                | Sticky. Written when an authored cell sets it; persists across transitions until the next cell mentions it or an explicit `null` clears it.                                                                                                                                                                                                                                                                                                                                                              |
| `<access-slug>.link`          | object \| null        | **Built-in kinds:** engine-computed from `(kind, stage, slug's access verbs)`. **Custom kind:** rendered from authored cell's `link:` field. | Recomputed every transition for built-in kinds — never stale. For custom kind, sticky like `message` — author re-authors per stage that changes it.                                                                                                                                                                                                                                                                                                                                                      |
| `status_title`                | string \| null        | Rendered cell `status_title`, or unchanged from previous stage if cell omits it                                                              | Sticky.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `metadata`                    | object \| null        | Caller-supplied; accumulated `{ ...old, ...new }`                                                                                            | Set on every write that includes `metadata` in payload.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `workflow_type`               | string                | Copied from `workflow.workflow_type` at action-doc creation in `createAction.js`. Immutable thereafter.                                      | Set once at creation. Denormalised onto every action doc so report aggregations, downstream consumers, and the engine's form-link computation can read workflow type from a single action doc without joining to `workflows`. Matches the existing denormalisation of `entity_id` / `entity_collection`. Present on the reference implementation; absent in the current modules-mongodb implementation — Part 30 restores it.                                                                            |
| `tracker.child_workflow_type` | string (tracker only) | Copied from `actionConfig.tracker.workflow_type` at action-doc creation in `createAction.js`. Immutable thereafter.                          | **Renamed** from `tracker.workflow_type` to disambiguate from the new top-level `workflow_type` (parent workflow's type). The new name parallels the existing `child_workflow_id` / `child_entity_id` / `child_entity_collection` fields under `action.tracker` and matches "the child workflow this tracker subscribes to" semantically. Author-facing action config keeps `tracker.workflow_type: <child-type>` (no nested-doc collision at config-authoring time); only the action-doc field changes. |

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
  currentActionId: "a3f2-uuid",
  actions: [{ type: "install-step", status: "in-progress" }],
  metadata: { assignees: [{ name: "Alice" }] },
});
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
- `plugins/modules-mongodb-plugins/src/utils/renderTree.js` — recursive walker per D13. Single source of the `renderTree(node, ctx)` helper; imported by both `renderStatusMap.js` and `renderEventDisplay.js` so the walk semantics (string → `parseNunjucks`, array → map, object → recurse, primitive → passthrough) live in one place.
- `plugins/modules-mongodb-plugins/src/utils/renderTree.test.js` — unit tests: strings rendered, arrays mapped element-wise, nested objects recursed, primitives pass through, `null` / `undefined` pass through, dot-notation keys preserved.
- `plugins/modules-mongodb-plugins/src/connections/shared/substituteActionIdSentinel.js` — sentinel-swap helper for `kind: custom` cell links. Named to avoid collision with the existing `shared/populateIds.js` (UUID assigner for new action drafts).
- `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.js` — render orchestrator. Inputs: `{ actionConfig, stage, actionDocBeforeWrite, actionDisplay, mergedMetadata, actionId }` — where `actionDisplay` is the caller-supplied `payload.action_display` per D8. Outputs: `{ renderedCell }` — the rendered cell ready to spread (Nunjucks applied; sentinel substituted for custom kind). Returns `{}` for absent cells (sticky display).
- `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.js` — `({ actionConfig, stage, actionDoc, entryId }) → { [slug]: { $mergeObjects: [...] } }` for built-in kinds; `{}` for `kind: custom`. `actionDoc` is the **merged** action doc — `{ ...actionDocBeforeWrite, ...fields }` at the call site, or the in-memory draft for the initial-insert path — so per-kind rules can read `actionDoc._id` (task/form `urlQuery`), `actionDoc.workflow_type` (form `pageId`), and `actionDoc.child_workflow_id` (tracker `urlQuery`) off one source. `entryId` is the workflows module entry id (from `context.entry_id`); the helper prefixes every emitted `pageId` with `${entryId}/` so engine-written links match Lowdefy's build-time `_module.pageId` scoping (`${entryId}/${pageId}`) at runtime — see D4 § Mechanic. Callers (`updateAction`, `createAction`, Cancel/Close sweep) thread `context.entry_id` through. Encapsulates the (kind, stage, access verbs) link defaults table from D4.
- `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.js` — builds the single-stage `$set` aggregation pipeline from `{ renderedCell, engineLinks, newStage, mergedMetadata, eventId, changeStamp }`. Per D11.
- `plugins/modules-mongodb-plugins/src/connections/shared/renderStatusMap.test.js` — unit tests: render with action+metadata context, absent cell returns `{}`, sentinel swap for custom kind only, override merge, accumulated metadata.
- `plugins/modules-mongodb-plugins/src/connections/shared/computeEngineLinks.test.js` — unit tests: task kind link table (edit slug, view slug, review slug, no-verb slug per stage), form kind page IDs use `actionDoc.workflow_type` + `actionDoc.type`, tracker kind uses `urlQuery: { workflow_id: actionDoc.child_workflow_id }`, tracker with `child_workflow_id: null` produces `link: null`, custom kind returns `{}`. Every emitted `pageId` is prefixed with `${entryId}/` — assert against `entryId: 'workflows'` and `entryId: 'wf-2'` to confirm multi-mount scoping; assert that a missing `entryId` argument throws (engine-runtime safety). Assert that passing a merged doc with `child_workflow_id` set produces a link that references it (covers the StartWorkflow parent-tracker path from D11).
- `plugins/modules-mongodb-plugins/src/connections/shared/buildActionStageUpdate.test.js` — unit tests: pipeline shape; `$concatArrays` prepend; sticky `message` via `$mergeObjects`; engine links replace `link` field on each access slug.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/renderEventDisplay.js` — runs `renderTree` on the event payload's `display` field against the fixed `{ user, action, workflow, interaction, status_before, status_after }` render context (per D14). Uses the same `renderTree` walker and `parseNunjucks` helper as `renderStatusMap`. Inputs: `{ eventPayload, user, action, workflow, interaction, statusBefore, statusAfter }`. Output: a new event payload with `display` rendered to strings. Action metadata reaches templates via `action.metadata.*` — no separate `mergedMetadata` parameter, since `action.metadata` is already the merged-and-written value by the time event display renders (events fire post-write).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/renderEventDisplay.test.js` — unit tests: plain template renders against each binding; nested per-app keys (`display.app-a.title`, `display.app-b.title`) render independently; `action` exposes action-doc fields (assert `action.key`, `action.assignees[0].name`, `action.metadata.*` resolve); `workflow` exposes workflow-only fields (assert `workflow.workflow_type`, `workflow.key`, `workflow.summary.done` resolve); `interaction` binds to the verb string; `status_before: null` on initial write; non-string values pass through unchanged; payload fields outside `display` are untouched.

### Modified

- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` — update the `parseNunjucks` import from `./parseNunjucks.js` to `../../utils/parseNunjucks.js`. This is the only file in `plugins/modules-mongodb-plugins/src/` that imports `parseNunjucks` today (verified via `grep -rn "parseNunjucks" plugins/modules-mongodb-plugins/src/`); rerun the grep before the move in case a new importer landed. Delete the old `ContactSelector/parseNunjucks.js` as part of the move.
- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js` — accept new params `actionDisplay` (per-call cell override, D8) and `metadata` (caller-supplied accumulating bag, D10) on the options object; full signature becomes `createAction(context, { workflow, action, actionDisplay, metadata, eventId })`. Add `workflow_type: workflow.workflow_type` to the action draft (alongside the existing `entity_id` / `entity_collection` denormalisations) so every action doc carries its owning workflow's type — see the Schema additions § Action doc row for `workflow_type`. **Rename** the tracker-subtree write at line 51 from `tracker: { workflow_type: actionConfig.tracker.workflow_type }` to `tracker: { child_workflow_type: actionConfig.tracker.workflow_type }` — the action-doc field carrying the child workflow's type becomes `tracker.child_workflow_type`, paralleling the existing `child_workflow_id` / `child_entity_id` / `child_entity_collection` siblings on the same subtree and disambiguating from the new top-level `workflow_type` (the parent's type). The action **config** side (`actionConfig.tracker.workflow_type`, read here) is unchanged — author-facing YAML keeps the simpler name where there's no collision. Call `renderStatusMap` + `computeEngineLinks` against the in-memory draft doc; embed the merged result + `metadata` in the returned draft. Ordering inside the helper: assign `draft._id = randomUUID()` first (today's behaviour at line 31), then run `renderStatusMap` so sentinel substitution can swap `{ action_id: true }` → `draft._id` on the rendered tree; pass `draft._id` into the renderer as `actionId`.
- `plugins/modules-mongodb-plugins/src/connections/shared/updateAction.js` — accept new params `actionDisplay` and `metadata`; full signature becomes `updateAction(context, { actionId, newStage, fields, actionDisplay, metadata, eventId, currentActionId, force })`. Call `renderStatusMap` + `computeEngineLinks` + `buildActionStageUpdate`; replace today's `$set` + `$push` update doc with the resulting aggregation pipeline. Pull the `getCurrentAction` fetch out of the current `if (force !== true)` block so it runs on every call (the fetched doc feeds both the priority gate and the renderer); `force` continues to control whether `shouldUpdate` runs but no longer skips the fetch. Per D11 § "Force/fetch unification".
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js` — replace inline `MongoDBUpdateMany` (lines 84-96) with: fetch non-terminal actions, loop, call the three helpers per action (`renderStatusMap` + `computeEngineLinks` + `buildActionStageUpdate`), and `await MongoDBUpdateOne` per action. Per D11. Per-action `status[]` entry stays `{ stage: 'not-required', created, event_id }` — workflow-level `cancelled` carries `reason`, per-action sweep does not (preserve today's behaviour).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CloseWorkflow/CloseWorkflow.js` — same shape for the sweep at lines 84-130. Same no-`reason`-on-action-entries rule applies.
- `plugins/modules-mongodb-plugins/src/connections/shared/recomputeWorkflowAfterActionWrite.js` — change the return shape so `result.workflow` reflects the writes the helper just persisted. Today the helper fetches the workflow doc once at line 37 and returns that pre-write reference alongside the freshly-computed `summary` / `groupsAfter` / `shouldPushCompleted` as sibling fields, so `result.workflow.summary` is the pre-write value. Compose the post-write workflow from values already in scope and return that instead:

  ```js
  const updatedWorkflow = {
    ...workflow,
    summary,
    groups: groupsAfter,
    updated: context.changeStamp,
    ...(shouldPushCompleted
      ? {
          status: [
            {
              stage: "completed",
              event_id: context.eventId,
              created: context.changeStamp,
            },
            ...(workflow.status ?? []),
          ],
        }
      : {}),
  };
  return {
    workflow: updatedWorkflow,
    workflowActions,
    groupsBefore,
    groupsAfter,
    reEvaluatedActionIds,
    shouldPushCompleted,
    summary,
  };
  ```

  This makes `result.workflow` symmetric with what the helper writes to Mongo at lines 122-126 — one place encodes the composition, every caller (handleSubmit's event-dispatch path today, any future engine path) gets a fresh workflow object by reading `result.workflow` directly with no caller-side recipe to remember.

  **Forward-looking note.** Today only `handleSubmit` dispatches a log event after the recompute. `fireTrackerSubscription` already calls this helper but does **not** dispatch — so the staleness shape doesn't bite there. If a future part adds an engine-side log dispatch after the recompute (e.g. a "tracker advanced" event from inside `fireTrackerSubscription`, or any new caller of `recomputeWorkflowAfterActionWrite`), that path must render its event templates against `recomputeResult.workflow` — not against a parent workflow doc fetched earlier in the same handler — or it will hit the same `workflow.summary` staleness this fix closes.

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — already routes through `updateAction`. Four required edits:
  1. In the step-4 per-entry write loop, pass `actionDisplay: params.action_display` and `metadata: params.metadata` into the `updateAction` call (and into the `createAction` call on the upsert branch) so caller-supplied per-app overrides and the metadata bag reach the renderer.
  2. After the step-5 recompute, refresh `context.action` by picking the submitted action out of `recomputeResult.workflowActions` with `.find(a => a._id === context.action._id)`. The recompute already re-reads every action in this workflow from Mongo, so the post-write copy is in hand — no extra Mongo round-trip.
  3. After the step-5 recompute, reassign `context.workflow = recomputeResult.workflow`. Per the `recomputeWorkflowAfterActionWrite.js` Modified bullet below, the helper now returns a post-write workflow object (fresh `summary`, `groups`, `updated`, and a prepended `completed` status entry when `shouldPushCompleted`), so this single assignment is enough — no caller-side recipe — and templates like `"{{ workflow.summary.done }}/{{ workflow.summary.total }}"` resolve against post-write values.
  4. Inside the step-6 `if (Object.keys(formMerged).length > 0)` block, after constructing `setOps` and before (or alongside) the `MongoDBUpdateOne`, mirror the same write into `context.workflow` in memory so step 7's event-display render sees post-write `workflow.form_data`. The recompute helper (edit 3 above) fetches the workflow doc **before** step 6 runs — so without this in-memory mirror, `context.workflow.form_data` is stale at dispatch and templates like `"{{ workflow.form_data.install-step.physical_id }}"` resolve to pre-write (or `undefined`) values. Inline shape:

     ```js
     const actionTypeBucket = {
       ...(context.workflow.form_data?.[context.action.type] ?? {}),
     };
     if (context.params.current_key) {
       actionTypeBucket[context.params.current_key] = {
         ...(actionTypeBucket[context.params.current_key] ?? {}),
         ...formMerged,
       };
     } else {
       Object.assign(actionTypeBucket, formMerged);
     }
     context.workflow = {
       ...context.workflow,
       form_data: {
         ...(context.workflow.form_data ?? {}),
         [context.action.type]: actionTypeBucket,
       },
       updated: context.changeStamp,
     };
     ```

     Kept inline (single caller, single shape) rather than extracted to a helper; if a second caller emerges or the form_data path layout changes, extract then. The `updated` stamp is mirrored too so any downstream reader of `workflow.updated` between step 6 and step 7 stays consistent with what was just written.

  Without edit 1, caller `action_display` / `metadata` are silently dropped. Without edits 2-3, `action.metadata`, `action.status[0].stage`, `action.<appName>.message`, and `workflow.summary.*` in event templates resolve to pre-write (or unset) values. Without edit 4, `workflow.form_data.*` in event templates resolves to pre-write values for any field touched by this submit.

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — three changes:
  1. Pass `payload.metadata` through to `createAction` for each starting action.
  2. The parent-tracker `updateAction` push at lines 117-128 inherits render + link computation from `updateAction`; it omits `actionDisplay` / `metadata` (relying on the safe defaults committed in D11 — `actionDisplay = {}`, `metadata = null`), and is the call site that produces the tracker's first non-null `link` once `child_workflow_id` is set. Sticky display + prior `action.metadata` cover the render context for this internal push. This is the canonical test case for D11's "Engine-link merge rule" — link computation must run against `{ ...actionDocBeforeWrite, ...fields }` so the `in-progress` cell's tracker link picks up the newly-set `child_workflow_id`.
  3. Update the parent-tracker validation at lines 67-71 to read the renamed action-doc field: `parent.tracker?.workflow_type` → `parent.tracker?.child_workflow_type`, and update the error string at line 69 from `"parent tracker.workflow_type"` to `"parent tracker.child_workflow_type"`. See the `createAction.js` Modified bullet for the rename rationale.

`SubmitWorkflowAction/fireTrackerSubscription.js` and `SubmitWorkflowAction/reevaluateBlockedActions.js` both write stages via `updateAction` already. They inherit render + link computation automatically — no edits needed.

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — add `validateStatusMapCells(workflow, action)`: validate per-cell shape only (per D9). Built-in kinds reject `link:` in cells; custom accepts `{ message?, link? }`. No coverage validation. No `status_map_app_slugs` emission (engine doesn't need it).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — add `entry_id` (string, required) to the connection schema's `properties` and `required` list, alongside the existing `app_name` field. Description: "The workflows module entry id under which this connection is mounted. Engine uses it to compose module-scoped page IDs for engine-managed links (`${entry_id}/task-edit`, etc.), matching Lowdefy's build-time `_module.pageId` scoping (`${entryId}/${pageId}`) at runtime. Apps wire this from `_module.id: true` on `connections/workflow-api.yaml`. See Part 30 D4."
- `modules/workflows/connections/workflow-api.yaml` — add `entry_id: { _module.id: true }` to `properties`, alongside the existing `app_name: { _module.var: app_name }` wiring. `_module.id: true` resolves at build time to the entry id under which the workflows module is mounted (Lowdefy build/walker.js:479), giving the runtime engine the same prefix Lowdefy uses when scoping `_module.pageId` references.
- `modules/workflows/module.lowdefy.yaml` — update `app_name` var description to reflect its third role (action display); no schema change.
- `modules/workflows/pages/group-overview.yaml` — switch the `_get from: actions_list.$.status_map` blocks at lines 265-317 to read `actions_list.$.message` / `actions_list.$.link` (matching what `workflow-overview` already does). The other two display surfaces (`components/actions-on-entity.yaml`, `pages/workflow-overview.yaml`) are already in the target shape — they feed off projected `message` / `link` fields that light up automatically once the engine writes the top-level `action[appName]` subdoc; no page-side edits required.
- `modules/workflows/api/start-workflow.yaml` — add `metadata: { _payload: metadata }` and `action_display: { _payload: action_display }` to the `StartWorkflow` action's `properties`, documenting the two new caller-facing payload fields (per D8 + Proposed-change item 5).
- `modules/workflows/resolvers/makeWorkflowApis.js` — extend the emitted-api payload mapping at lines 71-80 to pass `metadata: { _payload: metadata }` and `action_display: { _payload: action_display }` through every `update-action-{action_type}` Api. Both fields then flow into the `SubmitWorkflowAction` plugin handler via `request.metadata` / `request.action_display`.
- `modules/workflows/README.md` — add `metadata` and `action_display` to the Start / Submit payload documentation. `action_display` should be documented as the per-call override path for the **action**'s per-app cell, scoped to one transition (not persisted to the action config); shape is `{ [slug]: cellShapeForKind }` matching the cell shape rules from D6. The README must call out the distinction from `event_overrides.{interaction}.display` (which targets the **event** doc, has `{ title, detail?, icon? }` per slug, and is documented in Part 9 / Part 32) so readers don't conflate the two.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — call `renderEventDisplay` on the assembled event payload before `context.callApi('new-event', ...)`. Render context is built from the handler's pre-existing locals (`context.user`, the post-write action doc which already carries merged metadata, the workflow doc, `interaction`, `statusBefore`/`statusAfter`); no caller-API change.
- Engine event-default templates source (the `DEFAULT_TITLE_TEMPLATE` / `DEFAULT_DETAIL_TEMPLATE` constants at the top of `SubmitWorkflowAction/dispatchLogEvent.js`, or wherever `buildDefaultLogEventPayload` ships them) — change the engine's default templates from any `_nunjucks: { template, on }` operator-literal shape to **plain Nunjucks template strings**, matching the `event_display` idiom. Rename bindings to match the new fixed render context — specifically `{{ action_type }}` → `{{ action.type }}`. The new default title becomes:

  ```
  {{ user.profile.name }} marked {{ action.type }} as {{ status_after }}
  ```

  Update the two existing test expectations in `SubmitWorkflowAction/dispatchLogEvent.test.js` that assert on the old rendered string (they currently expect `"... marked install-step as done"` produced from `action_type`); they must assert against the new template's output produced from `action.type`. Same renames apply to any other engine-default template that referenced flat-bound names removed by the new context (`status_before`, `status_after`, `interaction` survive; `action_type` does not).

### Demo + tests

- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — strip authored `link:` from existing cells (engine now drives links). Optionally trim cells to demonstrate sticky display (drop `not-required` cell, etc.). Add a templated message referencing `{{ metadata.* }}` to match the worked example. Also fix `access.demo` from the nested `{ roles, verbs }` shape to the array-of-verbs shape (`access.demo: [view]`) that the rest of the demo configs and `handleSubmit.js` already use — today's config silently bypasses role gating because there's no top-level `access.roles`.
- `apps/demo/modules/workflows/workflow_config/onboarding/track-step-*.yaml` — strip authored `link:` from cells. Otherwise no changes — sticky display means missing stages (e.g., no `action-required` cell) are fine.
- `apps/demo/lowdefy.yaml` (or wherever the workflows module is mounted) — `vars.app_name: demo` already set (no change).
- New tests in `StartWorkflow.test.js`, `updateAction.test.js`, `CancelWorkflow.test.js`, `CloseWorkflow.test.js`:
  - On Start, action doc has rendered `message` for slugs in the cell, plus engine-computed `link` per slug × stage.
  - On Submit to a stage with a cell, `message` overwrites; engine recomputes link.
  - On Submit to a stage with NO cell, `message` persists (sticky); engine still recomputes link.
  - On Submit to `blocked`, links are null for all slugs; messages persist from previous stage.
  - `metadata` accumulates across transitions.
  - Override path: `payload.action_display.demo = { message: 'custom {{ x }}' }` with `metadata: { x: 1 }` renders `'custom 1'`.
  - Cancel/Close sweep: each affected action gets `status` prepend + sticky message + recomputed link.
- New tests in `makeWorkflowsConfig.test.js`:
  - Cell shape validation: built-in kind cell with `link:` in a slug throws.
  - Cell shape validation: custom kind cell with valid `{ message, link }` passes.
  - No coverage requirement: workflow with no `status_map` at all passes.
- New tests in `dispatchLogEvent.test.js` (or equivalent SubmitWorkflowAction event-write test):
  - Engine-default event template (plain Nunjucks string) renders against `{ user, action, workflow, interaction, status_before, status_after }` before reaching `new-event`. The payload that lands at `context.callApi('new-event', ...)` carries rendered strings, not operator literals.
  - Pre-hook `event_overrides.display.app-a.title` with a plain Nunjucks string renders against the same context.
  - `action` exposes post-write action-doc fields (assert `action.key`, `action.assignees[0].name`, `action.metadata.*` resolve correctly).
  - `workflow` exposes workflow-only fields not on the action doc (assert `workflow.workflow_type`, `workflow.key` resolve).
  - `interaction` renders to the verb string (e.g. `submit_edit`).
  - Initial-write event (no prior stage) renders with `status_before: null` and templates referencing it produce empty strings.
- Update existing tests against the new on-disk shape (single-stage aggregation `$set` pipeline with `$concatArrays` prepend; rendered top-level `<app-slug>.message` / `.link` / `status_title` / `metadata` / `workflow_type` fields on action docs; tracker action docs use `tracker.child_workflow_type` rather than `tracker.workflow_type`). Affected tests:
  - `updateAction.test.js`
  - `handleSubmit.test.js`
  - `fireTrackerSubscription.test.js`
  - `reevaluateBlockedActions.test.js`
  - `event-id-round-trip.test.js`

  Re-assertion is mechanical (snapshot shapes change) but spelling it out so task files reference it explicitly.

## Non-goals

- **A general-purpose template engine in the UI.** Display surfaces stay dumb. Anything that needs runtime templating reads metadata fields directly or calls a server API.
- **Per-status custom render functions.** Authors can't supply JS render functions — Nunjucks templates only.
- **Render history.** The action carries the current stage's render. Past stages' rendered text is gone; the `status[]` array carries only `{ stage, created, event_id }`. If audit needs past-render history, log it to `events` at transition time (separate concern).
- **Validating Nunjucks templates against the render context at build time.** A template that references `{{ nonexistent_field }}` renders to empty string; the build doesn't catch it. Out of scope.
- **Replacing the existing `actions-on-entity` rendering library.** The component still uses ActionSteps — only the per-card message/link source changes.

## Related

- [Part 04 — workflows-config resolver](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js) — the resolver this part extends.
- [Part 12 — resolver pages](../12-resolver-pages/design.md) — emits `action_config.status_map` onto page templates. Templates don't read it (engine-side concern), so no change there — the resolver-emitted field is now redundant for display but kept as authoring metadata.
- [Part 18 — actions-on-entity](../../_completed/18-entity-components/design.md) — the component this part rewires.
- [Part 28 — custom action kind](designs/workflows-module/parts/28-custom-action-kind/design.md) — `kind: custom` owns its `link:` authoring per cell; engine renders Nunjucks + substitutes the `{ action_id: true }` sentinel but doesn't compute defaults. Built-in kinds in this part do not author `link:`. Part 28 absorbs this contract when it lands.
- [Part 32 — drop static `interactions.status` override](../../_completed/32-drop-static-overrides/design.md) — narrowed status overrides to the pre-hook channel. Adjacent topic, no shared edits; the engine-renders contract in D14 here is the only piece that touches the same author-facing surface (event templates) and is documented for app authors via Task 15's README updates.
- [`docs/idioms.md` § Event display](../../../../../docs/idioms.md#event-display) — the cross-repo `event_display` idiom this part aligns engine-written events with.
- Reference: an existing app's `WorkflowAPI/` connection — `getStatusConfig.js`, `parseStatusConfig.js`, its sentinel-swap helper, `createAction.js`, `updateAction.js`. Relevant snippets quoted inline in this design where needed.

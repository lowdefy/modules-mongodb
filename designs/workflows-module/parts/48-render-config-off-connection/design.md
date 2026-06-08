# Part 48 — Render config off the connection (per-workflow write endpoints + tracer)

The connection's `workflowsConfig` is loaded and **operator-evaluated whole on every workflow request** (Lowdefy evaluates a connection's properties per call). Two of its action fields are heavy: `status_map` (per-stage × per-app Nunjucks `message`/`link`/`status_title`) and `event_overrides` (per-signal × per-app Nunjucks `display`). In a production app (~100 workflows, both fields typically filled for every action × every app) they dominate the per-request evaluation cost — and every call pays it for all ~100 workflows, almost all irrelevant to that call.

This part moves **`status_map` and `event_overrides` off the connection blob** and onto the **per-workflow write endpoints** that actually use them. The lean structural config (`access`, `kind`, `tracker` linkage, status flow, `action_groups`) **stays on the connection** — it is small, and the engine needs it for any workflow the cascade touches. Each write endpoint carries its own workflow's render config **plus its ancestors'**, derived at build time by tracing a new `tracker.child_type` edge. A single mechanism: it de-bloats the per-request payload **and** unlocks author-customizable tracker-mirror events (`internal_mirror_*` signal overrides), which have no override channel today.

**Layer:** module build wiring (`makeWorkflowApis`) + config builder (`makeWorkflowsConfig`) + connection schema + engine load/render phases. **Size:** L. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Proposed change

1. **`makeWorkflowsConfig` drops `status_map` and `event_overrides` from `ACTION_FIELDS`.** The connection keeps the lean structural slice. The blob shrinks from "all workflows × (structure + render)" to "all workflows × structure".
2. **A new `tracker.child_type` field** (validated in `makeWorkflowsConfig`) declares, on the **parent's** tracker action, the workflow type it tracks. This is the build's trace edge. (Authoring lives with the parent, which already owns `tracker.start_link` to the child's start page — the child stays generic.)
3. **`makeWorkflowApis` emits per-workflow write endpoints** — `{type}-submit`, and (pending the open question below) `{type}-start` / `{type}-cancel` / `{type}-close` — each carrying `render_config`: the workflow's own `status_map`/`event_overrides` **plus every ancestor's**, keyed `workflow_type → action_type → …`. Ancestors are the transitive closure of `child_type` edges walked upward from the workflow.
4. **The engine reads render fields from `params.render_config`, structural fields from the blob.** `loadWorkflowState` (originating load and each cascade level) and `planActionTransition` / `planEventDispatch` look up `status_map`/`event_overrides` in `params.render_config[type]` instead of `actionConfig`. The cascade already runs `loadWorkflowState` per level, and `params` is the originating write's params throughout the invocation, so every ancestor's render config is in scope.
5. **`internal_mirror_*` signals gain an override channel.** With the parent's `event_overrides` now reachable during the child's cascade, `planEventDispatch` looks up `params.render_config[parent_type][trackerAction.type].event_overrides[internal_mirror_child_*]` — so an author can replace the engine-default `"Tracker mirrored child {{ status_after }}"` with e.g. `"{{ ticket }} closed by {{ agent }}"`.

## Key decisions

### D1 — Split by weight (structure vs render), not all-or-nothing

Part 46 D3 keeps the **whole** validated config on the connection, on the grounds that the submit slice is irreducibly the whole workflow — `planSubmit`/`planAutoUnblock`/`planWorkflowRecompute` need every sibling's `blocked_by`/`action_group` plus `action_groups`. That argument is about **structure** and is unchanged here: the structural slice stays on the connection. `status_map` and `event_overrides` are **not** structural — they are consumed only at render time (`planActionTransition` renders `status_map`; `planEventDispatch` renders `event_overrides`), and nothing in the recompute/unblock fixpoint reads them. So they are separable from the irreducible slice, and they are the heavy part. This part pulls exactly those two fields; D3's reasoning is narrowed, not reversed — the blob still validates-once and is looked up per request, just leaner.

### D2 — Render config rides the endpoint; ancestors come along via the trace

The endpoint's static `properties` are evaluated into `params` per call — the same mechanism as `workflowsConfig`, but now bounded to **one workflow's render config plus its ancestors'** instead of all ~100. Because all four write operations cascade to ancestors and render `status_map` along the way (D3), the bundle must be the full ancestor set, transitively. The cascade reads each ancestor's render config from `params.render_config` at the level it already loads — no file reads, no extra endpoint calls, no DB.

**The trace edge.** The parent↔child relationship is set at **runtime** (`parent_workflow_id` when a child starts) and is not in config today; `tracker.start_link` carries only `pageId`/`urlQuery` (`makeWorkflowsConfig.js:230–283`). So neither side declares the other's *type* at build time. `tracker.child_type` adds that single declaration on the parent's tracker action. The build collects `parent_type → child_type` edges, and for each workflow `W` walks them upward to `W`'s ancestor set.

**Cycles / depth.** Tracker cycles are disallowed (a workflow cannot transitively track itself), so the closure needs no cycle guard. Depth is ~1 in practice (a tracker tracking a child); the closure handles deeper chains transitively without special-casing.

**Accepted cost — duplication.** A shared ancestor's render config is copied onto every descendant endpoint. This is the "per endpoint ships all parent workflows" shape, accepted deliberately: it trades build-artifact size (cheap, static, never operator-evaluated) for per-request evaluation cost (the thing that actually hurts). Each *call* still evaluates only its own ancestor set, not all workflows.

### D3 — All four write operations need render config + ancestors (not just submit)

Verified: `SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow` each run `runTrackerCascade` and fire `internal_mirror_child_{active,cancelled,completed}` to parents (`StartWorkflow.js:264`, `CancelWorkflow.js:166`, `CloseWorkflow.js:182`, `handleSubmit.js:67`), and each renders `status_map` via `planActionTransition` reading `actionConfig` from the blob (`StartWorkflow.js:180` seed stage, `CancelWorkflow.js:76`, `CloseWorkflow.js:94`). The cascade's reach within a touched parent is the **whole workflow**, not just its tracker action: `planTrackerLevel` runs `planAutoUnblock`, which calls `planActionTransition` for unblocked **sibling** actions (`planAutoUnblock.js:102`, `actionsConfig.find(c => c.type === candidate.type)`) and renders **their** `status_map`. So the per-endpoint bundle is, per workflow in the ancestor set, **all actions'** `status_map`/`event_overrides` — not a tracker-action subset.

Consequence: to take render config off the blob, **every** write endpoint must carry it. That makes the per-workflow endpoint shape uniform across all four operations — which retires the per-action vs per-workflow vs generic split entirely (this **supersedes parked Part 47**, which only collapsed submit). The one wrinkle — whether Start/Cancel/Close can still be invoked as conveniently as the generic endpoints they replace — is the open question below.

### D4 — `internal_mirror_*` overrides fall out of the same mechanism

`event_overrides` is keyed by triggering **signal**; only the six user signals are authorable today, and `planEventDispatch` renders the `tracker-mirror` event from an engine default with the comment "no override channels exist" (`planEventDispatch.js:43`). The reason was structural, not deliberate: the parent's `event_overrides` (where a mirror override would live) wasn't reachable during the child's cascade, because the cascade reads config from the blob and the mirror event is keyed by an internal signal the author couldn't reach. Once the parent's `event_overrides` rides the child's endpoint (D2), the override is in scope — so this part **adds the internal-signal channel**: `planEventDispatch` for a `tracker-mirror` handler looks up the parent action's `event_overrides[internal_mirror_child_*]` and uses it when present, falling back to the engine default. This resolves the second pending item ("allow internal signal overrides") as a free consequence of the de-bloat, not separate work.

## Current state (verified)

- **Config builder:** `makeWorkflowsConfig.js` `ACTION_FIELDS` (`:7–18`) includes `status_map` (and the action carries `event_overrides`); both are picked per-action per-workflow into the connection blob.
- **Shapes:** `status_map[stage][app] = { message?, link?, status_title? }`; `event_overrides[signal][app] = { display: { title, description }, … }`. Both per-app keyed, both Nunjucks, both heavy when an app fills every cell across stages/signals × apps.
- **Engine reads:** `loadWorkflowState.js:110` finds the workflow in `context.workflowsConfig`; `planActionTransition.js:193` reads `actionConfig.status_map?.[targetStage]` → `renderStatusMap`; `planSubmit.js:200` and `planEventDispatch` read `event_overrides?.[signal]`; `planEventDispatch.js:22/43` renders the `tracker-mirror` default with no override path.
- **Write handlers:** all four compose load → plan → commit → `runTrackerCascade`; all read `actionConfig` from `workflowsConfig` (above).
- **Endpoints today:** submit is per-action (`{type}-{action}-submit`); Start/Cancel/Close are **generic** single endpoints taking `workflow_type` in the payload (`api/start-workflow.yaml` etc., Part 19).
- **Trace edge:** does not exist — `tracker` carries only `start_link` (`makeWorkflowsConfig.js:219–283`).

## Endpoint / config shape

Connection blob (lean — `status_map`/`event_overrides` removed):

```yaml
workflowsConfig:
  - type: onboarding
    actions:
      - { type: kyc-form, kind: form, access: {...}, blocked_by: [...], action_group: g1 }
    action_groups: [...]
```

Per-workflow write endpoint (`render_config` keyed `workflow_type → action_type`, own + ancestors):

```yaml
id: onboarding-submit
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId: workflow-api
    properties:
      # ...payload passthroughs...
      render_config:
        onboarding:                       # own
          kyc-form:
            status_map: { action-required: { team-app: { message: ... } } }
            event_overrides: { submit: { team-app: { display: ... } } }
        onboarding-tracker:               # ancestor (traced via child_type)
          install-tracker:
            event_overrides:
              internal_mirror_child_completed:
                team-app: { display: { title: "{{ ticket }} closed by {{ agent }}" } }
```

New schema field (validated in `makeWorkflowsConfig`):

```yaml
- kind: tracker
  type: install-tracker
  tracker:
    child_type: device-installation   # the trace edge (parent declares the child type)
    start_link: { pageId: ..., urlQuery: ... }
```

## Open question — OQ1: generic ease-of-use for Start/Cancel/Close

Part 19 made `start-workflow` (and cancel/close) **generic** single endpoints taking `workflow_type` in the payload precisely so a generic caller — e.g. an entity-creation flow that may start any of several workflow types — hits one fixed endpoint and passes the type as data. D3 forces these to become per-workflow (`{type}-start`, …) to carry render config, which means generic callers must construct the endpoint id from `workflow_type` at runtime (`_module.endpointId` + `_string.concat`, the pattern Part 40's simple surface already uses for submit).

**The question to investigate before tasking:** is runtime endpoint-id construction acceptable for every Start/Cancel/Close caller, or do some callers genuinely not know `workflow_type` until runtime in a way that makes a generic endpoint materially easier? Consequences to map: (a) every current `start-workflow`/`cancel-workflow`/`close-workflow` call site and whether each has `workflow_type` available at the call; (b) whether a hybrid is warranted — keep a thin **generic** Start/Cancel/Close endpoint that does *not* carry render config and is used only when the operation provably needs none (e.g. a start whose seed stage has no `status_map` and whose `internal_mirror_child_active` has no override), routing the rest through per-workflow endpoints; (c) the cost of that hybrid (two endpoint shapes for the same operation — a "one correct way" violation) vs. the convenience it preserves. Resolve this with the call-site audit, not by guessing.

## Non-goals

- **Moving structural config off the connection** (D1 — stays; D3-of-Part-46 reasoning holds for structure).
- **Dynamic / DB-stored / versioned config or a CMS** — the long-term home for cross-workflow config without tracing (Part 46 D7). This part is the file-free, build-time bridge; the engine's `params.render_config` lookup is the seam a future store swaps behind.
- **Reading arbitrary JSON files at runtime** — explicitly avoided; render config rides endpoint `params` via the existing operator-evaluation mechanism, not a file reader.
- **Client-side config** — Part 46's territory.

## Related

- [Part 46 — Debundle workflow config](../46-debundle-workflow-config/design.md) — D1 here narrows its D3 (structure stays, render leaves); D7 there is the dynamic-config future this bridges toward.
- [Part 47 — Per-workflow submit endpoints](../_rejected/47-per-workflow-submit-endpoints/design.md) — **superseded** (parked): this part makes all four write endpoints per-workflow, subsuming the submit-only collapse.
- [Part 44 — Tracker start_link](../_completed/44-tracker-start-link/design.md) — the `tracker:` block this adds `child_type` to.
- [Part 19 — Operational APIs](../_completed/19-operational-apis/design.md) — the generic `start/cancel/close-workflow` endpoints OQ1 weighs against.
- [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) — the load → plan → commit → cascade shape and `planActionTransition`/`planEventDispatch`/`planAutoUnblock` this re-points to `params.render_config`.

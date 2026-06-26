# Part 48 — Render config off the connection (per-workflow write endpoints + tracer)

The connection's `workflowsConfig` is loaded and **operator-evaluated whole on every workflow request** (Lowdefy evaluates a connection's properties per call). Its one heavy action field is `status_map` (per-stage × per-app Nunjucks `message`/`link`/`status_title`). In a production app (~100 workflows, `status_map` typically filled for every action × every app) it dominates the per-request evaluation cost — and every call pays it for all ~100 workflows, almost all irrelevant to that call. (`event_overrides` is **not** on the blob: it already rides the per-action submit endpoint via `makeWorkflowApis.emitEventOverrides`, carrying only that one action's overrides — so it is already lean and is not a de-bloat target.)

This part introduces **per-workflow write endpoints** that carry a `render_config` bundle, and uses that one delivery vehicle for two distinct mechanisms:

1. **De-bloat** — move `status_map` **off the connection blob** onto the endpoint that actually uses it. The lean structural config (`access`, `kind`, `tracker` linkage, status flow, `action_groups`) **stays on the connection** — it is small, and the engine needs it for any workflow the cascade touches. This is the per-request cost story.
2. **Reach extension** — open override channels that don't exist today, on two events with no authoring path: the **tracker-mirror signals** (`internal_mirror_*`, D4) and the **lifecycle events** themselves (`workflow-started`/`-cancelled`/`-closed`, D8). This is net-new capability, not a de-bloat: neither was ever on the blob, and `event_overrides` reached only the submit endpoint. The two channels differ in authoring scope — tracker-mirror overrides are per-action (on the parent's tracker action, D4); lifecycle overrides are per-workflow (a workflow-level `event` map, D8, since a lifecycle event belongs to no single action). Start/Cancel/Close also gain `status_map`/render-config **delivery** for the stages they render (the de-bloat in item 1 applies to them too).

Each write endpoint carries its own workflow's render config **plus its ancestors'**, derived at build time by tracing the **`tracker.child_workflow_type`** edge — the field that today is named `tracker.workflow_type` (an existing, live, type-declaring field), renamed here for clarity and disambiguation (see D2 for the trace, D6 for the rename).

**Layer:** module build wiring (`makeWorkflowApis`) + config builder (`makeWorkflowsConfig`) + connection schema + engine load/render phases, plus a small cross-codebase rename (`tracker.workflow_type` → `tracker.child_workflow_type`; see D6). **Size:** L. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Proposed change

1. **`makeWorkflowsConfig` drops `status_map` from `ACTION_FIELDS`.** (`event_overrides` was never in `ACTION_FIELDS` — it already rides the submit endpoint, so there is nothing to drop there.) The connection keeps the lean structural slice. The blob shrinks from "all workflows × (structure + render)" to "all workflows × structure".
2. **The `tracker.child_workflow_type` field is the build's trace edge.** This field already exists and is live — it is `tracker.workflow_type` today (declared on the parent's tracker action, written onto the tracker doc by `planActionTransition`, and read by `StartWorkflow` to validate a child start). This part **renames it** `tracker.workflow_type` → `tracker.child_workflow_type` across the codebase, **adds build-time validation** for it in `makeWorkflowsConfig` (today it is picked into the blob via `ACTION_FIELDS` but never validated), and **uses it as the trace edge** — see **D6** for the rename rationale and full scope. (Authoring lives with the parent, which already owns `tracker.start_link` to the child's start page — the child stays generic.)
3. **`makeWorkflowApis` emits per-workflow write endpoints** — `{type}-submit`, `{type}-start`, `{type}-cancel`, `{type}-close` (the generic Part 19 endpoints are retired — D5) — each carrying `render_config`: the workflow's own `status_map`/`event_overrides` **plus every ancestor's**, keyed `workflow_type → action_type → …`. Ancestors are the transitive closure of `child_workflow_type` edges walked upward from the workflow.

   The `{type}-submit` endpoint additionally carries a **`hooks`** property — but **not** under `render_config`. Hooks are build-resolved endpoint refs (signal → phase → pre-scoped id), not Nunjucks display config, so they ride a sibling property keyed by action type: `hooks: { {action_type}: { {signal}: { pre, post } } }` (D7). On the old per-action endpoint a flat signal-keyed `hooks` map was unambiguous because the endpoint was scoped to one action; on the per-workflow endpoint a flat map collides across actions, so it must be keyed by action type. `handleSubmit` re-slices it by the loaded action's type — `params.hooks = params.hooks?.[targetAction.type]` — **after** `loadWorkflowState` resolves `targetAction` and **before** any phase runs, so the hook consumers (`invokePreHook`/`invokePostHook`, which read `params.hooks?.[signal]?.{pre|post}` — `invokePreHook.js:82`, `invokePostHook.js:43`) see exactly today's signal-keyed shape, untouched. This is Part 47's engine change, verbatim. Hooks ride only `{type}-submit` (start/cancel/close have no user-action hooks). Two `makeWorkflowApis` invariants carry over: a workflow whose actions are **all** `kind: tracker` emits no submit endpoint (`makeWorkflowApis.js:117–118` skips trackers), and the Part 34 D10 `workflow` reserved-type guard (`makeWorkflowApis.js:109–112`) now also protects the new `{type}-start/cancel/close` ids.

4. **The engine merges the render slice onto the action config at load; structural fields stay read off the blob.** The planners are pure (no `params`/`context` access) and must stay that way — re-plumbing `params` through `planActionTransition` + `planAutoUnblock` + `planTrackerLevel` + `planSubmit` would reverse Part 38's design. Instead, `loadWorkflowState` — which already has `context` (hence `context.params.render_config`) and resolves `workflowConfig` from the blob — splices the whole render slice (`status_map` **and** `event_overrides`) from `params.render_config[workflow_type][actionType]` onto **every action** in `workflowConfig.actions` before returning. Not just the resolved `targetAction`: `planAutoUnblock` renders unblocked **siblings'** `status_map` (D3), so each sibling needs its render slice too. This is the **one seam** for all render config — `status_map` and `event_overrides` both arrive via the endpoint, get merged at load, and are read off `actionConfig` downstream. This runs on the originating load **and each cascade level** (same function); `params` is the originating write's params throughout the invocation, so every ancestor's render config is in scope at the level that loads it.

   **Missing-key contract.** A missing `render_config[workflow_type]` or `[action_type]` is **legal** and means engine-default rendering — never a throw. The downstream reads are already optional-chained (`actionConfig.status_map?.[stage]`, `event_overrides?.[signal]`), so an absent slice falls through to the sticky-`status_map`/default-event-display behaviour of today. This is load-bearing: a runtime parent chain can outlive a config edge (retarget or remove a tracker's `child_workflow_type` and an existing child still cascades to a parent whose type is now absent from `params.render_config` — D6 validates edges, not live instances; same window as D6's stale-doc note). **The splice is an idempotent in-place merge.** `loadWorkflowState` returns the `workflowConfig` instance it `.find`s in `context.workflowsConfig` (`:110`, no clone), so the merge mutates that object — safe because `context.workflowsConfig` is freshly operator-evaluated per connection call (never shared across requests) and idempotent because CAS retries re-load the **same** object (`runTrackerCascade.js:93–110`) while `params.render_config` is constant for the invocation, so re-splicing writes identical values.

   Downstream reads off the merged `actionConfig`:
   - `planActionTransition.js:195` keeps reading `actionConfig.status_map` — unchanged.
   - `planSubmit` reads `actionConfig.event_overrides[signal]` instead of today's `params.event_overrides[signal]` — its override source moves onto the seam so `event_overrides` has exactly one path, not two.
   - `planTrackerLevel` reads the parent tracker action's `actionConfig.event_overrides[internal_mirror_child_*]` and passes it to `planEventDispatch` (D4).

5. **`internal_mirror_*` signals gain an override channel.** With the parent's `event_overrides` merged onto its tracker `actionConfig` during the child's cascade (item 4), `planTrackerLevel` reads `actionConfig.event_overrides[internal_mirror_child_*]` and passes it to `planEventDispatch`, whose `if (isSubmit)` merge gate is generalized to fire whenever an override slice is present (D4 — the same gate change item 6 relies on). An author can then replace the engine-default `"Tracker mirrored child {{ status_after }}"` with e.g. `"{{ ticket }} closed by {{ agent }}"`.

6. **Lifecycle events (`workflow-started`/`-cancelled`/`-closed`) gain an override channel.** Authored as a **workflow-level** `event` map keyed by lifecycle signal (`started`/`cancelled`/`closed`) → app → `{ display }` — a lifecycle event belongs to no single action, so it can't ride the per-action seam (item 4). Each `{type}-start/cancel/close` endpoint carries a sibling `lifecycle_event_override` property = that workflow's `event[<the-one-signal-it-fires>]` slice (own workflow only — lifecycle events never cascade). The Start/Cancel/Close handlers pass `params.lifecycle_event_override` into `planEventDispatch` as `yamlEventOverrides` (they call it with no override arg today — `StartWorkflow.js:205`, `CancelWorkflow.js:117`, `CloseWorkflow.js:133`); the generalized merge gate (item 5) then applies it. Override templates render against `{ user, workflow, signal }` only — no `action`/`status_after`. See **D8**.

## Key decisions

### D1 — Split by weight (structure vs render), not all-or-nothing

Part 46 D3 keeps the **whole** validated config on the connection, on the grounds that the submit slice is irreducibly the whole workflow — `planSubmit`/`planAutoUnblock`/`planWorkflowRecompute` need every sibling's `blocked_by`/`action_group` plus `action_groups`. That argument is about **structure** and is unchanged here: the structural slice stays on the connection. `status_map` is **not** structural — off the blob it is read only at render time (`planActionTransition` renders `status_map`), and nothing in the recompute/unblock fixpoint reads it. So it is separable from the irreducible slice, and it is the heavy part. This part pulls exactly that one blob field; D3's reasoning is narrowed, not reversed — the blob still validates-once and is looked up per request, just leaner.

(`status_map` has a second consumer, `makeActionPages.js:19`, which lifts it into each client action-page template. That consumer reads the **raw workflow YAML** (`vars.workflows`), not the connection blob, so this blob-only change does not affect it. The separability claim is therefore scoped to "not read by the recompute/unblock fixpoint off the blob," not "consumed only at render time anywhere.")

### D2 — Render config rides the endpoint; ancestors come along via the trace

The endpoint's static `properties` are evaluated into `params` per call — the same mechanism as `workflowsConfig`, but now bounded to **one workflow's render config plus its ancestors'** instead of all ~100. Because all four write operations cascade to ancestors and render `status_map` along the way (D3), the bundle must be the full ancestor set, transitively. The cascade merges each ancestor's render config from `params.render_config` onto that level's action config as it loads (the merge-at-load seam, item 4) — no file reads, no extra endpoint calls, no DB.

**The trace edge.** Two distinct things must not be conflated. The parent↔child _instance link_ — `parent_workflow_id` / `parent_action_id` on the child workflow doc — is set at **runtime** when a child starts, and is genuinely not in config. But the parent↔child _type edge_ — "this tracker tracks workflow type X" — **already exists in config today**, as `tracker.workflow_type` on the parent's tracker action: the demo declares `tracker: { workflow_type: company-setup }`, `planActionTransition.js:186` denormalizes it onto the tracker doc, and `StartWorkflow.js:143` reads it back to validate that a started child matches (`parent.tracker?.workflow_type === params.workflow_type`). (`tracker.start_link` is the _other_ tracker field — `makeWorkflowsConfig.js:229–289` validates only `start_link`, which is what earlier framing mistook for "the tracker block carries only start_link"; the block also carries the unvalidated `workflow_type`.)

So no new declaration is needed — only the build-time _collection_ of these edges is new. This part renames the field `tracker.child_workflow_type` (D6) and walks it: the build collects `parent_type → child_workflow_type` edges, and for each workflow `W` walks them upward to `W`'s ancestor set. The rename is the only schema change; the edge data was authored all along.

**Cycles / depth.** Tracker cycles (a workflow transitively tracking itself) are disallowed and **the build enforces it**: `makeWorkflowsConfig` walks the collected `parent_type → child_workflow_type` edges once and hard-errors on any cycle (D6). With acyclicity guaranteed at build time, the ancestor closure legitimately needs no runtime cycle guard. (The runtime cascade still carries its own `MAX_DEPTH = 10` backstop — `runTrackerCascade.js:8–11` — because the instance parent-chain is set at runtime and could in principle diverge from current config; that guard is unrelated to this build-time closure.) Depth is ~1 in practice (a tracker tracking a child); the closure handles deeper chains transitively without special-casing.

**Accepted cost — duplication.** A shared ancestor's render config is copied onto every descendant endpoint. This is the "per endpoint ships all parent workflows" shape, accepted deliberately: it trades build-artifact size (cheap, static, never operator-evaluated) for per-request evaluation cost (the thing that actually hurts). Each _call_ still evaluates only its own ancestor set, not all workflows.

### D3 — All four write operations need render config + ancestors (not just submit)

Verified: `SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow` each run `runTrackerCascade` and fire `internal_mirror_child_{active,cancelled,completed}` to parents (`StartWorkflow.js:264`, `CancelWorkflow.js:166`, `CloseWorkflow.js:182`, `handleSubmit.js:67`), and each renders `status_map` via `planActionTransition` reading `actionConfig` from the blob (`StartWorkflow.js:180` seed stage, `CancelWorkflow.js:76`, `CloseWorkflow.js:94`). The cascade's reach within a touched parent is the **whole workflow**, not just its tracker action: `planTrackerLevel` runs `planAutoUnblock`, which calls `planActionTransition` for unblocked **sibling** actions (`planAutoUnblock.js:102`, `actionsConfig.find(c => c.type === candidate.type)`) and renders **their** `status_map`. So the per-endpoint bundle is, per workflow in the ancestor set, **all actions'** `status_map`/`event_overrides` — not a tracker-action subset.

Consequence: to take render config off the blob, **every** write endpoint must carry it. That makes the per-workflow endpoint shape uniform across all four operations — which retires the per-action vs per-workflow vs generic split entirely (this **supersedes parked Part 47**, which only collapsed submit). The one wrinkle — whether Start/Cancel/Close can still be invoked as conveniently as the generic endpoints they replace — is taken up, and accepted as a deliberate regression, in D5 below.

### D4 — `internal_mirror_*` overrides ride the same seam (two concrete changes)

`event_overrides` is keyed by triggering **signal**; only the six user signals are authorable today, and `planEventDispatch` renders the `tracker-mirror` event from an engine default with the comment "no override channels exist" (`planEventDispatch.js:43`). The reason was structural, not deliberate: today `event_overrides` reaches only the submit path (`planSubmit` reads `params.event_overrides` and passes it into `planEventDispatch`), so the parent's `event_overrides` — where a mirror override would live — was never in scope during the child's cascade. Once `event_overrides` rides the per-workflow endpoint and is merged onto each action config at load (item 4), the parent's tracker `actionConfig` carries its `event_overrides` at every cascade level, so the override is in scope.

This is a **new capability**, not a by-product of the de-bloat (`event_overrides` was never on the blob — see Current state). Closing the gap needs **two concrete changes**, both of which are easy to miss behind "looks up … and uses it when present":

1. **Thread the override into the mirror dispatch.** `planTrackerLevel` already resolves the parent tracker `actionConfig` (`planTrackerLevel.js:80–82`) but calls `planEventDispatch` with **no override argument** (`:140–151`). It must read `actionConfig.event_overrides[internal_mirror_child_*]` (now present via the item-4 merge) and pass it to `planEventDispatch` as the override slice.
2. **Generalize the merge gate.** `planEventDispatch` applies overrides only under `if (isSubmit)` (`planEventDispatch.js:197`); on the `tracker-mirror` path `mergedPayload` stays the engine default. Rather than special-case the `tracker-mirror` path, generalize the gate to fire whenever an override slice is actually present (`if (yamlEventOverrides || preHookEventOverrides)`) — submit, tracker-mirror (here) and lifecycle (D8) then all merge through one gate. Absent any override it falls through to today's engine default for every path.

With both in place, an author can replace the engine default; absent an override the gate falls through to the same default as today. This closes the long-standing "allow internal signal overrides" gap. (The gate generalization is shared with D8 — one change serves both reach extensions.)

### D5 — Per-workflow Start/Cancel/Close, no generic endpoint, no hybrid

Part 19 made `start-workflow` (and cancel/close) **generic** single endpoints taking `workflow_type` in the payload, so a caller that may start one of several types hits one fixed endpoint and passes the type as data. D3 requires all four write operations to carry render config; this decision retires the generic endpoints and makes Start/Cancel/Close per-workflow (`{type}-start`, `{type}-cancel`, `{type}-close`), uniform with submit.

**Why a generic endpoint can't survive — the delivery mechanism, not the call sites.** A generic endpoint doesn't know its `workflow_type` until runtime, so its static `render_config` property could only ever be one of two things: **all ~100 workflows' render config** (the exact per-request blob bloat this part exists to remove, merely relocated to the endpoint) or **none**. But Start genuinely needs render config — it renders the seed-stage `status_map` (`StartWorkflow.js:180`) and fires `internal_mirror_child_active` to its parent (`:239`), where a mirror override applies. So a generic endpoint is _architecturally_ incompatible with bounded render config, independent of whether any runtime-typed caller exists. (This is decided on the API's merits, not a demo call-site audit — see CLAUDE.md "The demo is not a usage census.")

**Dynamic-dispatch callers are real and are served.** The "one button starts one of several workflow types" pattern is legitimate and common — a category selector → matching workflow, a polymorphic entity whose `product`/`segment` field picks the type, data-driven dispatch from a mapping collection, intake triage/routing, or a "restart" button reading a record's `workflow_type`. None of these are blocked: the endpoint id is **deterministic** (`{type}-start`), so a caller that has the type _as a value_ builds the id at runtime with `_string.concat` / `_nunjucks`, or `_switch` over a known set. In every such case the caller holds the type at call time, which is all id-construction needs.

**Intent — an agreed, justified ergonomic regression.** This is a deliberate, accepted step back: a caller that previously hit one fixed endpoint and passed the type as data now constructs the endpoint id from the type. We accept it to keep the code simpler and uniform (one endpoint shape per operation, render config delivered the same way everywhere — "one correct way"). A hybrid (a thin generic endpoint carrying no render config, used only when an operation provably needs none) is explicitly rejected: it would mean two endpoint shapes for one operation, and the "needs no render config" safe case is narrow and fragile (Start almost always needs it). The only design that preserves a single _dynamic_ endpoint is one that reads each workflow's config dynamically at runtime — which requires either DB-stored/CMS config or an independent build step that materializes per-workflow configs. Both are out of scope here (Part 46 D7's dynamic-config future); this part is the file-free, build-time bridge.

### D6 — Rename `tracker.workflow_type` → `tracker.child_workflow_type` (the trace edge already exists)

The build's ancestor trace needs a parent→child _type edge_. The first framing of this part assumed that edge did not exist and proposed a new `tracker.child_type` field. **It already exists** — `tracker.workflow_type`, on the parent's tracker action — and is live and tested: the demo declares `tracker: { workflow_type: company-setup }`; `planActionTransition.js:181–191` denormalizes it onto the persisted tracker doc (`doc.tracker = { workflow_type, …start_link }`); `StartWorkflow.js:143` reads it back to gate a child start (`parent.tracker?.workflow_type === params.workflow_type`, covered by `StartWorkflow.test.js:76,433`); `types.js:59` types the block as `{ workflow_type, start_link? } | null`. So no new field is introduced — the edge datum was authored all along; only the build-time _collection_ of edges is new.

**Why rename rather than reuse `workflow_type` as-is.** The name collides in meaning. An action doc already carries a **top-level** `workflow_type` — the action's _own_ workflow — set by the same planner (`planActionTransition.js:182`, `doc.workflow_type = loadedWorkflow.workflow_type`). So a tracker action doc ends up with two `workflow_type`s meaning different things: its own (top-level) and the tracked child's (under `tracker`). `child_workflow_type` removes the ambiguity and joins the existing tracked-child vocabulary on the doc — `child_workflow_id`, `child_entity_id`, `child_entity_collection` (`types.js:60–62`, set by `StartWorkflow`'s mirror fire). This is a "one correct way" naming fix taken now, while the module is pre-release and the field has no production consumers outside this repo.

**Scope of the rename (one task).** Mechanical, repo-wide:

- **Authoring/config:** demo `tracker.workflow_type:` keys → `child_workflow_type:`.
- **Build:** `makeWorkflowsConfig` — add validation (a `kind: tracker` action must declare a non-empty `child_workflow_type` string that resolves to a declared workflow type; the closure silently drops unresolved edges otherwise), an **acyclicity check** (walk the collected `parent_type → child_workflow_type` edges once and hard-error on any cycle, naming the cycle path — turns D2's "cycles disallowed" assumption into an enforced invariant so the ancestor closure needs no guard), **and** a legacy-key guard: `tracker.workflow_type` hard-errors with a rename hint, matching the builder's existing legacy-shape errors (e.g. `hooks.{signal}.{phase}` string form, `on_complete` string form).
- **Engine reads/writes:** `planActionTransition.js:186` (read + the `doc.tracker` denormalization shape) and `StartWorkflow.js:143` (the child-start gate) → `child_workflow_type`.
- **Type contract:** `types.js:59` tracker shape → `{ child_workflow_type, start_link? } | null`.
- **Tests:** fixtures that set `tracker: { workflow_type: … }` → `child_workflow_type`.

**Persisted-doc note.** The renamed key is denormalized onto tracker action docs (`doc.tracker.child_workflow_type`). `planActionTransition` rewrites `doc.tracker` on every plan, so docs self-heal on their next transition; the only window is a tracker action created before the rename and not yet re-planned, whose `StartWorkflow` gate would read `undefined`. Pre-release, with no external data, this needs no migration — but the legacy-key build guard makes a stale _config_ fail loudly rather than silently miss the edge.

### D7 — `hooks` ride the submit endpoint as a sibling property, not `render_config`

The per-action submit endpoint carries two build-time properties: `event_overrides` and **`hooks`** — a signal → phase → pre-scoped-endpoint-ref map (`makeWorkflowApis.js:18–40`, attached `:67`), read at runtime as `params.hooks?.[params.signal]?.{pre|post}` (`invokePreHook.js:82`, `invokePostHook.js:43`). Collapsing submit to one per-workflow endpoint (D3) breaks the flat shape: it was unambiguous only because the endpoint was scoped to one action, so on a per-workflow endpoint two actions with a hook on the same signal collide and the wrong action's hook fires.

Hooks do **not** ride `render_config`, and they do **not** ride the merge-at-load seam (item 4) that now delivers `event_overrides`. Two reasons:

- **Different kind of payload.** Hooks are build-resolved endpoint refs consumed off `params` by the pre/post hook phases — not Nunjucks display config read off `actionConfig`. Routing them through the render seam would mean changing the hook consumers to read off `actionConfig` and conflating two unrelated concepts.
- **The "one path, not two" argument that moved `event_overrides` to the seam doesn't apply.** `event_overrides` moved there because it must reach both the submit path **and** the tracker-mirror path (D4); a single seam gives it one delivery path. Hooks only ever apply to submit — there is no second reach to unify — so keeping them on `params`, re-sliced, introduces no second path.

So `hooks` becomes a sibling property keyed by action type (`hooks: { {action_type}: { {signal}: { pre, post } } }`), and `handleSubmit` re-slices `params.hooks = params.hooks?.[targetAction.type]` after `loadWorkflowState` resolves the target and before any phase runs (item 3). After the re-slice the consumers see today's signal-keyed shape unchanged — the re-slice is the entire engine change. This is Part 47's hooks treatment, carried over verbatim.

### D8 — Lifecycle events get a per-workflow override channel

The lifecycle events (`workflow-started`/`-cancelled`/`-closed`) render engine defaults with no override channel — `planEventDispatch`'s header comment names this alongside tracker-mirror ("no override channels exist for them"). D4 opens the tracker-mirror channel; D8 opens the lifecycle one. Both are net-new capability (neither was ever on the blob).

A lifecycle event differs from an action event in a way that dictates its authoring home: it has **no target action** (`isActionEvent = false`; the render context is `{ user, workflow, signal }` with no `action` — `planEventDispatch.js`). So a per-action `event_overrides` slice has nowhere to attach, and the item-4 merge-at-load seam (which hangs render config on `actionConfig`) can't carry it. The override must therefore be authored and delivered at **workflow scope**.

- **Authoring.** A workflow-level `event` map keyed by lifecycle signal (`started`/`cancelled`/`closed`) → app → `{ display: { title, description? } }` — the per-action `action.event` shape, one scope up. Validated in `makeWorkflowsConfig` against the three known lifecycle signals.
- **Delivery.** Each `{type}-start/cancel/close` endpoint carries a sibling `lifecycle_event_override` property (not under `render_config`, same reason as `hooks` in D7) = that workflow's `event[<the one signal that endpoint fires>]` slice. **Own workflow only, no ancestor closure** — a lifecycle event fires exactly once, at the originating handler, for the originating workflow; it never fires during the tracker cascade (the cascade fires `tracker-mirror`, D4). This makes lifecycle delivery strictly simpler than `render_config`'s ancestor bundle.
- **Engine.** `StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` each fire exactly one lifecycle signal and today call `planEventDispatch` with no override arg (`StartWorkflow.js:205`, `CancelWorkflow.js:117`, `CloseWorkflow.js:133`). Each passes `params.lifecycle_event_override` as `yamlEventOverrides`; the generalized merge gate (D4) applies it. No pre-hook layer exists for lifecycle, so `preHookEventOverrides` stays undefined and the merge is default → YAML-override only.
- **Constraint.** Override templates render against `{ user, workflow, signal }` only — they cannot reference `action`/`status_after`/`submitted_form` (there is no target action). This is the authoring contract for lifecycle overrides.

This is a deliberate new surface (a workflow-level `event` map). It is justified by a concrete need — authors want to customise the workflow-level audit line ("Onboarding kicked off for X"), not just the per-action lines — and reuses the same gate change D4 already makes, so the engine cost is one shared generalization plus the per-handler override pass-through.

## Current state (verified)

- **Config builder:** `makeWorkflowsConfig.js` `ACTION_FIELDS` (`:7–18`) includes `status_map` but **not** `event_overrides`; only `status_map` is picked per-action per-workflow into the connection blob.
- **`event_overrides` is already off the blob:** it is emitted onto the **per-action submit endpoint** by `makeWorkflowApis.emitEventOverrides` (`:42`, attached `:68` as `event_overrides: eventMap`) and read back at runtime from `params.event_overrides` (`planSubmit.js:200`). It never appears in `makeWorkflowsConfig.js` and is never read off `context.workflowsConfig`/`actionConfig`. So it carries only one action's overrides — already lean, nothing to de-bloat — but it reaches **only** the submit endpoint today (the gap this part's reach extension closes).
- **`hooks` is the submit endpoint's other per-action property:** emitted by `makeWorkflowApis.emitHooks` (`:18–40`, attached `:67`) as a signal → phase → pre-scoped-endpoint-ref map, read at runtime as `params.hooks?.[params.signal]?.{pre|post}` (`invokePreHook.js:82`, `invokePostHook.js:43`). Flat (signal-keyed) today because the endpoint is per-action — the collapse re-keys it by action type (D7).
- **Shapes:** `status_map[stage][app] = { message?, link?, status_title? }`; `event_overrides[signal][app] = { display: { title, description }, … }`. Both per-app keyed, both Nunjucks; `status_map` is the one that is heavy _on the blob_ because the blob carries it for all ~100 workflows.
- **Engine reads:** `loadWorkflowState.js:110` finds the workflow in `context.workflowsConfig`; `planActionTransition.js:195` reads `actionConfig.status_map?.[targetStage]` → `renderStatusMap`; `planSubmit.js:200` reads `params.event_overrides?.[signal]` and passes it into `planEventDispatch`; `planEventDispatch.js:22/43` renders the `tracker-mirror` **and** lifecycle (`workflow-started`/`-cancelled`/`-closed`) defaults with no override path — the `if (isSubmit)` merge gate (`:197`) fires for submit only. The lifecycle handlers call `planEventDispatch` with no override arg (`StartWorkflow.js:205`, `CancelWorkflow.js:117`, `CloseWorkflow.js:133`), and there is no workflow-level `event` authoring field today.
- **Write handlers:** all four compose load → plan → commit → `runTrackerCascade`; all read `actionConfig` from `workflowsConfig` (above).
- **Endpoints today:** submit is per-action (`{type}-{action}-submit`); Start/Cancel/Close are **generic** single endpoints taking `workflow_type` in the payload (`api/start-workflow.yaml` etc., Part 19).
- **Trace edge:** **already authored** as `tracker.workflow_type` (renamed `child_workflow_type` by this part). The `tracker` block carries both `workflow_type` (the tracked child type) and `start_link`; `makeWorkflowsConfig` picks the whole block via `ACTION_FIELDS` but `validateTrackerStartLink` (`:229–289`) validates only `start_link`, leaving `workflow_type` unvalidated. Live consumers: `planActionTransition.js:181–191` writes `doc.tracker = { workflow_type, …start_link }` onto the tracker doc; `StartWorkflow.js:143` reads `parent.tracker?.workflow_type` to gate the child start (tested — `StartWorkflow.test.js:76,433`); `types.js:59` documents the shape as `{ workflow_type: string, start_link?: {…} } | null`. What is missing today is only the build-time _collection_ of `parent_type → child` edges, not the edge datum itself.

## Endpoint / config shape

Connection blob (lean — `status_map`/`event_overrides` removed):

```yaml
workflowsConfig:
  - type: onboarding
    actions:
      - {
          type: kyc-form,
          kind: form,
          access: { ... },
          blocked_by: [...],
          action_group: g1,
        }
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
        onboarding: # own
          kyc-form:
            status_map: { action-required: { team-app: { message: ... } } }
            event_overrides: { submit: { team-app: { display: ... } } }
        onboarding-tracker: # ancestor (traced via child_workflow_type)
          install-tracker:
            event_overrides:
              internal_mirror_child_completed:
                team-app:
                  { display: { title: "{{ ticket }} closed by {{ agent }}" } }
      hooks: # sibling to render_config (D7) — keyed by action type, re-sliced in handleSubmit
        kyc-form:
          submit: { pre: <pre-hook-id>, post: <post-hook-id> }
```

(`hooks` is on `{type}-submit` only. The `{type}-start/cancel/close` endpoints carry `render_config` but no `hooks`; each also carries a `lifecycle_event_override` sibling — D8 — for the one lifecycle signal it fires:)

```yaml
id: onboarding-start
type: Api
routine:
  - id: start
    type: StartWorkflow
    connectionId: workflow-api
    properties:
      # ...payload passthroughs...
      render_config: { onboarding: { ... } } # own + ancestors, as above
      lifecycle_event_override: # workflow-level (D8); the `started` slice only
        team-app:
          {
            display:
              { title: "Onboarding kicked off for {{ workflow.entity_id }}" },
          }
```

Workflow-level `event` authoring (D8) — sits on the workflow, not an action:

```yaml
workflow:
  type: onboarding
  event:
    started:
      {
        team-app:
          {
            display:
              { title: "Onboarding kicked off for {{ workflow.entity_id }}" },
          },
      }
    cancelled: { team-app: { display: { title: "..." } } }
    closed: { team-app: { display: { title: "..." } } }
```

Renamed + newly-validated schema field (`makeWorkflowsConfig`). The field is `tracker.workflow_type` today; this part renames it and adds validation:

```yaml
- kind: tracker
  type: install-tracker
  tracker:
    child_workflow_type: device-installation # the trace edge — was `workflow_type`
    start_link: { pageId: ..., urlQuery: ... }
```

Validation (new in `makeWorkflowsConfig`): every `kind: tracker` action must declare a non-empty `child_workflow_type` string, and it must resolve to a declared workflow type — otherwise the ancestor closure silently drops the edge. The collected `parent_type → child_workflow_type` edge set is walked once and hard-errors on any cycle (naming the path), so the closure is guaranteed acyclic. (The legacy key `tracker.workflow_type` should hard-error with a rename hint, matching the existing legacy-shape errors in this builder.)

## Call sites and sequencing

This part changes **every** write-endpoint id: per-action `{type}-{action}-submit` → per-workflow `{type}-submit`, and the generic `start-workflow`/`cancel-workflow`/`close-workflow` → per-workflow `{type}-start/cancel/close` (D5). Every client that hits a write endpoint must re-point. Known call sites:

| Caller                                                                                                                                                                          | Today                                                        | Re-point / owner                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form-page templates (`templates/{edit,review,error,view}.yaml.njk`, e.g. `edit.yaml.njk:252`) and legacy simple pages (`pages/workflow-action-{edit,review}.yaml`, e.g. `:202`) | stale legacy `update-action-{type}` ids (pre-Part-38 rename) | Parts 39/40 own the submit buttons — coordinate so they re-point **once**, to `{type}-submit` (templates have `workflow_type` in vars; the simple surface builds it from `workflow.workflow_type` at runtime) |
| `apps/demo/api/leads-create.yaml:48` (`onboarding`), `apps/demo/modules/companies/vars.yaml:34` (`company-setup`)                                                               | generic `start-workflow`, static `workflow_type`             | re-point to `{type}-start` (`onboarding-start`, `company-setup-start`) — known at author time                                                                                                                 |
| Generic `cancel-workflow` / `close-workflow`                                                                                                                                    | no in-repo callers (grep)                                    | none here, but **breaking for downstream consumer apps** that call the generic ids — D5's accepted ergonomic regression; flag in release notes                                                                |
| Module manifest `module.lowdefy.yaml:142–144`                                                                                                                                   | `_ref`s `api/{start,cancel,close}-workflow.yaml`             | remove the three `_ref`s and delete the api files; the per-workflow endpoints now come out of the `makeWorkflowApis` resolver instead                                                                         |

**Sequencing:** this part should land **before or with** the Parts 39/40 submit-button rework so the submit id changes once. If 39/40 land first against `{type}-{action}-submit`, this part re-points them — acceptable, just double churn. (Part 39 is `_completed`; Part 40 is active — coordinate the re-point target with it.)

## Non-goals

- **Moving structural config off the connection** (D1 — stays; D3-of-Part-46 reasoning holds for structure).
- **Dynamic / DB-stored / versioned config or a CMS** — the long-term home for cross-workflow config without tracing (Part 46 D7). This part is the file-free, build-time bridge; the engine's `params.render_config` lookup is the seam a future store swaps behind.
- **Reading arbitrary JSON files at runtime** — explicitly avoided; render config rides endpoint `params` via the existing operator-evaluation mechanism, not a file reader.
- **Client-side config** — Part 46's territory.

## Related

- [Part 46 — Debundle workflow config](../46-debundle-workflow-config/design.md) — D1 here narrows its D3 (structure stays, render leaves); D7 there is the dynamic-config future this bridges toward.
- [Part 47 — Per-workflow submit endpoints](../../_rejected/47-per-workflow-submit-endpoints/design.md) — **superseded** (parked): this part makes all four write endpoints per-workflow, subsuming the submit-only collapse.
- [Part 44 — Tracker start_link](../44-tracker-start-link/design.md) — the `tracker:` block whose `workflow_type` field this renames to `child_workflow_type` (and validates + traces).
- [Part 19 — Operational APIs](../19-operational-apis/design.md) — the generic `start/cancel/close-workflow` endpoints D5 retires in favour of per-workflow ones.
- [Part 38 — Engine rebuild](../38-engine-rebuild/design.md) — the load → plan → commit → cascade shape and `planActionTransition`/`planEventDispatch`/`planAutoUnblock` this re-points to `params.render_config`.

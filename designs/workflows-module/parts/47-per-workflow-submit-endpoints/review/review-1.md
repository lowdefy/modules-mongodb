# Review 1

Scope: the user asked whether this part is **justified at all**, or just added/unneeded complexity. The review focuses there. Verdict up front, then the findings that support it.

## Verdict

The part is **not yet justified as written**. Its sole stated payoff — cutting generated endpoint count ~5× — rests on a scale ("~100 workflows × ~5 actions") the wider design treats as a *future* direction, not a current app; the harm of the endpoints it removes is never named; and the engine indirection it adds is real today. Worse, the part's own metric (fewer endpoints) argues *past* per-workflow to a single global endpoint, which the design rejects on a reason (no runtime config lookup) that the per-workflow design itself violates. The recommendation is either (a) do nothing now, or (b) if build cost is real, measure it and go global — not land the middle.

The findings below are ordered by weight.

## Justification

### 1. The endpoint-count "problem" is unquantified, and the scale is explicitly a *future* target — this is optimizing for what might be

The design's entire case is the opening sentence: ~100 workflows × ~5 actions = ~500 endpoints, "each existing only to carry a small per-action hooks/event-overrides map" (`design.md:3`). Two gaps:

- **No harm is named.** What does 500 generated `Api` endpoints actually cost — build time, memory, page-bundle size, cold start, the dynamic module-page generation? The design never says. "500 is a lot" is an aesthetic objection, not a measured one. Generated config nobody reads is cheap; if it isn't, the design should show the number.
- **The scale is future, by the design's own neighbours.** The sibling Part 46 frames the same figure as a destination, not a present: "CMS-managed workflows and config versioning … are a real future direction **at 100 workflows**" (`../46-debundle-workflow-config/design.md:78`), and the 100-workflow embed cost there is projected ("~20–40KB at 100 workflows, growing", `:23`). Nothing cited shows a current app near that scale.

This collides directly with CLAUDE.md's "**Build for what exists, not what might** … Don't add … until a second concrete need has actually surfaced." Until an app actually carries enough workflows that endpoint count bites something measurable, collapsing the generator is design surface (a new keyed-map shape + engine indexing) bought against an imagined load.

Fix: either pull a real number (build timing / output size at the largest real config today, extrapolated) into the design as the justification, or defer the part until the scale is real. If neither, do nothing — see #2.

### 2. Per-workflow is an unprincipled middle: the design's reason to reject a single global endpoint is contradicted by its own runtime indexing

D1 rejects going further to one global submit endpoint because "a global endpoint would need config lookup for those [hooks] at runtime, and hooks are deliberately resolved to pre-scoped `_module.endpointId` refs at build" (`design.md:21`). That barrier does not survive inspection:

- The per-workflow design **already adds runtime indexing** — `params.hooks?.[action.type]` / `params.event_overrides?.[action.type]` (`design.md:10,60`). A global endpoint differs only in keying the *same* build-resolved map one level deeper (`[workflow_type][action_type]…`). The build walker resolves `_module.endpointId` refs identically regardless of map depth (`makeWorkflowApis.js:31-35`), so the pre-scoped refs are preserved either way — global needs **no** extra config lookup.
- The engine already does runtime config lookup unconditionally: `loadWorkflowState` does `workflowsConfig.find(w => w.type === workflow.workflow_type)` and then finds `actionConfig` by `targetAction.type` (`loadWorkflowState.js:110-142`). It already holds both `workflow.workflow_type` and `action.type` at the point the hooks map would be indexed. A global endpoint costs nothing the engine isn't already paying.

So on the part's own metric — endpoint count — the options are: per-action ≈ 500, per-workflow ≈ 100, **global = 1**. If count matters, global wins by 100×; if it doesn't, per-action (today's code, simplest engine, no indexing) is fine. Per-workflow is the one option justified by neither argument. The only real per-workflow-over-global edge is regeneration blast radius (editing one workflow regenerates one endpoint vs the global one), which is generated output nobody reads — near-zero value. The reserved-name concern (`workflow-submit`, `design.md:62`) is not a blocker for global: a global endpoint would be a *fixed* module endpoint with a chosen non-derived id, not a type-derived one.

Fix: drop the part, or re-scope it to a single global submit endpoint and rewrite D1 to argue global vs per-action honestly (the runtime-lookup reason is not the discriminator).

### 3. "No behaviour change" / "downstream … unchanged" is inaccurate — three live read sites key by signal and break without a params rewrite

`design.md:3` claims "no behaviour change" and `design.md:60` claims "downstream (`invokePreHook`, `invokePostHook`, event planning) unchanged." All three of those consumers read the map **directly off `params`, keyed by signal**:

- `invokePreHook.js:82` — `params?.hooks?.[params?.signal]?.pre`
- `invokePostHook.js:43` — `params?.hooks?.[params?.signal]?.post`
- `planSubmit.js:200` — `params.event_overrides?.[params.signal]`

Under per-workflow, `params.hooks` is keyed `[action_type][signal][phase]` and `params.event_overrides` `[action_type][signal]`. With the maps re-keyed, every one of those three reads resolves to the wrong level and returns `undefined` — hooks silently stop firing, event overrides silently stop applying. "Downstream unchanged" is therefore only true if the engine **mutates `params.hooks`/`params.event_overrides` down to the action's slice** (or builds a derived params) after load and before these phases run. The design never states this — it says only "the engine reads `params.hooks?.[action.type]`" (`design.md:10`), with no plumbing to the three consumers. Per CLAUDE.md "resolve the open question; don't defer it," the design must specify the threading (recommended: in `handleSubmit`, after `loadWorkflowState`, reassign `params.hooks = params.hooks?.[targetAction.type]` and likewise for `event_overrides`, before `invokePreHook`), and the test assertion at `makeWorkflowApis.test.js` must be updated — otherwise the implementer guesses and silent hook/override loss is the failure mode.

### 4. The "natural unit for generic callers" ergonomic win is marginal-to-zero

D1's positive argument is that per-workflow lets a data-driven caller build `{workflow_type}-submit` from one field every action doc carries, instead of joining two (`design.md:19`). In practice both call-site classes already hold both fields:

- **Templates** (build-time njk): the design itself concedes "build-time: templates have `workflow_type` in vars" (`design.md:70`), and they plainly hold the action type too — they build the id from `action_config.type` today (`templates/edit.yaml.njk:251-253`). Concatenating `{workflow_type}-{type}-submit` vs `{workflow_type}-submit` is identical effort.
- **Runtime simple surface** (Part 40): it renders an action, so it has the action doc, which carries `.type` (the engine reads `targetAction.type`, `loadWorkflowState.js:126`). "One field instead of two" is real but trivial — both are in hand.

So the ergonomic benefit is one fewer string segment in a couple of `_build.string.concat`s. That is not weight enough to add a new keyed-map shape and engine indexing. If the goal is genuinely "generic callers build the id from minimal data," global (`workflow-submit`, zero workflow-specific segments) serves that strictly better — reinforcing #2.

### 5. The sequencing rationale is partly moot — Part 39 already shipped and left the call sites stale

`design.md:35,70` present Parts 39/40 as future owners to "coordinate so they re-point **once**." But Part 39 is already in `_completed/` (`parts/_completed/39-form-submit-buttons/`), and the templates it owned **still build the legacy `update-action-{type}` id** — not even the Part 38 `{workflow}-{action}-submit` naming: `templates/edit.yaml.njk:252`, `view.yaml.njk:232`, `review.yaml.njk:309`, `error.yaml.njk:285`, plus the legacy pages `pages/workflow-action-edit.yaml:202`, `workflow-action-review.yaml:209`. Note these construct `update-action-{action_config.type}` with **no `workflow_type` segment at all** — doubly stale against the current emitter (`makeWorkflowApis.js:72`).

Consequences for this part's framing:

- The module is **already broken today** — those buttons call endpoint ids the emitter doesn't produce — independent of anything this part does. That breakage should be owned and fixed regardless of whether Part 47 lands.
- The "land before/with 39 so the id changes once" argument is weaker than stated: 39 is done and did *not* re-point. Whatever fixes the still-stale templates (apparently outstanding) is where the final id gets set; this part only decides *what* that id is. The design should describe 39 as "completed but left call sites stale" rather than implying 39 still owns live coordination.

(If the templates were intentionally parked on a placeholder id pending this very naming decision, that is a *point for* resolving the naming — but it argues for fixing the stale call sites now against the simplest target, not for the per-workflow indirection specifically.)

## Things the design gets right (so they aren't relitigated)

- **Access is genuinely unaffected by endpoint granularity.** The per-verb gate runs in `loadWorkflowState` (`:162-177`), not at the endpoint boundary, so collapsing endpoints loses no security property (`design.md:19`). Verified — and it actually strengthens the case for going all the way to global.
- **D3 (hook / `on_complete` `InternalApi`s untouched).** Correct and well-reasoned: each is a distinct authored routine, `InternalApi` for HTTP-bypass safety (`makeWorkflowApis.js:5-16,95-103`); their count is irreducible and orthogonal to the submit collapse.
- **`action.type` is available post-load** to index by, as D1 assumes (`loadWorkflowState.js:126,179`). The indexing is *feasible* — finding #3 is about plumbing it to the three consumers, not about whether the key exists.

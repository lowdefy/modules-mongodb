# Review 1 — Correctness of the Api return shape and the `actions-on-entity` link wiring

## Correctness

### 1. The Api can't return `group.title` from a Mongo aggregation

> **Resolved.** Dropped `title` from the Api response shape. Page header now resolves the title client-side via `_global: workflows_config[workflow.workflow_type].action_groups[]` joined on `group.id`, with a `group.id` fallback — same lookup `workflow-header.yaml` uses. Updated lines 31, 56, and the return-shape block.

Design lines 56, 63: the Api routine is described as returning `group: { id, title, status, summary }`, with `title` "looked up by id" against `workflow.action_groups[]` on the doc.

Two problems:

1. **The persisted workflow doc has no `action_groups[]`.** [StartWorkflow.js:74-91](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) creates the doc with `workflow_type`, `groups: []`, `summary`, etc., but never copies the workflow's static `action_groups[]` config onto the doc. [recomputeGroups.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/recomputeGroups.js) only writes `{ id, status, summary }` per group. So a `$lookup`/`$project` in the routine has nowhere to read titles from on the workflows collection.
2. **`workflowsConfig` is a build-time module var.** Titles live in `_module.var: workflows_config[type].action_groups[]` — not addressable from a Mongo aggregation pipeline. Part 18's [design.md:107](../../_completed/18-entity-components/design.md) already states the rule: "Group titles are not on the doc — the component resolves them from `_global: workflows_config[workflow.workflow_type].action_groups[]` by `id`."

**Fix:** drop `title` from the Api return shape. Return `group: { id, status, summary }` only. Have `pages/group-overview.yaml` resolve the title client-side via the same `_global: workflows_config` join `workflow-header.yaml` already uses ([workflow-header.yaml:36-44, 117-137](../../../../../modules/workflows/components/workflow-header.yaml)). Update design lines 31, 56, and the return-shape block on lines 60-67 to match.

### 2. `groups[]` lookup phrasing on line 31 is wrong

> **Resolved.** Rewrote line 31 to point at the build-time `_global: workflows_config` join instead of the persisted `groups[]`. Same fix applied alongside finding 1.

Design line 31: "Workflow title + group title (`group.title` from YAML, looked up by `group_id` against the workflow's persisted `groups[]`)" — this conflates two things. Per [action-groups/spec.md:80-84](../../../workflows-module-concept/action-groups/spec.md), persisted `groups[i]` is `{ id, status, summary }`. Titles aren't in there.

**Fix:** drop the "looked up against `groups[]`" phrasing. The lookup is against build-time `_global.workflows_config[workflow.workflow_type].action_groups[]` by `id`. Same join as the milestone resolution in [workflow-header.yaml:117-137](../../../../../modules/workflows/components/workflow-header.yaml).

### 3. "access-vs-existence collapse" overstates what `get-workflow-overview` actually does

> **Resolved.** Rewrote the return-shape paragraph to match what `get-workflow-overview` actually does: `workflow` collapses to `null`; `actions` falls out naturally as `[]` from the `$lookup`. Called out that this Api adds `group: null` as a small divergence, with rationale.

Design lines 65-70 claim parity with `get-workflow-overview`'s "collapse to null" rule. Reading [api/get-workflow-overview.yaml:55-79](../../../../../modules/workflows/api/get-workflow-overview.yaml): the live behaviour is **only `workflow` collapses to `null`** when no actions survive the access filter. `actions` is returned as whatever the `$lookup` produced (possibly `[]`), not forced to `[]` separately. So success and access-denied are distinguishable by `workflow === null`, not by both fields collapsing.

Practically the design's `{ workflow: null, group: null, actions: [] }` shape is fine because an empty `$lookup` yields `actions: []` naturally — but the rationale framing is off. Either:

- Tighten the wording: "follows `get-workflow-overview`'s rule — `workflow` collapses to `null` when nothing is visible; `actions` is empty because the `$lookup` filtered everything out".
- Or be explicit about a small but real divergence: this Api adds `group: null` to the collapse, which `get-workflow-overview` doesn't have a parallel for.

## `actions-on-entity` link integration

### 4. `_module.pageId` inside `_js.params` has no precedent in this repo — verify before committing

> **Resolved.** Tightened the paragraph to call out the lack of in-repo precedent for `_module.pageId` in `_js.params`, the structural reason it should work (other `_module.*` operators resolve in this position), and the YAML-level fallback if it doesn't. Implementation is on the hook for the sanity check.

Design line 87 proposes passing `_module.pageId: { id: group-overview, module: workflows }` as a third `_js` param into the `actionGroupConfig` builder. The design calls this "the same pattern `workflow-header.yaml` uses for its `workflow-overview` button at [`workflow-header.yaml:67-73`](../../../../../modules/workflows/components/workflow-header.yaml)" — but workflow-header uses `_module.pageId` directly in `Link.params` YAML, NOT as a `_js` param. A grep across `modules/` and `apps/` returns no existing example of `_module.pageId` used inside `_js.params`.

The existing `actions-on-entity` `_js` blocks do resolve `_module.var: workflows_config` and `_module.var: app_name` successfully as `_js` params ([actions-on-entity.yaml:50-53, 67-69](../../../../../modules/workflows/components/actions-on-entity.yaml)), so the operator family generally works in params. But `_module.pageId` is a different operator with different (build-time) resolution semantics. **Sanity-check during implementation** that Lowdefy's build resolves it in this position. If it doesn't, the workaround is straightforward: resolve `pageId` once at the YAML level (a sibling property on the `ActionSteps` block — e.g., a `groupOverviewPageId` constant passed via `_js` `params`) or build the `link` map in YAML and merge it after the `_js`-built config.

### 5. Every-group link, including `done`, creates a quietly broken UX path

> **Accepted.** Kept the "every group, always" rule for v1; documented the two known edges (bounce-back on access-restricted `done` groups, struck-through clickable title on all-`not-required` groups) under the new "Known edges with the 'always link' rule" subsection, including the `link.disabled: true` fallback if either edge surfaces.

Design line 96 commits to rendering the group title `Link` unconditionally — including `done` groups. Combined with v1's `group-overview` redirect contract (line 25: "redirects back to the host entity page" when the Api returns `{ workflow: null, group: null, actions: [] }`), a `done` group whose actions are all access-filtered out for _this user_ produces: click group → land on `group-overview` → instant redirect back to entity page. The user clicked a visually-active link and got bounced.

Two milder edge cases also apply:

- **Empty group** (`total === 0`) — the design's "Open questions" already proposes rendering rather than redirecting. Once that's resolved this case is fine.
- **All-`not-required` group** — `ActionSteps.js:115-117` strikes through the title for `not-required` groups. A struck-through title that is also a clickable `Link` is dissonant; the `<strike>` markup wraps the link's content but click handler still fires.

**Recommended fix:** disable the link (or omit it) on groups whose rolled-up status is `done` or `not-required`. The Lowdefy way is `link.disabled: true` ([schema.json:93](../../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/schema.json)), which `ActionSteps.js:112` already honors (renders plain text instead of a `Link`). Computing the rollup mirrors what the block itself does — alternatively, just disable on `done` (the common case) and accept the `not-required` edge as residual.

If we keep the "every group, always" rule, the design should at minimum acknowledge the bounce-back risk and reference the same logic as `workflow-header`'s always-visible workflow-overview button — but that button doesn't have the same bounce risk because `workflow-overview`'s redirect is rarer (the workflow has at least one visible action by definition, because `actions-on-entity` only listed it).

### 6. Tracker actions' `status_map` → `group-overview` path conflicts with the unconditional group link

> **Resolved.** Added a "Tracker actions: child-workflow info stays off the parent widget" paragraph to the new section. The group title link added here addresses the parent workflow; the tracker row's `status_map` link is the only surface that points at the child workflow. The two surfaces are not in competition. Matches the rule already in Part 18 design.md:42.

Design line 39 says tracker actions can link to a child workflow's `group-overview` "if the link cell points there", routed via `status_map`. That's a per-**action** link, separate from the new per-**group** link this part adds — but it raises a UX question: if both exist on the same row (a tracker action that links to a group-overview), the user has two clickable surfaces (the row badge + the group title above it) pointing to two different group-overviews (the child workflow's vs. the current workflow's). Worth flagging in the design under the new `actions-on-entity → group-overview link` section so consumers know to expect this.

## Framing / metadata

### 7. "Part 20 adds X to exports" is misleading — this part edits the manifest directly

> **Resolved.** Rewrote Proposed-change item 4, the "Page + Api in the manifest" section, the Depends-on entry, and the Contract-to-neighbours entry to attribute the manifest edits to this part directly. Part 20 is reframed as the eventual reconciliation point, not the gate.

Design lines 16, 72-77, 102, 119, 152 describe `exports.pages` / `exports.api` additions as Part 20's responsibility. But Part 20 (`20-module-manifest`) is still under `parts/`, not `_completed/` — and the manifest in [module.lowdefy.yaml](../../../../../modules/workflows/module.lowdefy.yaml) is being edited progressively as each part lands (per `git log -- module.lowdefy.yaml`: parts 4, 15, 17, 18, 19 each touched it). Part 25 will do the same.

**Fix:** rewrite the manifest references to say "this part appends `group-overview` to `exports.pages` and `get-action-group-overview` to `exports.api` in `module.lowdefy.yaml`, alongside the corresponding `_ref` entries under `pages:` and `api:`. Part 20 will fold these into its formal manifest-shape contract when it lands." This matches the actual workflow the other parts have followed.

### 8. Verification block doesn't cover the title resolution path

> **Resolved.** Added a page-level smoke bullet checking the group-title `_global` join + `group_id` fallback.

Once finding 1 is resolved and titles are resolved client-side via `_global: workflows_config`, the page-level smoke (design lines 130-134) needs a check for that: "Group title renders correctly when `workflowsConfig[workflow_type].action_groups[group_id].title` is set; falls back to `group_id` if missing" (matching the workflow-header fallback at [workflow-header.yaml:135-137](../../../../../modules/workflows/components/workflow-header.yaml)). Otherwise the test plan claims correctness but doesn't exercise the title pipeline.

### 9. `link` slot on `actionGroupConfig[group]` not mentioned in the block's README example

> **Rejected.** The README example shows `actionGroupConfig.review.link` and the schema description on `actionGroupConfig` already covers it ("`link` (optional) wraps the title in a clickable Link"). Readers looking for the slot will find it; the prose-in-Notes pointer doesn't pay for the cross-package edit.

Minor docs nit, but the [ActionSteps README example](../../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md) shows `actionGroupConfig.review.link` in the YAML example (line 24-27) but the Properties table (line 63) and Notes don't explain when/why a consumer would set it, nor that it's distinct from per-action `link`. Once Part 25 lands and is the first real consumer of `actionGroupConfig[*].link`, consider a small README edit — single sentence under Notes — to point at this as the canonical example. Out of scope to _block_ this part, but worth a "see also" line.

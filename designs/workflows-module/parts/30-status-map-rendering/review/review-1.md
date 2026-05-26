# Review 1 — Codebase fit & migration safety

## File-path / existing-code mismatches

### 1. `shared/` lives one level up — every cited path is wrong

> **Resolved.** Rewrote all "New files" and "Modified" paths to `plugins/modules-mongodb-plugins/src/connections/shared/...`. Verified directory exists at that location and existing callers (`StartWorkflow.js:6`, etc.) import from there.

The design places new helpers at `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/shared/`. That directory does not exist. The actual shared dir is one level up: `plugins/modules-mongodb-plugins/src/connections/shared/` (sibling of `WorkflowAPI/`, not child). All "New files" entries (`renderStatusMap.js`, `parseNunjucks.js`, `populateIds.js`) and the "Modified" entries for `createAction.js` / `updateAction.js` need rewriting. The import paths in existing callers confirm this — e.g. `StartWorkflow/StartWorkflow.js:4` does `import createAction from '../../shared/createAction.js';` and the resolved path is `connections/shared/createAction.js`.

**Fix:** rewrite all "New files" and "Modified" entries to use `plugins/modules-mongodb-plugins/src/connections/shared/...`.

### 2. `populateIds.js` already exists at that path with a different purpose

> **Resolved.** Renamed the sentinel-swap helper to `substituteActionIdSentinel.js` throughout the design (D6, "New files", D10b, write-path diagram). Existing `shared/populateIds.js` (UUID assignment) is untouched.

`plugins/modules-mongodb-plugins/src/connections/shared/populateIds.js` is a UUID-assignment helper (mutates an array of action drafts, assigns `_id`). The proposed `populateIds.js` is a sentinel-swap helper. Same filename, completely different behaviour — a copy-paste port from the reference would clobber the existing helper and break every caller of it.

**Fix:** pick a non-colliding name for the sentinel swapper (`substituteActionIdSentinel.js` is unambiguous). Update D6 and the "New files" list accordingly.

### 3. `app_name` var is already on the manifest — design says "add it"

> **Resolved.** Rewrote the "Module manifest" subsection to frame this as extending the existing var's role (status-map rendering joins access filtering and event keying). Updated the description to enumerate the three roles. Also explicitly confirmed in-line that the single-slug unification across all three roles is intended, including for multi-mount setups. "Modified" bullet now says "update description; no schema change."

`modules/workflows/module.lowdefy.yaml` already declares `app_name` as `required: true` with a description tying it to access filtering and the default log-event display block. The "Schema additions → Module manifest" snippet (`design.md:268-274`) reads as if the var is new. It is not. The change is to **extend** the var's role (status-map rendering joins access filtering and event keying) and update the description.

Also flag the consequence: a single `app_name` value drives three semantically distinct things (access gate, event display, status-map cell pick). The single-mount case is fine; the design's mention of "multi-mounted setups" in D5 implies different `app_name`s per mount, which means access filtering, event keys, and status-map keys all key on the same per-mount slug — confirm this is the intended unification before locking it in.

## Missing callers / scope gaps

### 4. Cascade sweep loses `reason` field on the action push (today's behaviour silently preserved by absence)

> **Resolved.** Added explicit call-out under the "Modified" bullets for `CancelWorkflow.js` and `CloseWorkflow.js`: per-action `status[]` entries stay `{ stage, created, event_id }`; the workflow-level `reason` does not propagate.

`CancelWorkflow.js:49-67` puts a `reason` field on the workflow's `cancelled` status entry, but the action-sweep `$push` at lines 83-95 deliberately does NOT add `reason` to each action's `not-required` entry — only the workflow gets it. The design's worked example and proposed pipeline ([`design.md:204-209`](../design.md)) push `{ stage: 'not-required', created, event_id }` per action; that's the same shape (no reason). Fine — but call it out explicitly so the implementer doesn't accidentally propagate the workflow reason onto each action entry "for completeness" while rewriting the sweep.

### 5. `fireTrackerSubscription` and `reevaluateBlockedActions` also write stages — not in the "Modified" list

> **Resolved.** Rewrote D10a around a shared `buildActionStageUpdate` helper. Render lives inside `updateAction` (for single-action writes) and inside the per-action loop of Cancel/Close cascades (for bulk sweeps) — both via the same helper. `fireTrackerSubscription` and `reevaluateBlockedActions` call `updateAction` and inherit automatically; no edits needed. Explicitly called out in the "Modified" list.

Both call `updateAction` (`SubmitWorkflowAction/fireTrackerSubscription.js:64`, `SubmitWorkflowAction/reevaluateBlockedActions.js:66`) to push fresh status entries on parent trackers and auto-unblocked actions. The design's "Modified" list omits both files. If the render happens *inside* `updateAction`, these paths inherit the render automatically — but the design's D10a explicitly pulls the render *out* of `updateAction` for the cascade case and into the handler-level `bulkWrite` loop. That makes the render placement ambiguous: inside `updateAction` or at the call site?

**Resolve before implementation:** commit to "render lives inside `updateAction`" (preferred — one correct way per the project principle) and rewrite D10a to say cascade sweeps build the pipeline by calling a shared helper that `updateAction` also uses. Otherwise these two callers are silent gaps.

## Validation / migration story

### 6. Existing demo configs will fail the new build validator

> **Resolved by scope change.** The design was rewritten to shape-only validation with no coverage requirement (per D7); sticky display fills in for stages without cells. Demo configs no longer need `action-required` cells. The `Demo + tests` bullet does call out stripping authored `link:` from existing demo cells (since built-in kinds now reject `link:` per D4) — that's a small mechanical edit, not a backfill audit.

The reachable-stage table in D8 says `kind: task` always reaches `action-required`, `in-progress`, `done`, `not-required`. `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` has cells for `in-progress`, `done`, `not-required` — **no `action-required`** — and no `error` either. Same likely for the three `onboarding/track-step-*.yaml` files (all have status_map). The new validator turns these from "warns at runtime" into "fails the build." The design's "Demo + tests" bullet says these files need only an optional templated message — it skips the mandatory backfill.

**Fix:** add a pre-implementation audit step to the design — enumerate every status_map cell across `apps/demo/.../workflow_config/`, list each missing reachable stage, and bake the additions into this part's PR (or call out the broken builds explicitly so the implementer knows it's expected work).

### 7. `kind: custom` row in D8 depends on unshipped Part 28

> **Resolved.** Dropped the `custom` row from D8's table; replaced with an explicit note saying Part 28 adds it when that kind lands. Mirrored the note in Part 28's design (under "Build-time validation") so it doesn't get lost.

`makeWorkflowsConfig.js:26-27` defines `ACTION_KINDS = ['form', 'task', 'tracker']`. The `custom` kind arrives via Part 28 (still in design). Adding the `custom` row to the validator now will reject any workflow that omits `not-required` for kind=custom — but kind=custom can't be declared yet. Decide whether the table lands together with Part 28 (preferred) or whether the validator gates the `custom` row behind a feature check. Note the dependency in this part's "Depends on" list or remove the row until Part 28 ships.

### 8. In-flight production action docs won't have rendered cells — no backfill plan

> **Resolved.** Added D10c "No backfill for in-flight action docs": the module has no current consumers (wip, non-functional), so no migration is needed. Demo flows pick up rendered cells on the next transition. A note records that any future real consumer adopting this module must pick a rollout strategy (backfill / UI fallback / quiescence) — out of scope here.

The change introduces top-level `<app-slug>` and `status_title` fields written only on stage transitions going forward. Any action doc currently in flight on a deployed app (stage not terminal) will, after deploy, have neither field. Display surfaces switch to reading `a[appName].message` / `.link` (design.md:182-184, 231-234) and resolve to `undefined`. Result: in-flight actions render blank message/link cards until the next transition.

**Decide:**

- (a) Ship a one-shot backfill migration that walks live action docs, looks up `actionConfig.status_map[currentStage]`, renders against the doc, and writes the cell. Render context is missing past metadata but that's acceptable for backfill.
- (b) Keep a runtime read-fallback through `status_map[stage]` in the UI for one release, then remove it.
- (c) Document explicitly that this is a breaking change requiring quiescence (no in-flight workflows) before rollout — only viable for the demo, not real apps.

Pick one and add it to the design.

## Decision rationales that don't hold

### 9. D3's "extra read per transition" argument is wrong

> **Resolved.** Rewrote D3's option-2 rationale to lead with "self-contained two-stage pipeline; slug universe static at build time; same shape works for `bulkWrite` cascade ops." Removed the misleading cost-of-reads framing — D9's render context requires the doc anyway, and `updateAction.js:48` already fetches it on the non-`force` path.

D3 dismisses the runtime-diff option because it "costs an extra read per transition." That read is happening already: `updateAction.js:48` calls `getCurrentAction` (full doc, no projection) on the non-`force` path, and the render itself needs that doc as part of `renderCtx` (D9). Cascade paths under `force: true` skip the current read today, but they too need the doc for `renderCtx`. The runtime-diff approach therefore costs **zero** extra reads.

The honest argument for option 2 (null-every-slug) is that it keeps the update self-contained as a two-stage pipeline (no JS-side diff bookkeeping) and pushes the slug universe to build time where it's static. Update D3 to lead with that; the cost-of-reads argument is misleading.

### 10. Render context for `StartWorkflow` (initial insert) is under-specified

> **Resolved.** Updated D9 to clarify that the render context name is `actionDocBeforeWrite`, and that on Start this is the in-memory draft built by `createAction` (populated with `_id`, `type`, `kind`, `key`, `assignees`, `due_date`, etc.) — not `null`. `currentActionDoc = null` is just a fetch optimisation. Also updated the write-path and Start diagrams and the `createAction.js` "Modified" bullet to render against the in-memory draft.

D9 defines `renderCtx = { ...currentActionDoc, ...mergedMetadata }`. The write-path diagram (design.md:215-221) says for Start: `currentAction = null`, "no fetch — initial insert." Spreading `null` yields `{}`, so `renderCtx` collapses to just `mergedMetadata`. Templates that reference `assignees`, `due_date`, `key`, `type`, etc. — all populated on the draft doc by `createAction.js:33-48` — would render empty.

**Fix:** specify that for Start, render context is the **draft action doc being built** (which has `assignees`, `due_date`, `description`, `key`, `type`, `entity_id`, etc.) plus `mergedMetadata`. `currentActionDoc = null` is a fetch optimisation, not a render-context decision. The worked example's `'Awaiting installation of {{ form_data.physical_id }}.'` rendering to `'Awaiting installation of .'` is fine for that case (no form_data yet) but the same example renders `{{ assignees[0].name }}` at `in-progress` — that path only works because submit fetches the current doc; Start templates referencing `assignees[0].name` would silently fail today.

## Authoring / client-name leakage

### 11. Reference paths and app-slug examples leak a client name

> **Resolved.** Stripped absolute `file:///Users/...` reference paths (D1, Related). Renamed all `'prp-team'` / `'prp-support'` example slugs to neutral placeholders (`'app-a'`, `'app-b'`) across D2, D3, D4, D7, the read-path diagram, and the resolver-output example. Kept `demo` since it's the demo app's actual slug.

`design.md:21` and `design.md:421` use `file:///Users/sam/Developer/mrm/prp/...` absolute paths to a sibling repo named after a client/project. The app-slug examples throughout — `'prp-team'`, `'prp-support'` — carry the same name. CLAUDE.md is explicit: "Never use client names in design documents, commits, or any content tracked in git. Use generic terms."

**Fix:** strip absolute paths (they break for any other reader anyway — quote the relevant snippets inline or link to a git rev), and rename the example slugs to neutral placeholders like `'app-a'` / `'app-b'`, or pin them to the demo slug (`demo`) plus a second invented slug used only in this design.

### 12. `payload.display` is a new public API surface with no schema home

> **Resolved.** Added `modules/workflows/api/start-workflow.yaml` and `modules/workflows/resolvers/makeWorkflowApis.js` (the emitted `update-action-{type}` api template) to the "Modified" list with explicit `_payload` pass-through for `metadata` and `display`. Also added a README update bullet documenting both fields' shape and scope. The override is now first-class on the api contract, not just an undocumented engine feature.

D7 introduces `payload.display.{appName}` as a per-call override for Submit/Start. The handler schemas are `{}` today (`SubmitWorkflowAction.js:22`, `StartWorkflow.js:131-135`), so it'll work at runtime, but the external Api contracts (`modules/workflows/api/start-workflow.yaml`, `submit-workflow-action.yaml`) don't document or validate it. If this is shipped, the API-contract documentation needs the new field; "Files changed" should list the relevant api yaml files. If it's not actually used yet (no concrete second consumer surfaced) consider deferring per the "Build for what exists, not what might" principle.

## Minor

### 13. `parseNunjucks.js` source

> **Resolved.** Picked single-source over copy. New location is `src/utils/parseNunjucks.js` (new top-level `utils/` dir under `src/`, matching the reference codebase layout and avoiding the name clash with `connections/shared/`). Added `ContactSelector.jsx` to the "Modified" list to update its import and delete the old local file.

The "lift from" path `src/blocks/ContactSelector/parseNunjucks.js` exists — verified. Worth deciding whether to share via a single source (move to `connections/shared/` or `src/shared/`) or copy. The design says "or shared via a single source" parenthetically; pick one before implementation so the second consumer doesn't end up with a drift.

### 14. Stage-write helper centralisation

> **Resolved.** D10a now defines a single `buildActionStageUpdate` helper that builds the two-stage `$set` aggregation pipeline. `updateAction` wraps it in `MongoDBUpdateOne`; Cancel/Close cascades wrap it in `bulkWrite` ops. `createAction` calls `renderStatusMap` directly (insert path — no pipeline needed). Three call sites, one builder. `fireTrackerSubscription` / `reevaluateBlockedActions` go through `updateAction` and inherit. New file `buildActionStageUpdate.js` + tests added to the "New files" list.

Per the project's "One correct way" principle: there are now five paths that push action status entries — `createAction` (insert), `updateAction` (priority-rule + force), Cancel sweep, Close sweep, `fireTrackerSubscription`, `reevaluateBlockedActions`. The design's central claim ("the engine renders on every stage write") only holds if every path goes through one helper. D10a's deliberate bypass of `updateAction` for cascades works against this. Recommend: extract a single `buildStageWritePipeline({ actionDoc, newStage, payloadDisplay, mergedMetadata })` helper used by `createAction`, `updateAction`, and both cascade sweeps. Render lives there; callers differ only in how they invoke the resulting pipeline (InsertOne / UpdateOne / bulkWrite).

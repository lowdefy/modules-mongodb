# Review 1 — Field-removal scope, blast radius, and downstream contracts

Focus: does the design correctly enumerate the fields it removes, capture every place those fields are read or written, and leave the downstream parts (5, 12, 18, 19) with a consistent payload contract?

## Factual claims about doc shape

### 1. `parent_entity_type` and `child_entity_type` do not exist — dropping them is a phantom

> **Resolved.** Rewrote the "Workflow + action doc shapes" bullets and the part-3 "Affects implemented parts" entry to drop the phantom-field language. New text explicitly notes the parent/child link shape has no `*_entity_type` field, and points the part-3 follow-up at the real touch sites (JSDoc typedefs in `types.js`, `getActionFields.js` projection).

[design.md:19–20](../design.md) says:

> Workflow doc: drop `entity_type`. Keep `entity_collection`. Same for `parent_entity_type` / `parent_entity_collection` — drop the type, keep the collection.
> Action doc: drop `entity_type`. Keep `entity_collection`. Same for `child_entity_type` / `child_entity_collection`.

And [design.md:49](../design.md):

> Doc shape changes: drop `entity_type` from the workflow + action doc field lists, drop `parent_entity_type` / `child_entity_type`.

But `parent_entity_type` and `child_entity_type` are not in the schema today. The concept spec at [engine/spec.md:107–137](../../../workflows-module-concept/engine/spec.md) lists only `entity_type`, `entity_id`, `entity_collection`, `parent_entity_id`, `parent_entity_collection`, `child_entity_id`, `child_entity_collection`. The implemented JSDoc at [plugins/modules-mongodb-plugins/src/connections/shared/types.js:32–67](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/types.js) matches: no `parent_entity_type` or `child_entity_type` anywhere. `git grep -n "parent_entity_type\|child_entity_type"` against the repo (excluding part 21's own design) returns zero hits.

The "parent/child have a parallel type field" framing came from an earlier draft of the parent/child link shape — Sam's review resolution ([review-sam-1.md:39](../../../workflows-module-concept/review/review-sam-1.md)) explicitly adopted a three-field-per-side shape (`parent_action_id` + `parent_entity_id` + `parent_entity_collection`; `child_workflow_id` + `child_entity_id` + `child_entity_collection`) with no parent/child _type_ scalar.

**Fix:** Rewrite [design.md:19–20](../design.md) to drop the "Same for `parent_entity_type` / `child_entity_type`" parenthetical entirely. The parent/child fields are already type-free; this part only removes `entity_type` (and updates `parent_entity_type` / `child_entity_type` references is a no-op). Same edit at [design.md:49](../design.md) — strike the "drop `parent_entity_type` / `child_entity_type`" clause.

This matters because a task-writer reading the design will go grepping for `parent_entity_type` to delete, find nothing, and either (a) silently move on (best case) or (b) introduce the field somewhere as a placeholder to "drop" (worst case). Either way the design teaches a wrong mental model of the doc shape.

### 2. Engine spec's reserved-keys list is not in the design's scope list

> **Resolved.** Rewrote the Documentation bullet to use `git grep -l "entity_type" designs/workflows-module-concept/` as the authoritative scope, with a today-list including `engine/design.md`, `action-authoring/design.md`, `action-groups/spec.md`, and `module-surface/design.md` alongside the originals.

[design.md:36](../design.md) lists the concept-doc files to update: `spec.md`, `design.md`, `action-authoring/spec.md`, `ui/spec.md`, `ui/design.md`, `engine/spec.md`, `module-surface/spec.md`. Missing: `engine/design.md`, which is the largest single source of `entity_type` mentions in the concept folder. Spot-check from grep — [engine/design.md:59, 64, 66, 70, 170, 192, 208–227, 373–374](../../../workflows-module-concept/engine/design.md) all mention `entity_type` (the schema discussion, `createAction.js` pseudo-code, reserved-keys list, parent/child decision, worked example). Also missing: `action-authoring/design.md`, which has worked-example YAML with `entity_type: lead` ([action-authoring/design.md:94, 319, 377, 430](../../../workflows-module-concept/action-authoring/design.md)) and the parent-link explanation, and `action-groups/spec.md` ([line 10, 78](../../../workflows-module-concept/action-groups/spec.md)).

**Fix:** Add `engine/design.md`, `action-authoring/design.md`, and `action-groups/spec.md` to the documentation update list. Or restate the scope as "every file under `designs/workflows-module-concept/` that mentions `entity_type`" — a simple `git grep -l "entity_type" designs/workflows-module-concept/` gives the authoritative list and avoids re-enumerating files that drift over time.

### 3. Reserved-keys list mutation isn't called out

> **Resolved.** Added an explicit Documentation bullet: strike `entity_type` from the engine reserved-keys list in `engine/spec.md` and `engine/design.md`, so apps can use it as a `references` key without silent override.

The engine concept doc keeps a **reserved-keys list** (the set of field names `references.{key}` payloads cannot override) at [engine/spec.md:238](../../../workflows-module-concept/engine/spec.md) and [engine/design.md:192](../../../workflows-module-concept/engine/design.md). Today both include `entity_type`. Removing the field means it must come off the reserved list — otherwise apps that legitimately need an `entity_type` reference key (for, e.g., their own taxonomy in a `references:` payload) are silently overridden by a value the engine no longer writes.

**Fix:** Add to In-scope a bullet under "Documentation": "Strike `entity_type` from the engine reserved-keys list in `engine/spec.md` and `engine/design.md`." Cheap, easy to miss.

## Cross-part contract changes

### 4. Part 5's payload contract change isn't called out as a follow-up

> **Resolved.** Edited the sibling design.md files in this PR to keep cross-part contracts coherent: part 5 (payload required line + workflow-doc write list), part 19 (`start-workflow` payload required + `get-entity-workflows` payload). Part 12 was already updated by its own review-1 resolution; part 18 has no `entity_type` references so no edit needed. The "Documentation" bullet on part 21's design now explicitly names the unimplemented siblings as in-scope.

[design.md:24](../design.md) says `start-workflow` payload becomes `{ workflow_type, entity_id, entity_collection }`. Part 5 ([parts/05-start-cancel-handlers/design.md:14](../../05-start-cancel-handlers/design.md)) currently states:

> Required: `workflow_type`, `entity_type`, `entity_id`, `entity_collection`.

Part 5 is not yet implemented (Wave 2), so it doesn't need a `tasks/` follow-up per the implementation-plan rule. But it does need its design amended — and [design.md:53](../design.md) groups it with the parts that "absorb the change inline — no follow-up tasks needed." That's fine for code, but the _design.md_ for parts 5, 12, 18, 19 still need text edits in this same PR for the cross-part contracts to be coherent (e.g. part 12 already says it "depends on part 21 explicitly" at [parts/12-resolver-pages/design.md:80](../../12-resolver-pages/design.md), but parts 5, 18, 19 haven't been touched).

**Fix:** Add to In-scope a "Sibling design refresh" bullet: "Update unimplemented sibling part designs in the same PR so contracts line up — parts 5, 12, 18, 19 designs lose `entity_type` from payload contract lines (specifically [05-start-cancel-handlers/design.md:14](../../05-start-cancel-handlers/design.md), [19-operational-apis/design.md:14, 29](../../19-operational-apis/design.md), the entity-context lines on 12 and 18)." This is a docs-only edit but it's load-bearing for the next reviewer.

### 5. `start-workflow` optional payload still mentions `parent_entity_type` shape implicitly

> **Resolved.** While editing part 19 for finding #4, also dropped `parent_entity_id` / `parent_entity_collection` from the optional payload list and added the link to part 5 review-1 #1 explaining that the handler reads them off the parent action.

[parts/19-operational-apis/design.md:15](../../19-operational-apis/design.md) lists optional payload fields: `parent_action_id`, `parent_entity_id`, `parent_entity_collection`, `actions: []`, `references: {}`. Part 5 ([parts/05-start-cancel-handlers/design.md:14–15](../../05-start-cancel-handlers/design.md)) and [review-1 finding #1](../../05-start-cancel-handlers/review/review-1.md#1-parent-entity_id--entity_collection-provenance-contradicts-the-engine-spec) already resolved that callers don't (and can't) supply `parent_entity_id` / `parent_entity_collection` — the handler reads them off the parent action. Part 19's design lags behind.

Not part 21's bug per se, but part 21 is amending the same payload contract and the design says "drop `entity_type` from every payload, doc shape, and worked-example." If part 19 is in scope for that pass, the resolved-by-part-5-review-1 issue should be folded into the same edit (drop `parent_entity_id` and `parent_entity_collection` from part 19's optional payload list).

**Fix:** When editing [parts/19-operational-apis/design.md:14–15](../../19-operational-apis/design.md), also drop `parent_entity_id` and `parent_entity_collection` from the optional list. One-line cleanup, no design rationale change.

### 6. Existing task files under implemented parts still reference `entity_type`

> **Resolved.** Per user rule "do not touch parts that have been implemented": part 21 no longer files follow-up tasks under `parts/03-*/tasks/` or `parts/04-*/tasks/`. Code edits to the shipped files are owned directly by part 21 under a new "Shipped code edits" sub-section; the implemented parts' designs and `tasks/` directories stay frozen. New "Implemented parts" section in design.md states the rule explicitly.

The follow-up tasks land in `parts/03-engine-plugin-shell/tasks/` and `parts/04-workflow-config-schema/tasks/`. But those directories already contain task files that mention `entity_type`:

- [03-engine-plugin-shell/tasks/02-document-schemas.md:17, 38, 91, 117](../../03-engine-plugin-shell/tasks/02-document-schemas.md) — JSDoc shape, three locations.
- [03-engine-plugin-shell/tasks/04-shared-utility-placeholders.md:8, 53](../../03-engine-plugin-shell/tasks/04-shared-utility-placeholders.md) — `getActionFields.js` projection.
- [04-workflow-config-schema/tasks/02-make-workflows-config.md:36, 100, 144](../../04-workflow-config-schema/tasks/02-make-workflows-config.md) — the resolver implementation reference.
- [04-workflow-config-schema/tasks/03-workflow-api-schema-extend.md:43, 48](../../04-workflow-config-schema/tasks/03-workflow-api-schema-extend.md) — the `workflowsConfig` JSON schema.

The part 21 design says it "lands a follow-up task in `parts/03-engine-plugin-shell/tasks/`" and same for part 04 — but those task files describe work that's already complete and historical (the resolver shipped, the schema shipped). The "follow-up" pattern in the implementation plan is for _new_ work post-implementation. Editing the historical task files would rewrite history. Choices:

- (a) **Don't edit the historical task files.** They're a record of what was specced when implementation happened. The follow-up task file under each part's `tasks/` directory is the new authoritative description of the delta, and grep-finding old `entity_type` mentions in historical tasks is fine — they're frozen artifacts.
- (b) **Edit the historical task files.** They become the always-up-to-date spec, with the cost that the original record of what was implemented is gone.

The implementation-plan's annotation rule ([implementation-plan.md:24–29](../../../implementation-plan.md)) doesn't say which. The design at [design.md:49–50](../design.md) is ambiguous on this point too.

**Fix:** Pick (a) and call it out explicitly: "Historical task files under `parts/03-engine-plugin-shell/tasks/` and `parts/04-workflow-config-schema/tasks/` are not edited — they document the implementation that shipped. The new task file under each (`tasks/NN-entity-type-removal.md`) owns the delta." This aligns with the convention used elsewhere (e.g. [parts/05-start-cancel-handlers/review/review-1.md:9](../../05-start-cancel-handlers/review/review-1.md) — resolutions amend design.md, not the historical task files).

## Scope completeness

### 7. The `entity_type` index on the `workflows` and `actions` collections

> **Resolved.** Added a dedicated Documentation bullet calling out the index-recommendation update in `engine/spec.md` (was `(entity_type, entity_id)`; becomes `(entity_collection, entity_id)`). Singled out because a stale index recommendation has a worse failure mode than a stale worked-example.

Concept engine spec at [engine/spec.md:183–184](../../../workflows-module-concept/engine/spec.md) says:

> `actions`: `(entity_type, entity_id)` for `get-entity-workflows`.
> `workflows`: `(entity_type, entity_id)` for `get-entity-workflows`.

These are the index recommendations. Drop `entity_type` and the index recommendation becomes `(entity_collection, entity_id)`. Part 21 design doesn't mention indexes — neither in scope nor deferred.

**Fix:** Add to In-scope under "Workflow + action doc shapes": "Index recommendation in [engine/spec.md:183–184](../../../workflows-module-concept/engine/spec.md) updated to `(entity_collection, entity_id)`." No code change today (no migration to a real index) but the spec line is wrong post-rename and a reader looking up "how do I make `get-entity-workflows` fast" will be led astray.

### 8. Worked-example YAML under `apps/demo/`

> **Resolved.** Reworded the verification line to point at part 20 (Wave 7) as the actual verification site — part 21 ships before the demo YAML exists, so the check can't run here.

[design.md:62](../design.md) says verification includes a worked-example onboarding workflow YAML in `apps/demo/` using `entity_collection: leads-collection`. But:

```
$ grep -rn "entity_type\|entity_collection" apps/demo/
(no output)
```

There's no workflows YAML in `apps/demo/` yet — that ships in part 20 (module-manifest + demo wiring). So the verification line is aspirational: the YAML doesn't exist, and won't until part 20 lands (Wave 7), which is after part 21 (Wave 1b).

**Fix:** Either (a) drop the demo-app verification line and rely on the unit/integration tests already listed; or (b) make the demo-app verification an explicit deferred check tied to part 20 ("Part 20's demo YAML uses `entity_collection`, not `entity_type` — verified by a smoke test in part 20's deliverable, not here"). Option (b) is cleaner — it's a real verification, just at a different point in the timeline.

### 9. `parent_action_id` validation message — engine error surface

> **Rejected.** Noise — the design already says no production apps depend on the module yet, and test fixtures get rewritten in the same PR by the same author landing the schema change. An explicit "no migration script" line is reassurance for a problem that won't surface.

When [design.md:42](../design.md) says rejection at build time with a clear migration message, that handles author-supplied YAML. But the engine still runs against historical data — once the codebase ships, any developer running tests against a seeded DB with old-shape docs (created with `entity_type` only, no `entity_collection`) sees engine-internal errors when handlers try to read non-existent fields. Today this is a non-issue (no production data), but the design's "Out of scope / deferred" entry [design.md:41](../design.md) says "no production apps depend on the module yet" — which is true for _new_ shape but doesn't address test-fixture handling during the transition.

**Fix:** Probably noise — fixtures get rewritten in the same PR. But worth a one-line note in "Out of scope" to make the assumption explicit: "Test fixtures are rewritten in the same PR; no migration script for ad-hoc seed data is provided."

## Verification

### 10. The unit test for build-time rejection isn't specific enough

> **Resolved.** Added a second verification line — `makeWorkflowsConfig` also rejects a workflow declaring both `entity_type:` and `entity_collection:`, ensuring the migration check fires before the new-field happy path.

[design.md:61](../design.md):

> `makeWorkflowsConfig` rejects a workflow declaring `entity_type:` with a clear "rename to entity_collection" message.

Good as a smoke test. Better: also test that a workflow with **both** `entity_type:` and `entity_collection:` is rejected (i.e. the migration check fires before the new-field happy path). Otherwise a half-migrated YAML — old key not removed but new key added — slips through silently, silently picking up the new field and ignoring the old.

**Fix:** Verification gets a second case: "`makeWorkflowsConfig` rejects a workflow declaring both `entity_type:` and `entity_collection:` with the same migration message."

## Open questions

### 11. Open-question (a) — concept doc updates land here

> **Rejected.** Keeping the open question as written. The "lean" framing is intentional record-keeping, even though the Documentation section commits to it.

[design.md:69](../design.md) leans "in this part." Agree. But ship it on the same review pass that updates the part-design siblings (finding 4 above) — otherwise there's a window where the concept doc is correct and the per-part designs are stale, which is the worst of both. Make the open question a decision instead of an open question.

### 12. Open-question (b) — `entity_collection` validation against host connections

> **Rejected.** Keeping the open question as written.

[design.md:70](../design.md) defers this. Reasonable. But the defer-to is unspecified ("a future hardening pass"). If this is real work it deserves a part number; if it's a never-do it should be deleted. Recommendation: name it "future" and link to a tracking issue, or strike it and move on. Loose "we might do this someday" deferrals in design docs erode trust over time.

# Consistency Review 2

## Summary

Re-checked Part 57's design tree after the `tasks/` folder was added and after sibling parts (Part 56 review-3, Part 59) settled two cross-cutting decisions that Part 57's design.md has since absorbed. Found **one large, multi-file Design-vs-Task drift**: every task file (and `tasks.md`) was authored against the **earlier** revision of the design (the "authoring sugar / lift" approach, member name `entity.collection`), while the current design.md — corroborated by Part 59 and Part 56's review-3 — uses **`entity.connection_id`** and **materializes the whole block nested with no lift**. Eight inconsistencies, all auto-resolved against design.md (no user-resolved items, no open questions). Task 2 already matched and needed only one descriptive fix.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** (none)
- **Reviews:** `review/review-1.md` (findings 1–5, all resolved), `review/consistency-1.md` (prior consistency pass — context only, not a finding source)
- **Tasks:** `tasks/tasks.md`, `tasks/01-resolvers-entity-block.md`, `tasks/02-engine-read-methods.md`, `tasks/03-engine-test-suites.md`, `tasks/04-remove-entities-param-and-var.md`, `tasks/05-demo-entity-blocks.md`, `tasks/06-docs.md`
- **Plans:** (none)
- **Cross-referenced (read-only, per the invocation):** `parts/56-three-tier-action-pages/review/review-3.md`, `parts/59-entity-instance-pointer/design.md`

## Decision Register (source-of-truth, current)

From design.md (corroborated by Part 59 design and Part 56 review-3 finding #2):

1. **Member name is `entity.connection_id`, not `entity.collection`** — design.md "Decision: the member is `connection_id`, not `collection`" (:23–25, :116); Part 59 :36, :105.
2. **Materialized as authored — no lift.** `makeWorkflowsConfig` carries the **whole `entity` object nested** into the materialized config; nothing is lifted to flat `entity_collection`/`entity_ref_key` — design.md :4–5, :27–47, :143.
3. **Wholesale carry (every field, not a whitelist)** so optional fields a dependent part adds (Part 56's `name_field`) survive — design.md :12, :143, :151; Part 56 review-3 #2(b).
4. **`makeActionPages.js` is owned by Part 57** and reads `workflow.entity.connection_id` — design.md :152; Part 56 review-3 #2(a); Part 59 :36.
5. **Persistence/runtime layer stays flat in this part and breaks until Part 59** — `StartWorkflow`/`planEventDispatch`/documents/queries/index still expect flat `entity_*`; accepted, no shim — design.md :5, :45, :168; Part 59 :32, :39.

## Inconsistencies Found

### 1. `tasks.md` overview/table described the "authoring sugar / lift" approach and member `collection`

**Type:** Design-vs-Task
**Source of truth:** design.md (decisions 1–5)
**Files affected:** `tasks/tasks.md`
**Resolution:** Auto-resolved. Rewrote the overview to "materialized as authored — not lifted", member `connection_id`, and the runtime-breaks-until-59 note; updated the Task 1 table row ("validate & lift" → "validate … and carry it nested") and the ordering-rationale bullet ("validates + lifts" → "validates + carries the `entity` block nested").

### 2. `tasks.md` flagged `makeActionPages` as a "design gap"

**Type:** Stale Reference / Stale Status
**Source of truth:** design.md :152 (now lists `makeActionPages.js`); Part 56 review-3 #2(a)
**Files affected:** `tasks/tasks.md`
**Resolution:** Auto-resolved. Renamed the "Design gap flagged during decomposition" section to "`makeActionPages` read (now owned by the design)", dropped the "not in the design's Files changed list" claim, and corrected the read target to `workflow.entity.connection_id`.

### 3. Task 1 described lift-to-flat + a routing-only materialized block, and member `entity.collection`

**Type:** Design-vs-Task
**Source of truth:** design.md (decisions 1–3)
**Files affected:** `tasks/01-resolvers-entity-block.md`
**Resolution:** Auto-resolved. Reworked Context, the authoring-shape YAML (`collection` → `connection_id`), the materialized-shape snippet (routing-only `{ page_id, id_query_key, title }` + flat aliases → whole nested `entity: { connection_id, ref_key, page_id, id_query_key, title }`), the validation field names, the "Lift + materialize" step (now "Carry the `entity` block nested" — wholesale `{ ...workflow.entity, id_query_key: … ?? '_id' }`, no flat picks), the `makeActionPages` read target, the test-suite expectations (nested config, no flat aliases, `name_field` survival case), acceptance criteria, and Files entries.

### 4. Task 1 Notes claimed the runtime `entity_ref_key` readers were "unchanged by this task"

**Type:** Internal Contradiction (with decision 5)
**Source of truth:** design.md :45, :168 (runtime readers break until Part 59)
**Files affected:** `tasks/01-resolvers-entity-block.md`
**Resolution:** Auto-resolved. Under the no-lift carry, `workflowConfig.entity_ref_key` is no longer materialized, so `StartWorkflow.js:181` / `planEventDispatch.js:160` now resolve `undefined` and break — intentionally, until Part 59. Rewrote the note to say so (no compat shim) and updated the demo `_module.connectionId` note to `entity.connection_id`.

### 5. Task 2's context said the materialized block is routing-only `{ page_id, id_query_key, title }`

**Type:** Design-vs-Task
**Source of truth:** design.md :143 (whole block carried nested)
**Files affected:** `tasks/02-engine-read-methods.md`
**Resolution:** Auto-resolved (one line). The block now carries `{ connection_id, ref_key, page_id, id_query_key, title }`; the methods use only the routing fields. The rest of Task 2 (reads `wfConfig?.entity`; collection/id stay flat on the document) already matched the current design and was left intact.

### 6. Task 3's config fixture used the old lifted shape (flat `entity_collection`/`entity_ref_key` + routing-only block)

**Type:** Design-vs-Task
**Source of truth:** design.md (decisions 2–3)
**Files affected:** `tasks/03-engine-test-suites.md`
**Resolution:** Auto-resolved. Replaced the fixture example with the whole nested `entity` block and no flat config aliases; added an explicit note that the **document** fixtures keep flat `entity_collection`/`entity_id` (unchanged in this part); updated step 2 and the acceptance criterion accordingly.

### 7. Task 4's schema note assumed the materialized shape keeps flat `entity_collection`/`entity_ref_key`; manifest description used `collection`

**Type:** Design-vs-Task
**Source of truth:** design.md (decisions 1–2)
**Files affected:** `tasks/04-remove-entities-param-and-var.md`
**Resolution:** Auto-resolved. Rewrote the `workflowsConfig`-description note (config entity shape is now nested; leave any flat **document**-field mentions intact); changed the manifest `entity:` field list member `collection` → `connection_id` (and its acceptance criterion).

### 8. Tasks 5 & 6 authored the `entity:` block with member `collection`

**Type:** Design-vs-Task
**Source of truth:** design.md decision 1
**Files affected:** `tasks/05-demo-entity-blocks.md`, `tasks/06-docs.md`
**Resolution:** Auto-resolved. Demo YAML (`onboarding` + `company-setup`, including the `_module.connectionId` operator), demo acceptance criteria, the authoring-grammar doc YAML, the `index.md` prose pointer, and the docs acceptance criterion all moved `collection` → `connection_id`.

## No Issues

- **design.md internal + cross-design.** design.md is internally consistent and aligned with Part 59 (makeActionPages ownership :152↔59:36; no-lift/nested carry :143↔59:32,39; runtime-breaks-until-59 :5,:168↔59:39) and Part 56 review-3 (wholesale carry preserving `name_field` :12,:143↔#2b; makeActionPages in Files-changed :152↔#2a). No changes needed to design.md.
- **review-1 decisions** (findings 1–5) remain faithfully reflected in design.md — consistency-1 already verified this and nothing regressed.
- **Task 2 body** (drop `connection.entities`, read `wfConfig?.entity`, collection/id stay flat on the document, `entity_link: null` for de-configured types) already matched the current design — only the context-paragraph block description (finding #5) needed touching.
- **Behavior-change note** (`entity_link: null` for de-configured `workflow_type`) is consistent across design.md Non-goals and Task 2's acceptance criteria.
- **Task ordering / dependency graph** (`tasks.md`: 1→2→{3,4}, 4→{5,6}, 5 dep 1+4) is unaffected by the reshape and remains coherent.

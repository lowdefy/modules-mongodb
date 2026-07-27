# Review 3

Scope: `design.md` **plus the new `tasks/` folder** (12 task files + `tasks.md`), which did not exist at review-1/review-2/consistency-1 time. Reviews 1–2 verified `design.md` thoroughly and every finding is annotated resolved/rejected; this pass does **not** repeat them. It checks the tasks against the design and the source, and re-checks two cross-design seams (Part 57) and one behavioural change the tasks surface that the design never names. Verified against: `makeActionPages.js`, `makeWorkflowsConfig.js`, `GetWorkflowAction.js`, `check-action-surface.yaml`, `universal-fields/universal-fields.yaml`, `templates/view.yaml.njk`, `modules/layout/components/page.yaml`, `planEventDispatch.js`, and Part 57's `design.md`.

Most of the task set is faithful to the design and to source (see **Confirmed sound**). Two findings are substantive; the rest are accuracy/sync fixes.

## Correctness / drift risk

### 1. D6's "universal-fields is a shared leaf" is contradicted by the Files-changed list and by Task 5 — so the modal and the check page will hold two independent copies of the universal-fields wiring

> **Resolved.** Reframed D6 rather than reconciling the shared-leaf list: the modal and the workspace check page are now **two entirely separate components** — they have diverged too far (compact one-card modal vs three-column page) for shared-leaf extraction to pay off. D6 rewritten to drop the "split into shared leaves / can't drift" premise and record the rejection of that approach (extraction machinery + an extra refactor task for no real reuse). `check-action-surface.yaml` (the modal) is now **untouched**; the workspace check page is authored standalone (Task 8), duplicating the few controls it needs and copying the modal's mode-derivation ladder (D3). Part 24's `universal-fields` is still reused as the independent component it already is. Knock-on edits: proposed-change item 4, Files-changed (`:177`), Part 40 dep, Verification, Non-goals; **Task 5 deleted** (its only deliverable was the now-rejected extraction); Task 8 rewritten to author standalone; `tasks.md` row/graph updated (Task 8 deps `5,6,7`→`6,7`). This moots finding #1's universal-fields under-specification — there is no shared leaf to specify.

D6 (`design.md:50`) names **"the universal-fields component"** as one of the shared leaf components both compositions share, and `design.md:55` makes the load-bearing promise: _"both read the same leaves, so behaviour can't drift."_ But the two places that enumerate what gets **extracted** omit it:

- Files-changed, `check-action-surface.yaml` line (`design.md:175`): _"extract the shared leaves (signal-button bar, comment input, status-history list, mode derivation)"_ — no universal-fields.
- Part 40 dependency (`design.md:211`): _"the leaves (signal buttons, comment, status history, mode derivation)"_ — no universal-fields.

Task 5 (`05-split-check-action-surface.md:24-40`) follows 175/211 and extracts only those four leaves. As a result Task 8 (`08-check-page-template.md:60-63`) **re-authors** the universal-fields composition by hand — and under-specifies it: it passes only `kind`, `state_path: current_action.fields`, "`current_action.*` data", and `workflow_type`. The live composition it must reproduce (`check-action-surface.yaml:142-176`) additionally requires:

- `mode` — a **runtime** `_if` on `_state: current_action.allowed.edit` → `edit`/`display` (the component's own header, `universal-fields.yaml:13-16`, stresses check mode is gated at runtime, never `_build.*`);
- `action_id: _state: current_action._id`;
- `allowed_edit: _state: current_action.allowed.edit`;
- `on_complete`;
- a structured `action_data` map (`assignees`/`due_date`/`description`/`assignee_docs` each off `current_action.*`).

Two hand-maintained copies of this ~25-line wiring (modal body + check page) are exactly the drift D6 says is prevented. **Fix:** extract the universal-fields **composition wrapper** (the `_ref` block + its full var wiring) as a Task 5 leaf that both the modal body and the check page `_ref`; reconcile `design.md:175` and `:211` to list universal-fields among the extracted leaves (matching `:50`); and have Task 8 (and Task 9's RHS) reference that leaf instead of re-authoring the vars. If the team would rather keep them separate, then drop universal-fields from D6's leaf list (`:50`) and the "can't drift" claim, and have Task 8 enumerate the **full** var contract above — but the shared-leaf route is what D6 commits to.

### 2. Part 57 (lands first) has not absorbed the two amendments Part 56 depends on, and Part 57's own text still describes the incompatible behaviour

> **Resolved.** Pushed both amendments up into Part 57's design (`57-inline-entity-config/design.md`): (a) added `makeActionPages.js` to its Files-changed — Part 57 now owns moving the existing `:86` `workflow.entity_collection` read to the nested `workflow.entity.collection`; (b) changed its carry from a three-field whitelist to "carry the `entity` routing remainder **wholesale**" (every non-lifted field, so optional fields like `name_field` survive) — updated in proposed-change #4, the "authoring vs materialized shape" note, the Proposed-shape and Validation sections, and the `makeWorkflowsConfig.js` Files-changed bullet. Per the user's direction (the two parts **ship together**, so an intermediate broken state is acceptable), also **removed Part 56's defensive hedging** — no "support both shapes": Task 10's "either Part 57 fixes `:86` or this task owns the migration" and its step-2 self-update instruction, Task 4's "adjust it if it whitelists", Task 3's "if Part 57 not yet merged, coordinate", and the design's `makeActionPages`/`makeWorkflowsConfig` Files-changed + Part 57-dependency notes now all assume Part 57 has landed the contract.

Part 56 requires two things of its prerequisite, Part 57:

- **(a) `makeActionPages` must read the nested `entity.collection`/`entity.ref_key`.** The current flat read `entity_collection: workflow.entity_collection` (`makeActionPages.js:86`) goes stale the moment Part 57 changes the authored shape. Verified: Part 57's Files-changed (`57-inline-entity-config/design.md:143-156`) **omits `makeActionPages.js` entirely**, and Part 57 _does_ rewrite the demo workflow configs to the nested block (`:152`) — so after Part 57 merges, `:86` reads `undefined` until Part 56's Task 10 lands.
- **(b) `makeWorkflowsConfig` must carry the entity routing remainder _wholesale_** so D10's optional `name_field` survives onto `wfConfig.entity`. Verified: Part 57's design says it carries _"the routing fields (`page_id`, `id_query_key`, `title`)"_ (`57 design:12` and `:139`) — a three-field **whitelist** that drops `name_field`.

Part 56 owns both defensively — Task 10 Notes (`10-makeactionpages-emit-and-vars.md:82-88`): "either Part 57 fixes `:86` or this task owns the migration"; Task 4 step 4 (`04-config-validation.md:52-59`): "Verify Part 57's carry preserves `name_field` (and adjust it if it whitelists)." That's the right safety net. But because Part 57 ships **first** and its own design describes the incompatible behaviour, a Part 57 implementer following Part 57's design will (i) leave `:86` stale — breaking the demo's emitted action pages in the window between the two merges — and (ii) re-introduce the three-field whitelist that Task 4 then has to undo. **Fix:** push both amendments up into Part 57's design now — add `makeActionPages.js` to its Files-changed, and change its carry from a whitelist to "carry the `entity` routing remainder wholesale (so optional fields like `name_field` survive)." The contract should live in the prerequisite, not be retro-patched by the dependent.

## Accuracy / design-task sync

### 3. The design's Files-changed omits `modules/layout/components/page.yaml`, which must forward the new `description` var

> **Resolved (auto).** Added `modules/layout/components/page.yaml` to Files-changed (forward `description` into the `title-block` `_ref`, default `null`) and noted the forward in the Layout-module dependency (`:206`). Verified `page.yaml`'s `title-block` `_ref` uses an explicit var map (`:209-244`) that omits `description`, so the forward is mechanically required — matching what Task 1 already does.

`title-block.yaml` is `_ref`'d from `page.yaml` with an **explicit** var map (`page.yaml:209-244`: `title`, `doc`, `page_actions`, `type`, `status`, `status_enum`, `loading`, `show_back_button`, `back_link`). A page-level var not in that map never reaches `title-block`. So adding the `description` var (D8) requires editing **both** files, but the design's Files-changed (`design.md:170`) and the Layout-module dependency (`:205`) name only `title-block.yaml`. Task 1 catches this and adds the `page.yaml` forward (`01-title-block-description-var.md:36-40,54-57`) — good — but the design body is the source of truth and should list `modules/layout/components/page.yaml` too, so the dependency isn't "discovered" only via the task.

### 4. The form pages' existing action-scoped Activity card is being replaced by entity-scoped History, and the design never says so

> **Resolved.** Added a decision note to proposed-change item 3: the form pages' bottom Activity card is **removed** and replaced by the shell's entity-scoped History tab — an intentional broadening (action-scoped → entity-wide), not a drop, since every engine event carries both `references.action_ids` and `references.[entity_ref_key]` with the comment folded into the same doc (`planEventDispatch.js`), making entity History a strict superset. Cost (dilution on a busy entity) acknowledged and accepted. Task 9 step 4 (which removes the card) is unchanged — the design now owns the change rather than letting it surface only in a task.

Today each form template renders an **Activity** card via the _events_ module's `events-timeline`, scoped to the **action** (`view.yaml.njk:299-310`: `reference_field: action_ids`, `reference_value: _state.action._id`; the file's own comment: "events for this action, comments inline"). Part 56 removes it (Task 9 step 4, `09-form-templates-adopt-shell.md:63-64`) and the shell's History tab uses `workflows-events-timeline` scoped to the **entity** (`entity_ref_key`/`entity_id`). The design's shell section (`design.md:11`, the ASCII, the shell-var list) only ever describes entity-scoped History and **never mentions the Activity card it displaces** — the replacement surfaces only in a task.

This is **not** data loss: `planEventDispatch.js:258-261` writes every engine event with **both** `references.action_ids` _and_ `references.[entity_ref_key] = [entity_id]`, and folds the inline comment into that same doc (`:288`), so the action's own events and comments still appear in the entity-scoped History (which is a superset). So the change is a scope **broadening** (action-focused → entity-wide), with the cost that on a busy entity a single action's activity is diluted among the whole entity's events. **Fix:** add one line to the design (shell section or a decision note) acknowledging that form pages' action-scoped Activity card is replaced by entity-scoped History, and confirm the broadening is intended — so it reads as a decision, not an accidental drop. (It almost certainly is intended — it's the point of the "entity workspace" — but the design should own it.)

## Minor

### 5. Task 3's acceptance/prose says `findOne`, but the file's helper is `findDocs`

> **Resolved (auto).** Aligned all `findOne` wording on `findDocs` (`limit: 1`, `[doc] =` destructure — as the file's other reads do): design.md D10 (`:85`), Files-changed GetWorkflowAction line (`:178`), and Task 3 prose + AC (`03:35,50`). Verified `GetWorkflowAction.js` imports/uses only `findDocs`; no `findOne` exists in the file.

`GetWorkflowAction.js` imports and uses `findDocs` (`:2,128,159,177`); there is no `findOne` in the file. Task 3 step 2 correctly says "Use the existing `findDocs` helper" (`03-getworkflowaction-envelope.md:40`), but its own AC and the design (D10) describe "one projected `findOne`" (`:49-52`, `design.md:85`). Trivial, but align the wording on `findDocs` (with a `limit`/`[doc] =` destructure, as the file's other reads do) so an implementer doesn't hunt for a helper that isn't there.

## Confirmed sound

- **Task ordering / dependency graph** (`tasks.md:13-66`) is coherent: foundations 1–6 are genuinely independent; 7→3, 8→5/6/7, 9→1/6/7, 10→8/9/2, 11→10, 12→11. The page-id contract (`{workflow_type}-check`) is correctly pinned to agree across Task 2 (engine link) and Task 10 (emission).
- **Task 2 / D3 error-verb collapse** — matches review-1 #9's resolution; the retarget is confined to the check branch and the dedicated error-verb test is rewritten, per the design.
- **Task 4** correctly frames the `makeWorkflowsConfig` change as **validation** (not a strip) and confirms `entity_view` is excluded by the `pick(WORKFLOW_FIELDS)` allowlist — consistent with review-2 #4. It validates only that `slot` is a block ref (not the tree contents), matching D2.
- **Task 6 mount gate + state contract** — single normalized `_state.entity_id`, columns gated on `_ne [_state.entity_id, null]`; consistent with review-1 #2's resolution and the shipped shell-dependency contracts (`actions-on-entity` requires `entity_id`+`entity_collection`; `workflows-events-timeline` requires `reference_field`+`reference_value`).
- **Task 8 mode derivation** — correctly mandates the response-derived single-`SetState` pattern from `check-action-modal.yaml:50-64,98-146` (review-1 #8), and keeps the modal untouched (D6 / non-goal).
- **Task 1 `description` subtitle** — additive and backward-compatible: `description` set → shows it; null → existing change-stamp subtitle. Matches review-2 #2's resolution (title = baked action title, subtitle = `message`).
- **Task 3 `workflow_id` add** — `action.workflow_id` exists on the doc and is omitted from the envelope today (`GetWorkflowAction.js:233-260`); the one-line allowlist add is sound (review-2 confirmed-sound).
- **D6 leaf inventory** (signal-button bar, comment, status-history) — verified inline in `check-action-surface.yaml` today, matching Task 5's extraction targets (apart from the universal-fields omission in finding #1).

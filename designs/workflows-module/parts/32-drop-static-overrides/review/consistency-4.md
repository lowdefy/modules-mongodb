# Consistency Review 4

## Summary

Scanned the full file tree of Part 32 (design.md, review-1, review-2, consistency-3, tasks.md, six task files) for drift. Three inconsistencies found — all driven by Part 9 moving into `parts/_completed/` since this design was last touched, plus a stale inter-task number reference. Two auto-resolved; one substantive call (Part 9's edit approach) was confirmed with the user before applying.

## Files Reviewed

**Design:**

- `designs/workflows-module/parts/32-drop-static-overrides/design.md`

**Reviews (chronological):**

- `designs/workflows-module/parts/32-drop-static-overrides/review/review-1.md`
- `designs/workflows-module/parts/32-drop-static-overrides/review/review-2.md`
- `designs/workflows-module/parts/32-drop-static-overrides/review/consistency-3.md`

**Tasks:**

- `designs/workflows-module/parts/32-drop-static-overrides/tasks/tasks.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/01-update-concept-specs.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/02-update-neighbour-part-designs.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/03-drop-bake-in-makeWorkflowApis.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/04-drop-layer2-resolveTargetStatus.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/05-rewire-handleSubmit.md`
- `designs/workflows-module/parts/32-drop-static-overrides/tasks/06-cleanup-demo-and-config-comment.md`

**No supporting files / no plan directory.**

## Inconsistencies Found

### 1. Part 9 listed as "in progress" but has moved to `_completed/`

**Type:** Stale status / blocker
**Source of truth:** Filesystem (`designs/workflows-module/parts/_completed/09-hook-invocation/` exists; the in-flight `parts/09-hook-invocation/` path is gone per `git status` showing `D` on the old location and `??` on `_completed/09-hook-invocation/`).
**Files affected:**

- `design.md` § Parts touched table row for Part 9 (status column read "in progress").
- `design.md` § Migration paragraph ("Part 9 is still in flight and is edited directly").
- `design.md` § Depends on ("Land _after_ Part 9's first cut, or fold the collapse into Part 9 directly if it's still in flight").
- `tasks/02-update-neighbour-part-designs.md` — Context bullet for Part 9 ("in progress") and step 2 ("This part is 'in progress' per Part 32's table, so edit the body directly"), plus the file path used `parts/09-hook-invocation/design.md` instead of the `_completed/` path.

**The drift:** Part 9 has shipped since Part 32 was drafted. The "in flight" framing — and the direct-edit instructions in Task 2 — contradict `CLAUDE.md`'s convention that "designs under `designs/_completed/` are already implemented — treat as read-only history. Add notes documenting deviations if helpful, but handle any changes in a new design/task." Parts 4 and 13 (also in `_completed/`) already follow the deviation-note pattern; Part 9 was lagging because its status hadn't been reconciled.

**Resolution:** Confirmed with the user that Part 9 should match the Parts 4/13 pattern (deviation note rather than body rewrite). Applied:

- design.md table row: status → "shipped"; change column rewritten to "Add a top-of-file deviation note pointing at Part 32 … The code change … happens in Task 4; Part 9's design body is not rewritten."
- design.md § Migration: replaced "Parts 4 and 13 are in `_completed/`; … Part 9 is still in flight and is edited directly" with "All three are in `_completed/`; … the amendments are documented as top-of-file deviation notes against the shipped designs (handled by Task 2)."
- design.md § Depends on: replaced the "Land after Part 9's first cut, or fold the collapse into Part 9 directly if it's still in flight" branch with "shipped; this part amends the resolver code that Part 9 landed (the layer-2 branch in `resolveTargetStatus`)."
- Task 2 Context: Part 9 bullet rephrased ("shipped"), preface tightened to "All three are in `_completed/`, so per `CLAUDE.md` … each gets a top-of-file deviation note rather than a body rewrite."
- Task 2 step 2: replaced the direct-edit instructions (rewrite status-resolution section, drop the `action.interactions:` subsection, edit the abstract) with a single deviation-note block that names the 2-layer collapse, the dropped `action.interactions:` YAML override, the new runtime enum check inside `resolveTargetStatus`, and the `UserError(isReject: false)` classification (linking Part 29 § D5).
- Task 2 Acceptance Criteria: collapsed Part 9-specific body-rewrite assertions into a single "Parts 4, 9, and 13 each carry a single top-of-file deviation note" line; removed the grep-against-Part-9-body criteria that no longer apply.
- Task 2 Files: Part 9 path corrected to `_completed/09-hook-invocation/design.md`; change description switched from "collapse status layers, drop `action.interactions:` subsection, document runtime enum check" to "add deviation note at top covering the 2-layer collapse, the dropped `action.interactions:` override, and the new runtime enum check."
- Task 2 Notes: "That's why parts 4 and 13 get notes, not rewrites" → "All three parts get notes, not rewrites."

### 2. Stale scope note claiming task files still reference the broader (event-channel) scope

**Type:** Stale reference
**Source of truth:** Filesystem walk of `tasks/` — six task files, all status-only. The previously-existing `05-drop-layer2-mergeEventOverrides.md` (referenced in consistency-3.md) is gone, the numbering has been compacted, and every task file explicitly scopes its work to `interactions:` / status-only and leaves the `event_overrides:` channel untouched.
**Files affected:** `design.md` (Scope note line 7).
**The drift:** The Scope note ended with "The task files under [`tasks/`](./tasks/) still reference the broader scope and will need to be re-scoped before implementation." That sentence was true when written but the re-scope has happened — tasks.md's overview now leads with "The static action-YAML `event:` block stays" and every task file is event-channel-clean. The sentence misleads a reader into expecting work that's already complete.

**Resolution:** Dropped the trailing sentence from the design.md Scope note. The note still links to Part 33 and explains the de-scoping; the obsolete to-do is gone.

### 3. Task 4 references "Task 6 which rewires the handler" — stale task number

**Type:** Stale reference
**Source of truth:** Current task numbering in `tasks/` — Task 5 (`05-rewire-handleSubmit.md`) is the handler rewire; Task 6 is the demo-and-config-comment cleanup.
**Files affected:** `tasks/04-drop-layer2-resolveTargetStatus.md` Notes section.
**The drift:** Before the event-channel re-scope, the handler rewire was Task 6 (because Task 5 was the dropped `mergeEventOverrides` task — see consistency-3.md's file listing). After the re-scope, the numbering compacted but Task 4's Notes still pointed at "Task 6 which rewires the handler."

**Resolution:** Updated the reference to "Task 5 which rewires the handler."

## No Issues

The following cross-cuts were checked and are consistent:

- **Status-only scope** — every task file scopes to `interactions:` / status and explicitly leaves `event_overrides:` untouched. tasks.md's overview spells this out.
- **Part 9 path** — design.md, Task 2, and Task 4 now consistently use `parts/_completed/09-hook-invocation/design.md`. (One Part 9 reference in design.md's prose [§ "Removes one layer from the status resolver in [part 9](…)"] was already correct.)
- **`resolveTargetStatus` naming (R2 finding #2)** — no stale `mergeStatus` references survived; this stayed clean.
- **Layer count** — design, Task 1, Task 2 (post-edit), Task 4 all describe a 2-layer (engine default + pre-hook) status resolver post-collapse.
- **`UserError` helper** — Task 4 still mandates the local `SubmitWorkflowAction/UserError.js`; Task 2's new Part 9 deviation note correctly cites `UserError(isReject: false)` and links Part 29 § D5.
- **Demo behavioural side-effect note (R2 finding #5)** — design.md § Parts touched demo row and Task 6 acceptance criterion #5 both surface the `request_changes` → `changes-required` change.
- **Inter-task dependency chain** — tasks.md's ordering rationale (3 + 4 parallel; 5 depends on 4; 6 depends on 3 + 5) matches the task headers and the dependency columns.
- **Review files skipped note** — tasks.md's note already cites both reviews plus consistency-3.md and explains the supersession; consistency-4.md doesn't need to be added (it's a consistency pass, not a review with findings to apply).
- **Part 33 link** — design.md § Scope note, § Out of scope, § Out of scope / deferred, and tasks all link to `../33-comment-rendering/design.md`; the file exists.

# Consistency Review 1

## Summary

Reviewed part-04's full file tree (design.md + 3 task files + 1 review). Found 13 inconsistencies — all resolved. 10 auto-resolved (task files describing implementation that diverged from what shipped); 3 design.md updates approved by user (validator list deferrals, display-merge channel separation, open-question annotation).

## Files Reviewed

**Design:**
- `design.md`

**Tasks:**
- `tasks/tasks.md`
- `tasks/01-enum-yamls.md`
- `tasks/02-make-workflows-config.md`
- `tasks/03-workflow-api-schema-extend.md`

**Reviews:**
- `review/review-1.md`

## Inconsistencies Found

### 1. `tasks.md` claimed "no validators in v1"

**Type:** Design-vs-Task
**Source of truth:** Implementation (7 validators shipped in `makeWorkflowsConfig.js`) and review-1 finding #1 resolution (schema tightened too)
**Files affected:** `tasks/tasks.md` lines 9, 33
**Resolution:** Updated tasks.md to document the 7 shipped validators and which validator is deferred.

### 2. `tasks.md` claimed "no display-override merge in v1"

**Type:** Design-vs-Task
**Source of truth:** Implementation (`_build.object.assign` ships in `module.lowdefy.yaml`)
**Files affected:** `tasks/tasks.md` lines 10, 34
**Resolution:** Updated tasks.md to describe channel-separation merge approach.

### 3. `02-make-workflows-config.md` framed resolver as pure pass-through

**Type:** Design-vs-Task
**Source of truth:** Implementation (resolver whitelists 10 action fields; 7 validators)
**Files affected:** `tasks/02-make-workflows-config.md` lines 22-27, 87-91, 56-85 (skeleton)
**Resolution:** Rewrote scope section, normalized shape section, validators list, and skeleton code to match shipped behavior.

### 4. `02-make-workflows-config.md` claimed action fields are NOT individually copied

**Type:** Design-vs-Task
**Source of truth:** Implementation (`ACTION_FIELDS` 10-entry whitelist)
**Files affected:** `tasks/02-make-workflows-config.md` line 90
**Resolution:** Replaced pass-through claim with whitelist documentation.

### 5. `02-make-workflows-config.md` skeleton missing validators and field whitelist

**Type:** Design-vs-Task
**Source of truth:** Implementation
**Files affected:** `tasks/02-make-workflows-config.md` lines 58-85
**Resolution:** Replaced skeleton with approximate shape including `ACTION_FIELDS`, `WORKFLOW_FIELDS`, `ACTION_KINDS`, `ACTION_STATUSES`, `validateWorkflow`, `validateAction`.

### 6. `03-workflow-api-schema-extend.md` schema fragment lacked required arrays

**Type:** Design-vs-Task
**Source of truth:** Review-1 finding #1 + implementation (`required: ['type', 'entity_type', 'starting_actions', 'actions']` + nested `actions.items.required: ['type', 'kind']`)
**Files affected:** `tasks/03-workflow-api-schema-extend.md` lines 36-50
**Resolution:** Updated `workflowsConfig` schema fragment to include nested required arrays.

### 7. `03-workflow-api-schema-extend.md` schema description missed shape doc

**Type:** Design-vs-Task
**Source of truth:** Review-1 finding #2 resolution (description note added)
**Files affected:** `tasks/03-workflow-api-schema-extend.md` description text
**Resolution:** Added shape documentation to the description.

### 8. `03-workflow-api-schema-extend.md` `actionsEnum` description called display fields "optional"

**Type:** Design-vs-Task
**Source of truth:** Review-1 finding #8 resolution
**Files affected:** `tasks/03-workflow-api-schema-extend.md` lines 60-63
**Resolution:** Updated description per finding #8.

### 9. `01-enum-yamls.md` said override merge lands in part 20

**Type:** Design-vs-Task
**Source of truth:** Implementation (merge in `module.lowdefy.yaml` ships now)
**Files affected:** `tasks/01-enum-yamls.md` line 7, lines 114-116
**Resolution:** Updated both spots to describe the channel-separation merge approach.

### 10. `01-enum-yamls.md` referenced obsolete `global` export wiring

**Type:** Stale Reference
**Source of truth:** Implementation (component exports in manifest)
**Files affected:** `tasks/01-enum-yamls.md` line 116
**Resolution:** Replaced with description of two-consumer pattern.

### 11. `design.md:32` asserts "unknown keys silently dropped" — implementation does NOT drop them

**Type:** Review-vs-Design (substantive)
**Source of truth:** Review-1 finding #3 resolution (switched to `_build.object.assign`, channel separation)
**Files affected:** `design.md:32`
**Resolution:** Updated design.md to describe channel separation. "Unknown keys silently dropped" is no longer the safety mechanism — engine reads canonical enum directly and can't see UI-side overrides.

### 12. `design.md:18-31` validator list — only 7 of ~8 shipped

**Type:** Review-vs-Design (substantive)
**Source of truth:** Implementation (7 validators) + design conversation
**Files affected:** `design.md:18-31`
**Resolution:** Updated validator list in design.md to reflect what shipped and what's deferred (blocked_by → part 7, verb whitelist → not shipped, hook auth → part 13).

### 13. `design.md:56` open question — answered but not annotated

**Type:** Review-vs-Design (small)
**Source of truth:** Engine spec confirms `connection.workflowsConfig` is the runtime delivery mechanism
**Files affected:** `design.md:56`
**Resolution:** Open question marked resolved in-place; references `engine/spec.md:72` and `engine/design.md:114`.

## No Issues

- The `module.lowdefy.yaml` comment (added per review #4) and the resolver whitelist comment (review #7) are consistent across implementation and review annotations.
- Review-1 annotations are internally consistent; no annotation contradicts another.
- The relationship between `action_statuses.yaml` (canonical) and the merged `action_statuses` component (UI) is consistently described in all updated task files.

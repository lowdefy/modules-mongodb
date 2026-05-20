# Consistency Review 2

## Summary

Second consistency pass following the post-task-decomposition edits: the `vars.app_name`-only validation rule (dropped template-existence + id-collision asserts), the error-verb regrouping with the other three verbs, and the part 12 + part 21 + part 22 cross-references. Five drift items found; all auto-resolved.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (10 findings, all annotated), `review/consistency-1.md`
- **Tasks:** `tasks/tasks.md`, `tasks/01-placeholder-templates.md`, `tasks/02-make-action-pages.md`, `tasks/03-manifest-wiring.md`
- **Cross-references checked:** `parts/04-workflow-config-schema/tasks/tasks.md`, `parts/21-entity-type-to-collection/design.md`, `parts/22-workflows-e2e-suite/design.md` (verified existence)

## Inconsistencies Found

### 1. "Two inputs" framing in design.md contradicted task 2's "one input" clarification

**Type:** Design-vs-Task contradiction
**Source of truth:** Task 2's input-contract section (signed off by user) — single raw-YAML input; part 4's narrowing is not consumed by part 12.
**Files affected:** `design.md` (`makeActionPages.js` In-scope intro)
**Resolution:** Rewrote design.md:15–18 to describe one input — the raw `workflows_config` YAML — and note that part 4 narrows the same YAML for the connection but part 12 does not consume that output. This matches the implementation contract in task 2 and removes the contradiction. The follow-on `action_config` bullet (design.md:26) was also reworded to drop the "merged with" framing in favor of "all picked from the raw action YAML."

### 2. Task 2 Notes mentioned removed build-time checks

**Type:** Stale Reference
**Source of truth:** Latest design ("No template-existence or page-id-collision asserts.")
**Files affected:** `tasks/02-make-action-pages.md` Notes section
**Resolution:** Dropped "template existence, id collisions" from the "resolver-specific checks" sentence. Now reads: "only adds its own `app_name` presence check." Also trimmed the no-new-dependencies bullet — `node:fs`, `node:path`, `node:url` were listed as built-ins for the removed assertions; only `node:test` and `node:assert` remain relevant.

### 3. Task 2 acceptance-criteria miscounted "six pages" with a duplicate id

**Type:** Internal Contradiction (within task 2)
**Source of truth:** The verb-gating math against the worked-example fixture.
**Files affected:** `tasks/02-make-action-pages.md` Acceptance Criteria
**Resolution:** Corrected to "five pages" with the actual id list: `onboarding-qualify-edit`, `onboarding-qualify-view`, `onboarding-send-quote-edit`, `onboarding-send-quote-view`, `onboarding-send-quote-review`. Added explicit "`schedule-followup` and `track-installation` emit nothing." The old "six pages" included a duplicate `onboarding-qualify-edit`.

### 4. `tasks/tasks.md` "Design clarification" section made moot by design.md update

**Type:** Section made moot by decisions (skill phase 3g)
**Source of truth:** design.md now describes the single-input contract directly.
**Files affected:** `tasks/tasks.md`
**Resolution:** Removed the "Design clarification surfaced during decomposition" section. It existed to flag a contradiction between the design (then "two inputs") and the task (one input). With design.md updated in fix #1, the contradiction is gone and the section was just describing history.

### 5. Task 2 "Input contract — design clarification" section similarly moot

**Type:** Section made moot by decisions (skill phase 3g)
**Source of truth:** design.md now describes the single-input contract.
**Files affected:** `tasks/02-make-action-pages.md`
**Resolution:** Renamed the section to "Input contract" and rewrote the body to state the single-input rule directly, without referencing the prior "two inputs" framing. Also updated two `design.md:23` references to "design.md verb-gating paragraph" since line numbers shifted during the recent edits — line-anchored references rot quickly when the design body changes.

## Stale claim in consistency-1.md (noted, not edited)

Consistency-1 line 44 says "Cross-workflow id-collision assertion retained (design.md:52); finding #8 rejected only the _static-page_ extension, not the original assertion." This is now stale — the assertion has since been removed at the user's direction. The historical consistency-1 record is preserved as-is per the convention that consistency reports are point-in-time artifacts; the assertion's removal is documented in design.md's current state and in this report.

## No Issues

Areas checked where everything was consistent:

- **Verb-gating rules** (design.md:22) — `error` regrouped with other verbs; matches task 2 test #2 and the concept ui spec.
- **Build-time validation** (design.md:46) — single `app_name` check; matches task 2.
- **Placeholder-templates rationale** (design.md:42) — matches task 1's context section.
- **Page-ids per-verb gating** — design.md:28 and task 2 test #7 agree on emitted-verbs-only.
- **Cross-reference to part 22** (design.md:70) — verified part 22's `design.md` exists.
- **Cross-reference to part 21** — design.md:27, design.md:59 (Depends on), Contract to neighbours all consistent.
- **`entity_id` clarification** (design.md:34) — still accurate post part 21.
- **Task 3 manifest shape** — matches `workflows-module-concept/module-surface/spec.md:100–105`.
- **Open questions** (design.md:74) — only the per-action template-override question remains; consistent with finding #10 (form-stub question closed).

# Consistency Review 1

## Summary

Cross-checked the part-12 design body against review-1's resolution annotations. Three drift items found; all auto-resolved against review-1 as the source of truth.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (10 findings — 7 resolved, 1 resolved by new part 21, 2 rejected)
- **Tasks / plans:** none yet (part 12 not yet decomposed into tasks)
- **Cross-references checked:** `parts/04-workflow-config-schema/tasks/tasks.md` (raw-vs-normalized contract), `parts/21-entity-type-to-collection/design.md` (entity-identity simplification), `parts/16-page-templates/design.md` (templates contract)

## Inconsistencies Found

### 1. `action_config` var shape under-specified after finding #3 resolution

**Type:** Internal Contradiction
**Source of truth:** Review-1 finding #3 (resolved — design now reads raw YAML for build-time-only fields in addition to normalized config)
**Files affected:** `design.md` (vars list)
**Resolution:** Updated the `action_config` bullet to state that it merges the part-4 normalized fields with the build-time-only fields (`pages`, `form`, `form_review`, `form_error`, `hooks`, `interactions`, `event`) read from raw YAML. Templates see one flat shape. Without this clarification, the design body says "reads two inputs" but the template-var description still called `action_config` "the action's normalized config" — readers would not know what's actually in it.

### 2. Build-time template-existence check phrasing stale after finding #10 resolution

**Type:** Stale Reference
**Source of truth:** Review-1 finding #10 (resolved — part 12 ships placeholder `.yaml.njk` files; part 16 replaces them)
**Files affected:** `design.md` (Build-time validation section)
**Resolution:** Replaced the original "(template files land in part 16, but the path check ships here so emission failures surface fast)" parenthetical with "Part 12 ships placeholder templates (see above) so this check passes from day one; part 16 replaces the placeholder bodies without changing the paths." The previous phrasing contradicted the new "Placeholder templates" section.

### 3. Contract-to-neighbours under-stated post finding #10 + part 21 split

**Type:** Design-vs-Design Drift
**Source of truth:** Review-1 finding #10 + new [part 21](../../21-entity-type-to-collection/design.md)
**Files affected:** `design.md` (Contract to neighbours section)
**Resolution:** Reworded the part 16 bullet to reflect the placeholder-replacement contract (part 12 ships placeholders, part 16 replaces bodies, paths unchanged). Added a new bullet for part 21's entity-identity simplification so the dependency in line 63 is mirrored in the contract section.

## No Issues

Areas checked where everything was consistent:

- **Verb-gating rules** (design.md:23–27) match the concept UI spec and review #1 / #5 resolutions.
- **`page_ids` per-verb gating** (design.md:33) consistent with finding #5 resolution.
- **`vars.app_name` validation** (design.md:50) consistent with finding #6 resolution.
- **Cross-workflow id-collision assertion** retained (design.md:52); finding #8 rejected only the *static-page* extension, not the original assertion.
- **Verification fixtures** (design.md:67–73) cleaned up per finding #9; no redundant tracker line.
- **Open questions** (design.md:77) — only the `pages.{verb}` template-override question remains; form-stub question correctly removed per finding #10.
- **`entity_id` clarification paragraph** (design.md:38) consistent with finding #2 resolution and the post-part-21 entity-identity shape.
- **Depends-on line** (design.md:63) correctly includes part 21.
- **Cross-reference to part 4's `tasks/tasks.md`** (design.md:18) verified — that file's task overview does state "Build-time-only fields are read by parts 12/13/15 from the raw workflow YAML, not from `workflowsConfig`."

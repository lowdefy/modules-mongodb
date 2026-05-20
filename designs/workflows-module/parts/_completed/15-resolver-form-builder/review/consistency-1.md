# Consistency Review 1

## Summary

Scanned part 15's design.md against review-1's resolutions, plus the neighbouring parts (12, 14, 16, 17), the top-level workflows-module design.md, and the implementation-plan. Found 7 inconsistencies — 2 internal to part-15 design.md, 2 in part 16, 1 in part 17, and 2 in the top-level design / implementation-plan. All auto-resolved.

## Files Reviewed

**Design (target):**

- [`designs/workflows-module/parts/15-resolver-form-builder/design.md`](../design.md)

**Review (target):**

- [`designs/workflows-module/parts/15-resolver-form-builder/review/review-1.md`](review-1.md) — 12 findings, all resolved.

**Neighbouring designs scanned for drift:**

- [`designs/workflows-module/design.md`](../../../design.md) — dep table, parts overview.
- [`designs/workflows-module/implementation-plan.md`](../../../implementation-plan.md) — wave structure.
- [`designs/workflows-module/parts/12-resolver-pages/design.md`](../../12-resolver-pages/design.md) — page shells emitting `action_config`.
- [`designs/workflows-module/parts/14-form-components-library/design.md`](../../14-form-components-library/design.md) — library contract.
- [`designs/workflows-module/parts/16-page-templates/design.md`](../../16-page-templates/design.md) — templates consuming the resolver.
- [`designs/workflows-module/parts/17-shared-pages/design.md`](../../17-shared-pages/design.md) — overview cards consuming `action_form_configs`.

**No tasks, plan, deep-dive, or supporting files exist for part 15.**

## Inconsistencies Found

### 1. Stale "flat (non-recursive) emitter" wording in part-15 design.md

**Type:** Internal contradiction
**Source of truth:** review-1 finding #5 resolution — fallback is "invoke resolver at module-manifest scope and emit onto `global.action_form_bodies`," not "flat emitter that doesn't recurse." JS-internal recursion ships either way.
**Files affected:** `parts/15-resolver-form-builder/design.md` line 12.
**Resolution:** Rewrote the Goal's third paragraph to describe the option-B fallback (manifest-scope invocation + `global.action_form_bodies` global), removing the "flat (non-recursive) emitter" phrasing.

### 2. Stale metadata-shape parenthetical in part-15 design.md

**Type:** Internal contradiction
**Source of truth:** review-1 finding #3 resolution — metadata nodes carry `{ component, key, required, title, validate }` plus a recursive `form:` array on structural components; `default` was dropped; `children:` was renamed to `form:`.
**Files affected:** `parts/15-resolver-form-builder/design.md` line 17 (Two emission paths bullet).
**Resolution:** Replaced "(component name, key, required, title, validate, default, nested children for structural components)" with the current shape: "(each node carries `component`, `key`, `required`, `title`, `validate`, plus a recursive `form:` array on structural components)."

### 3. Part 16 advertises a non-existent `global.action_form_configs` form-body path

**Type:** Design-vs-Design drift (neighbour stale after part-15 review)
**Source of truth:** review-1 finding #4 resolution — option B committed; `global.action_form_configs` is metadata-only.
**Files affected:** `parts/16-page-templates/design.md` line 15 (`edit.yaml.njk` form body).
**Resolution:** Rewrote the bullet to commit to `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form> } }` and explicitly note `global.action_form_configs` is not used for the form body.

### 4. Part 16 sources writable `form_review` block from the wrong global

**Type:** Design-vs-Design drift (neighbour stale)
**Source of truth:** review-1 finding #4 resolution — option B.
**Files affected:** `parts/16-page-templates/design.md` line 26 (`review.yaml.njk` writable `form_review`).
**Resolution:** Replaced "(from `global.action_form_configs.{action_type}.form_review`)" with the option-B path: `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form_review> } }`.

### 5. Part 17 overview-card body description doesn't reflect tree-shaped metadata

**Type:** Stale reference (works, but misleading post-rewrite)
**Source of truth:** review-1 finding #3 resolution — `action_form_configs.{action_type}.form` is now a metadata tree (`{ component, key, required, title, validate, form? }` nodes), not a substituted block tree.
**Files affected:** `parts/17-shared-pages/design.md` line 40 (workflow-overview card body).
**Resolution:** Clarified that the value is a metadata tree, added the consumer hint (switch on `component` to pick a renderer; recurse into nested `form:` on structural components — `controlled_list`, `section`, `box`, `label`, `file_upload`).

### 6. Top-level design.md dependency table lists stale deps for part 15

**Type:** Design-vs-Design drift
**Source of truth:** review-1 finding #11 resolution — part 12 added to part 15's "Depends on."
**Files affected:** `designs/workflows-module/design.md` line 79 (Dependency table).
**Resolution:** Updated `| 15 | resolver-form-builder | 4, 14 |` → `| 15 | resolver-form-builder | 4, 12, 14 |`.

### 7. Implementation-plan Wave 2 caption claims part 15 only depends on 2/4/14

**Type:** Stale reference
**Source of truth:** review-1 finding #11 — part 15 now also depends on part 12.
**Files affected:** `designs/workflows-module/implementation-plan.md` line 30 (Wave 2 caption).
**Resolution:** Rewrote the caption to call out resolver 15's new dep on parts 4/12/14 and to note Wave 2 placement still holds because part 12's contract stabilized early (tasks 1–2 already done).

## No Issues

- **Part 12** — no references to `makeActionsForm`, `makeActionFormConfigs`, or `action_form_configs`. The contract it owes (passing `form` / `form_review` / `form_error` through `action_config`) is already shipped in [makeActionPages.js:18-20](../../../../../modules/workflows/resolvers/makeActionPages.js).
- **Part 14** — no references to part-15 emission shapes. Sub-form var name (`blocks:`) stays in the library; the `form:` → `blocks:` rename lives entirely in part 15's resolver (per finding #1).
- **Top-level design.md parts overview / wave hard-gates** — no specific references to part 15's emission shape; only dep counts (now fixed above).
- **Open questions section in part 15 design.md** — matches review-1's spike-outcome resolution.
- **Verification section in part 15 design.md** — already updated by finding #12 resolution; no further drift.

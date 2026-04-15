# Consistency Review 4

## Summary

Checked design.md and all 8 task files against review-3 decisions (the most recent review). Found 9 inconsistencies across 4 files — all auto-resolved. The root cause: consistency-3 checked review-2 findings but review-3 hadn't been written yet, so review-3 decisions were never propagated.

## Files Reviewed

**Design:** design.md
**Reviews:** review/review-1.md, review/review-2.md, review/review-3.md, review/review-sam-1.md, review/consistency-2.md, review/consistency-3.md
**Tasks:** tasks/tasks.md, tasks/01 through tasks/08

## Inconsistencies Found

### 1. Task 6 view_user.yaml still had `extra` on view page identity header

**Type:** Design-vs-Task Drift
**Source of truth:** Review-3 finding #3 — removed `extra` from view page identity header; signed-up date and invite link live only in access sidebar tile
**Files affected:** tasks/06-user-admin-view-page.md
**Resolution:** Removed the `extra:` block (signed_up and invite_link paragraphs) from the identity header vars. Replaced with comment `# No extra — signed-up date and invite link are in the access sidebar tile`. Updated the description paragraph and acceptance criteria to match.

### 2. Task 6 view_access.yaml used old `__tag`/`__key`/`__value` callback syntax

**Type:** Design-vs-Task Drift
**Source of truth:** Review-3 finding #2 — rewrote callback using `_build.function` + `__build.args` pattern
**Files affected:** tasks/06-user-admin-view-page.md
**Resolution:** Replaced `__tag:` wrapper, `__key` index, `__value.value` visibility check, and `__value.label` content with `_build.function:` callback, `__build.args: 1` for index, `__build.args: 0` for both visibility check and tag content.

### 3. Task 6 view_access.yaml description said roles are `[{label, value}]`

**Type:** Design-vs-Task Drift
**Source of truth:** Review-3 finding #1 — roles kept as plain strings, rendered directly
**Files affected:** tasks/06-user-admin-view-page.md
**Resolution:** Changed "which provides `[{label, value}]` options" to "plain string array, e.g. `["mrm", "user-admin-demo"]`" and "filtered against the user's assigned roles" to "filtered by the user's assigned roles. Each role value is rendered directly as the tag content."

### 4. Task 2 attributes_view_config.yaml missing `component: text_area` on internal_details

**Type:** Design-vs-Task Drift
**Source of truth:** Review-3 finding #4 — added `component: text_area` to force longText rendering
**Files affected:** tasks/02-shared-attribute-configs.md
**Resolution:** Added `component: text_area` to the `internal_details` entry in the YAML example.

### 5. Task 2 note claimed long text auto-detects

**Type:** Design-vs-Task Drift
**Source of truth:** Review-3 finding #4 — auto-detection insufficient for short notes
**Files affected:** tasks/02-shared-attribute-configs.md
**Resolution:** Changed "Long text values auto-detect as `longText` and render with `span: "filled"` in DataDescriptions" to "The `component: text_area` hint forces `longText` rendering with `span: "filled"` in DataDescriptions, regardless of content length — without it, short notes (under 200 chars with no newlines) would render as inline `string` type."

### 6. Task 4 auto-detection claim for internal_details

**Type:** Design-vs-Task Drift
**Source of truth:** Review-3 finding #4
**Files affected:** tasks/04-contacts-detail-view.md
**Resolution:** Changed "DataDescriptions auto-detects long text as `longText` and renders with `span: "filled"`" to "The `component: text_area` hint forces `longText` rendering with `span: "filled"` regardless of content length." Also updated the example `attributes_view_config` entry to include `component: "text_area"`.

### 7. Design.md section 3 attributes_view_config example missing `internal_details` with `component: text_area`

**Type:** Internal Contradiction
**Source of truth:** Design.md section 7 (lines 704-724) — the definitive shared config listing
**Files affected:** design.md (section 3 consumer configuration example)
**Resolution:** Added `internal_details` entry with `component: text_area` to the section 3 example, matching section 7.

### 8. Design.md decision 4 claimed long text auto-detects

**Type:** Internal Contradiction
**Source of truth:** Design.md section 7 (line 726) — explicitly says `component: text_area` is needed
**Files affected:** design.md (decision 4)
**Resolution:** Changed "Long text auto-detects as `longText` and renders with `span: "filled"` in DataDescriptions" to "The `component: text_area` hint in the view config forces `longText` rendering with `span: "filled"` in DataDescriptions — auto-detection alone is insufficient for short notes."

### 9. Design.md file changes table omitted `view_invite_link.yaml` removal

**Type:** Stale Reference
**Source of truth:** Task 7 correctly lists 4 component deletions; design only listed 3
**Files affected:** design.md (user-admin file changes table)
**Resolution:** Added `view_invite_link.yaml | Remove (content moved into identity header extra and access tile).` to the table. Also updated `view_signed_up.yaml` entry from "Move content into access tile on view page" to "Remove (content moved into identity header extra and access tile)" for consistency with the other removal entries.

## No Issues

- **Review-1 resolutions** (findings 1-6): All still consistent — verified in consistency-2, confirmed still correct. ✓
- **Review-2 resolutions** (findings 1-6): All still consistent — verified in consistency-3, confirmed still correct. ✓
- **Review-3 finding #5** (column change documented): Design.md line 780 mentions column change. Task 4 YAML shows `column: 1`. ✓
- **Task 1** (identity header component): Uses file ref `path: modules/shared/layout/identity-header.yaml`. No review-3 impact. ✓
- **Task 3** (user-account profile): Uses `_user:` for attributes, `get_my_profile` for sign_up only. No review-3 impact. ✓
- **Task 5** (contacts form/API decouple): No identity header, roles, or auto-detection references. ✓
- **Task 7** (user-admin edit page): Uses `extra` for signed-up and invite link (correct — edit page has no sidebar). ✓
- **Task 8** (user-admin navigation): No review-3 impact. ✓
- **Design decisions 1-3, 5-10**: Consistent with reviews and task files. ✓

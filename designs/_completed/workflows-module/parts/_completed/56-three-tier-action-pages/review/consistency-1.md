# Consistency Review 1

## Summary

Checked the full file tree of Part 56 (design.md + review-1 + review-2) against the chronological decision register from both reviews. The design is a thorough post-review-2 rewrite and tracks every review decision faithfully. Found **2 inconsistencies**, both stale internal cross-references; both auto-resolved.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (9 findings, all annotated resolved/rejected), `review/review-2.md` (5 findings, all annotated resolved/accepted)
- **Tasks / plans:** none exist yet for this part.

## Decision Register (source-of-truth, latest first)

From review-2 (highest-numbered review):

- **R2#1 (Resolved, reshaped via Part 57):** `name_field` lives on the per-workflow `entity:` block (`entity.name_field`), not the connection `entities` map; reaches the connection via `additionalProperties: true` `workflowsConfig` → **no `schema.js` change**.
- **R2#2 (Resolved, reshaped):** title bar = **baked action title** (`page_config.title`); the action's **`message`** is the **subtitle**, via a new optional `description` var on `title-block`. Title is _not_ `message`.
- **R2#3 (Resolved auto):** workflow-grammar `title` already ships — no Part 4 schema change.
- **R2#4 (Resolved):** `makeWorkflowsConfig` does **not** strip `entity_view` (the `pick()` allowlist already excludes it); the real change is **validation**.
- **R2#5 (Accepted):** when History is the only RHS tab, the `Tabs` wrapper **stays** (single tab = section heading; stable layout) — _not_ rendered bare.

From review-1 (folded into the rewrite):

- **R1#1 (Resolved):** History sources `reference_field` from mandatory `workflow.entity_ref_key`; `entity_view` reduced to `{ slot }`.
- **R1#2 (Resolved):** one normalized `_state.entity_id` scalar; shell reads a single fixed path.
- **R1#3 (Rejected):** `_ref` is config-root-relative; example uses a config-root-relative path.
- **R1#4–7 (Resolved auto):** unit + e2e test blast radius enumerated; stale "canonical page" comments re-pointed.
- **R1#8–9 (Resolved auto):** response-derived single-`SetState` mode callout; `error`-verb collapse stated explicitly.

## Inconsistencies Found

### 1. Non-goal cites D5 for the read-only restriction

**Type:** Stale Reference
**Source of truth:** Proposed-change item 6 (line 16) commits "`entity_view` is read-only"; D5 (line 44) is "Option B recorded as considered-and-rejected" — unrelated.
**Files affected:** `design.md` (Non-goals, line 243).
**Resolution:** Changed `the slot is read-only (D5)` → `the slot is read-only (proposed change 6)`. Following the D5 link would have landed the reader on the Option-B rejection rather than the read-only decision.

### 2. Circular "D8 below" cross-reference inside the D8 section

**Type:** Stale Reference
**Source of truth:** The cited content (`message` as subtitle) lives in the "Title content" paragraph later in the same D8 section.
**Files affected:** `design.md` (D8, line 65).
**Resolution:** Changed `used for the action's \`message\`, D8 below`→`used for the action's \`message\`, see the "Title content" note below`. The old text pointed D8 at itself.

## No Issues

Everything else was consistent. Specifically confirmed in agreement with the decision register:

- **R2#1** — `name_field` on `entity.name_field`, "No connection `schema.js` change" stated in §7, D10, the `GetWorkflowAction`/`module.lowdefy.yaml` Files-changed lines, and the Part 57 dependency. No stale `entities[collection].name_field` references remain.
- **R2#2** — title = baked action title, subtitle = `message` via `description` var: consistent across proposed-change §7, D8 (opening + "Title content"), the shell state-contract note, Files-changed (templates + `title-block`), the Layout dependency, and Verification. No surviving "title is the action's `message`" claim.
- **R2#3** — workflow-grammar `title` documented as already-shipping / no schema change (Part 4 amends bullet, line 212).
- **R2#4** — `makeWorkflowsConfig` line frames the change as validation, not a strip (line 179).
- **R2#5** — `Tabs` wrapper "stays" when History is the lone tab (shell-var `details_slot`, line 127).
- **R1#1** — `reference_field` sourced from `entity_ref_key` everywhere (§5, shell vars, resolver line).
- **R1#2** — single normalized `_state.entity_id`; shell reads one fixed path (state-contract section).
- **R1#3** — config-shape example uses a config-root-relative `_ref`.
- **R1#4–7** — Files-changed enumerates the unit-test files (with cites), both e2e apps (`apps/demo`, `apps/workflows-test`), and the comment/doc re-pointing targets.
- **R1#8–9** — D3 carries the response-derived single-`SetState` callout and the `error`-verb collapse.
- D-heading inventory (D1–D10) is contiguous; all other inline D-cites resolve to the correct headings (the `D2/D3` on line 42 correctly refers to **Part 55**'s decisions, not this part's).
- Open questions and Non-goals (apart from finding #1) align with committed decisions.

# Consistency Review 1

## Summary

Scanned the full Part 39 tree (design.md, the supporting note, four reviews, nine task files) against the decision register built from reviews 1–4 (all findings carry `Resolved` / `Resolved (auto)` annotations; review-4 is the latest word). Found 4 inconsistencies, all auto-resolved — three design/task drifts where review-4 resolutions were applied to task files but not echoed back into design.md or a file's own summary, and one stale status note. No contradictions requiring user input.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** `edit-for-universal-fields.md` (the Part 24 reconciliation prompt — historical input, fully absorbed into design.md per review-2 #1/#2)
- **Reviews:** `review/review-1.md`, `review-2.md`, `review-3.md`, `review-4.md` (all findings annotated Resolved)
- **Tasks:** `tasks/tasks.md`, `01`–`08`
- **Plans:** none (no `plan/` directory)
- **Cross-referenced:** all eight relative design links in design.md verified to resolve (Parts 38/24/36, Part 22 under `_next/`, parent design, the three concept docs)

## Inconsistencies Found

### 1. Design's concept-doc reconciliation list missing review-4 #7's four residual edits

**Type:** Design-vs-Task
**Source of truth:** review-4 #7 resolution → `tasks/08-doc-reconciliation.md` (§1 bullets 3–4, §2 bullet 3, §2b)
**Files affected:** `design.md` (Concept-doc reconciliation section; Files changed → Concept docs; Proposed change #5)
**Resolution:** Review-4 #7 extended task 8 with four edits the design's reconciliation list never recorded: `ui` D2's standard-payload enumeration (~118) drops `fields`; `ui` D2 prose (~130) and D3's floating-actions sentence (~219) go four→five verbs and gain `onProgress`; `ui` D4's `onRequestChanges` row gains `view`. Added a "count/enumeration sweep" bullet to the Concept-doc reconciliation section, item (d) to the Files-changed Concept-docs paragraph, and broadened Proposed change #5's residual summary (which had also omitted the `state-machine` gating fix already present in the section since review-1 #6 / review-4 #1).

### 2. `modules/workflows/package.json` in task 6's Files but absent from design's Files-changed table

**Type:** Design-vs-Task
**Source of truth:** review-4 #3 resolution → `tasks/06-fsm-guard-test-and-plugin-export.md` (Files)
**Files affected:** `design.md` (Files changed table)
**Resolution:** Added a `modules/workflows/package.json` row — `devDependencies: { "@lowdefy/modules-mongodb-plugins": "workspace:*", "js-yaml": "^4" }`, with the pnpm-strict-isolation rationale and the `prepare: pnpm build` note, matching task 6.

### 3. Task 8's Files row under-describes its own body

**Type:** Internal Contradiction (summary vs. body within one file)
**Source of truth:** task 8's own §1/§2/§2b instructions
**Files affected:** `tasks/08-doc-reconciliation.md` (Files section)
**Resolution:** The `ui/design.md` Files row read "D2 `progress` handler + new `view` row; D4 fifth verb", omitting the §1 prose edits (~118/~130), §2b's D3 edit (~219), and §2's `onRequestChanges`-row change. Row expanded to cover all of them.

### 4. tasks.md's "Review files skipped" note stale after reviews 3–4

**Type:** Stale Status/Blocker
**Source of truth:** review-3/-4 resolution annotations (both reviews were actioned directly into the task files)
**Files affected:** `tasks/tasks.md` (Scope)
**Resolution:** "Review files skipped: review-1.md, review-2.md" predates reviews 3–4 and now misleads (a reader could conclude reviews 3–4 were never considered). Rewritten to record that review-1/-2 were folded into design.md before task derivation and review-3/-4 were actioned directly into the task files and design.md.

## No Issues

- **Per-verb role gate (review-4 #1)** — design D2/D3/D4 samples and prose, tasks 2–5 samples, ACs, and Notes all test the verb-specific key (`action_allowed.edit`/`.review`/`.error`/`.view`); no bare-object comparison remains anywhere.
- **Guard-test `none`-row exclusion (review-4 #2)** — design D3's "stored statuses … excluding the table's `none` row" matches task 6's derivation filter and its `request_changes` failure explanation.
- **E2E case (b) (review-3 #2, review-4 #4)** — design Tests, task 7 body, and task 7 AC all use the `progress`-hidden / `submit`-visible pair on a `done` action; the vacuous `approve`-not-on-`edit` example is gone from both, and task 7 carries the explicit do-not-use note.
- **tasks.md task-7 row (review-4 #5)** — Depends On reads "2, 5"; the rationale walks the `view → Edit` path with the review-allowlist reasoning; the Files row points at `apps/demo/e2e/workflows/`.
- **`fields`-drop hygiene scope (review-2 #1/#2, review-3 #1)** — design line 24's enumeration includes `not_required`; the kind-based-guard rationale is consistent across "Why a dedicated part", D1, and the Related → Part 24 entry; per-template Files-changed rows and tasks 2–4 agree on payload drops and regex narrowings, including both inline+modal copies.
- **`form` stays (review-3 #4)** — D1's "Why `fields` drops but `form` stays" is consistent with task 3's "keeps `form` and `form_review`" note and task 5's payload.
- **Opt-in defaults (review-1 #5/#6)** — D3's per-instance table (`not_required` and view `request_changes` default `false`) matches tasks 2 and 5 and the README spec in task 8 §4.
- **Edit-nav gating (review-1 #3, review-3 #3)** — design D4 and task 5 agree: `Link` visible on `page_ids.edit` presence, not access-gated, sets `skip_status_redirect: true`.
- **`./fsm` export ownership (review-2 #4, review-3 re-confirm)** — design D3, the plugin `package.json` Files row, and task 6 all place the export in this part; Part 38's design is untouched.
- **Enum content (task 1 vs design D3)** — identical six-signal map, identical `error`-signal omission note; task 1's enum-directory note matches review-4 #6's correction.
- **Cross-references** — all relative links in design.md resolve; no references to rejected approaches (runtime `_global` wiring, coarse role gate, plugin-side guard test, priority rule) survive outside the historical review annotations.

# Consistency Review 1

## Summary

Checked `design.md` and the session task list (tasks #1–#10) against the review-1 decision register (11 findings, all annotated Resolved / Resolved (auto)). Found 7 inconsistencies — 4 in `design.md`, 3 in task descriptions — all auto-resolved; nothing required a user decision. Ran 2026-07-22, immediately after the review-1 action review.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md` (11 findings, all annotated)
- **Tasks:** session task list #1–#10 (no `tasks/` directory exists; tasks #1, #2, #3, #4, #6, #10 were already synced during the action review — verified consistent; #5, #7, #8, #9 checked this pass)
- **Supporting / plans:** none exist

## Inconsistencies Found

### 1. §What-changes still gave `export-data` a contract

**Type:** Internal Contradiction (leftover from review-1 finding #6)
**Source of truth:** review-1 #6 resolution — exports carry no contract
**Files affected:** `design.md` §What-changes
**Resolution:** "`render-chart` / `generate-report` / `export-data` payload schemas and validators accept `{ collection, pipeline }` + contract" → render-chart/generate-report take pipeline + contract, "`export-data` accepts the pipeline alone."

### 2. Proposed-change 3 listed deferred stages as recursion targets without qualification

**Type:** Stale Reference
**Source of truth:** Resolved question 6 (`$unionWith`/`$graphLookup` deferred) and the §2 stage table
**Files affected:** `design.md` proposed-change 3
**Resolution:** Recursion list now reads "`$lookup.pipeline`, `$facet` — and `$unionWith`/`$graphLookup` if those deferred stages are ever enabled", matching §4's phrasing.

### 3. Proposed-change 6 capped a stage that no longer ships

**Type:** Stale Reference
**Source of truth:** Resolved question 6 + §6 structural caps (max `$lookup` count only)
**Files affected:** `design.md` proposed-change 6
**Resolution:** "structural caps (max stages, sub-pipeline depth, `$lookup`/`$unionWith` count)" → "`$lookup` count".

### 4. Proposed-change 4 said every collection "must be declared and role-gated"

**Type:** Review-vs-Design Drift (review-1 finding #3)
**Source of truth:** review-1 #3 resolution — role-gating is opt-in; absent/empty `roles` = any authenticated user
**Files affected:** `design.md` proposed-change 4
**Resolution:** Reworded to "must be declared; the engine enforces the union of those collections' role requirements (role-gating itself is opt-in per collection — an entry with no `roles` is open to any authenticated user)."

### 5. Task #5 wired the catalog into the query-data request

**Type:** Design-vs-Task Drift (review-1 finding #7)
**Source of truth:** review-1 #7 resolution — catalog binds at the ReportingData connection
**Files affected:** Task #5 description
**Resolution:** Now states the endpoint passes only `roles: { _user: roles }` and the catalog comes from the connection (task 3); also notes `export_data` carries no contract in the agent tool contracts (finding #6).

### 6. Task #8 (docs) missed the empty-roles semantics and fail-closed draft

**Type:** Design-vs-Task Drift (review-1 finding #3)
**Source of truth:** review-1 #3 resolution
**Files affected:** Task #8 description
**Resolution:** Catalog reference docs now cover empty-roles semantics; bootstrap workflow docs now cover the commented-out (fail-closed) draft.

### 7. Task #9 (deployment docs) missed the MongoDB ≥ 5.0 floor

**Type:** Design-vs-Task Drift (review-1 finding #8)
**Source of truth:** review-1 #8 resolution — persisted pipelines store `$`-prefixed field names, allowed from MongoDB 5.0
**Files affected:** Task #9 description
**Resolution:** Deployment docs task now includes the minimum-version note for the app database holding saved reports.

## No Issues

- All 11 review-1 annotations accurately describe what `design.md` now says (walk rules in §3b, untrusted triples in §Filter-binding, fail-closed bootstrap in §Catalog-authoring, empty-result verification in §Declared-presentation-contract, tag-drop note, connection-level catalog in Architecture step 3 and Files-changed, BSON/opaque-scalars in §0, conversation-downloads waiver, `$densify` deferral in §2/§6/Risks, files-changed additions).
- `$densify` appears only in the deferred row, the §6 decision record, and §3's illustration of MongoDB's expression-bearing surface (describing MongoDB generally, not the allowlist) — no stale "allowed" references.
- Resolved questions 1–6, Non-goals, and Risks are internally consistent with the updated body.
- The validator signature (`validatePipeline({ collection, pipeline, catalog, roles })`) remains correct under connection-level catalog binding — the request resolves the catalog from connection properties and passes it to the pure function.
- Tasks #1, #2, #3, #4, #6, #10 (synced during action review) verified against the final design text — consistent, including dependency edges.
- "Current state" section correctly describes today's code in the present tense (verified against source earlier in review-1); no false claims introduced by the edits.

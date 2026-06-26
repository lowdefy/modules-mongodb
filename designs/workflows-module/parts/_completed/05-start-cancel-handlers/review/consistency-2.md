# Consistency Review 2

## Summary

Walked the full part-05 tree against the review-1 decision register (14 findings, 13 resolved + 1 rejected). Found 2 internal drift issues — both auto-resolved. No tasks/ or plan/ directories exist; design ↔ review consistency is the only surface.

## Files Reviewed

**Design:**

- `parts/05-start-cancel-handlers/design.md`

**Reviews:**

- `parts/05-start-cancel-handlers/review/review-1.md` (14 findings, all annotated)

**Tasks / Plans:** none.

**Cross-referenced (read-only for anchor verification):**

- `parts/04-workflow-config-schema/design.md`, `review/review-1.md`
- `parts/07-group-state-machine/design.md` (specifically `### \`CancelWorkflow\` integration`)
- `parts/22-workflows-e2e-suite/design.md`
- `workflows-module-concept/engine/spec.md` (anchors: `#capabilities`, `#client-and-transaction-model`, `#idempotency`, `#references-write-contract`)

## Inconsistencies Found

### 1. Parent-link validation duplicated between the `Validation` block and the `Parent linking` write description

**Type:** Internal Contradiction (within `design.md`)
**Source of truth:** the `Validation` block at `design.md:18-21` (lists all three rules: `kind: tracker`, `child_workflow_id` null, `tracker.workflow_type` match).
**Files affected:** `design.md:25` restated only two of the three rules, omitting the `workflow_type` match added by review-1 finding #9. After the review's Validation-block addition, the `Parent linking` bullet's "Validate that the parent action is kind: tracker and has null child_workflow_id before linking" became a stale restatement.
**Resolution:** Stripped the validation restatement from the `Parent linking` bullet. Replaced with a "When `parent_action_id` is set (and the Validation block above passes), also write…" pointer. The `Parent linking` bullet now describes only the writes; the validation block owns the conditions. Single source of truth.

### 2. "Out of scope" entry for cancel group recompute was duller than the body cross-reference

**Type:** Stale Status / Cross-Reference
**Source of truth:** `design.md:39` body — already cross-referenced part 7's `#cancelworkflow-integration` anchor after the review-1 #13 tightening.
**Files affected:** `design.md:56` listed "Group recompute on cancel → part 7" with no anchor. Technically correct but less precise than the body. Readers scanning the out-of-scope list would see a vague deferral, then have to find the body to learn it's owned by a specific part-7 section.
**Resolution:** Updated the out-of-scope entry to match the body's precision: "Group recompute on cancel → owned by part 7's CancelWorkflow integration; this handler updates `summary` only." Both sites now point at the same anchor.

## No Issues

Confirming coverage of the rest of the decision register — every review-1 resolution propagated correctly:

- **#1** (drop `parent_entity_*` from payload) — `design.md:15` matches.
- **#2** (spell each parent-side write field with source) — `design.md:25` matches (after the cleanup in inconsistency 1).
- **#3** (strike "atomic") — `design.md:25` matches.
- **#4** (option C — accept half-linked state) — `design.md:26` matches.
- **#5** (option A — accept non-idempotent) — `design.md:28` matches; verification's "Idempotent retry" line struck.
- **#6** (keyed-action check in part-05 runtime) — `design.md:18-20` matches; open question struck.
- **#7** (initial `summary` from just-built actions) — `design.md:23` matches.
- **#8** (`display_order` added) — `design.md:23` matches.
- **#9** (`workflow_type` match validation) — `design.md:21` + verification at `design.md:71` match.
- **#10** (`changeStamp` connection schema section) — `design.md:43-45` matches.
- **#11** (`force: true` on parent push) — `design.md:25` matches.
- **#12** (cancel `references` reserved-key merge order) — `design.md:35` matches.
- **#13** (rejected — part 7 already covers it) — cross-reference at `design.md:39` matches.
- **#14** (helpers in `src/connections/shared/`) — `design.md:47` heading + body + contract at `design.md:85` match.

**Anchor / link verification:**

- All concept-spec anchors (`#capabilities`, `#client-and-transaction-model`, `#idempotency`, `#references-write-contract`) resolve to real headings.
- The part 7 anchor (`#cancelworkflow-integration`) resolves to `### \`CancelWorkflow\` integration`.
- Cross-references to parts 6, 7, 8, 10, 19, 22 and the part-04 review-1 file are all live.

**Open question audit:** only "cancellation idempotency lean" remains; recorded as a v1 lean rather than blocking.

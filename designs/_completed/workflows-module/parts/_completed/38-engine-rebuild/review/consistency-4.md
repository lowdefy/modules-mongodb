# Consistency Review 4

## Summary

Checked Part 38's full file tree (design.md + three review files; no supporting,
task, or plan files exist yet) against the decision register extracted from reviews
1–3. One internal contradiction found and auto-resolved (stale `getMongoDb.js`
description in Files-changed). All other review decisions are correctly propagated
into the design.

## Files Reviewed

- **Design:** `design.md`
- **Reviews:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`
- **Supporting / tasks / plans:** none present in this design's tree.

## Inconsistencies Found

### 1. `getMongoDb.js` Files-changed description contradicts D8

**Type:** Internal Contradiction (stale reference)
**Source of truth:** review-1 #2 resolution → D8 ("Obtaining the `Db` and client").
**Files affected:** `design.md` Files-changed → `mongo/` (line 546).
**Resolution:** Auto-resolved. The Files-changed line read "`getMongoDb.js` —
extracts the raw `Db` reference from the plugin context," which is the pre-review-1
framing. Review-1 #2 rewrote D8 to establish that the community plugin exposes no
`MongoClient`/`Db` and creates a fresh client per request — so there is **nothing to
extract**; `getMongoDb.js` instead constructs and owns the engine's own cached
`MongoClient` from `databaseUri` and exposes both `context.mongoDb` and
`context.mongoClient`. Updated the Files-changed line to match D8.

## No Issues

Re-verified the following review decisions are fully propagated, with no residual
drift:

- **review-1 #1 / #5 (CAS):** D9 commits workflow-first (CAS as step 1, throws before
  any action write); D15 and the data-flow / worked-example commit blocks pin the
  `updated.timestamp` scalar. Consistent throughout.
- **review-1 #3 (concept drifts):** no `submit_edit` / `save_draft` / `target_status`
  / current-action-redirect terms remain; the worked example uses nullary `signal:
submit` and explicitly notes "no `target_status`."
- **review-1 #4 (kind naming):** `task` appears only in the Prerequisite line
  explaining the Part 35 rename and in `FSM tables key on simple (not task)`; all
  active references are `simple`. Part 35 sequencing and the `resolveTargetStatus.js`
  "renamed by Part 35, deleted here" annotation are present.
- **review-1 #6 (events write path):** data-flow step 3 shows `callApi('new-event',
…)` only — no `insertOneDoc(events, …)` remains; D7 reuses the community
  `log-changes` contract (no bespoke `change_log` collection).
- **review-1 #7 (tracker depth):** D10 carries a per-fire `depth` field, not a loop
  counter.
- **review-1 #8 / #9:** the retry-after-CAS-miss integration test is in the test
  strategy; D3 clarifies empty plans arise only from cascade/aux signals.
- **review-2 #1 (unblock-only cascade):** no `auto-block` / `unblock/block` framing
  survives; D4 states "The engine never auto-emits `block`" and names pre-hook
  `actions[]` as the only `block` source; `planAutoUnblock.js` description is
  unblock-only.
- **review-2 #2 (form_data merge):** captured as open question Q6 with the prod
  evidence, as decided.
- **review-2 #3 (lifecycle event context):** D12 specifies the distinct
  workflow-lifecycle render context and `planEventDispatch` branching; the test
  strategy asserts both context shapes separately.
- **review-2 #4 (schema.js descriptions):** the Connection-schema section and
  Files-changed entry both carry the `actionsEnum[].priority` and `changeLog`
  description rewrites.
- **review-2 #5 (FSM alias):** Files-changed specifies `FSM_TABLES.simple =
FSM_TABLES.form` (aliased, not copied); no "three tables" phrasing remains;
  `tables.test.js` asserts the alias identity.
- **review-3 #1 (`workflow-` prefix):** derived ids stay `{workflow_type}-…`
  (unprefixed, entry-scoped) in proposed-change items 5/14, D16,
  `makeActionPages`/`makeWorkflowApis` Files-changed; the `workflow-` prefix is
  inverted onto the fixed pages (`workflow-simple-*`, `workflow-group-overview`).
- **review-3 #2 / #3 (`hasReview` + live-edit hazard):** D4 pins the action-global
  `hasReview` rule (app-agnostic `resolveSignal`); D16 documents the access-drives-
  reachability V1 limitation; the multi-app integration test is in the test strategy.
- **review-3 #4 (shared role-gate oracle):** the `gates.fixtures.js` shared-oracle
  band is in the test strategy.
- **review-3 #5 (task-cluster split):** D16 carries the tasking note; design stays
  one part.
- **review-3 #6 (notification_roles):** deferred to Part 41 — Non-goal present;
  `getActionFields.js` correctly **not** added to Files-changed (per the resolution
  that superseded the review's original "add extractor" fix).
- **review-3 #7 (no backfill):** the in-flight action-doc backfill Non-goal is
  present and justified by the greenfield assumption.
- **review-3 #8 / #9:** annotation-only / D2 intentional-property note both present
  (the "do not move the check after the pre-hook" sentence is in D2).
  </content>
  </invoke>

# Review 2

## Validation gap

### 1. Reserved sentinel keys accept static strings — a stale `action_id` literal is the worst silent failure this feature can produce

> **Resolved.** `action_id` / `entity_id` are now sentinel-only in `start_link.urlQuery` — if present, their value must be exactly `true`; statics live on other keys. Design change 5 and task 1 (rule 4 + rejection test case) updated. Task 2 unchanged — substitution only swaps `true`, and validation guarantees no statics reach the reserved keys. Scope is `start_link` only: the custom-kind cell-link path carries the same sentinel, but `kind: custom` isn't a valid kind yet — the same rule belongs to whatever part makes it real.

Proposed change 5 (and task 1, which transcribes it) validates `urlQuery` values as "strings, or `true` on exactly the `action_id` / `entity_id` keys". The string arm applies to *every* key — including the two reserved ones. So `action_id: 'some-id'` and `entity_id: 'foo'` validate cleanly as "static params" and pass through verbatim (task 2: "string values verbatim").

A static string on `action_id` is never a legitimate authoring intent — the key exists solely to carry the tracker's own `_id` as `parent_action_id` — and the failure mode is worse than the `true`-on-wrong-key case change 5 already guards: the destination page's save flow reads `_url_query: action_id` and hands the literal to `start-workflow`, which looks it up (`StartWorkflow.js:121-125`) and, if it happens to match any real tracker (copy-pasted from a worked example, a stale test id), writes the bidirectional link onto the **wrong action** — cross-linking a child workflow to a tracker that never asked for it. `entity_id: 'foo'` similarly prefills a wrong parent reference into the child doc. Both ship silently; nothing downstream can tell a deliberate static from a typo.

**Fix:** in change 5, make the two reserved keys sentinel-only — if `action_id` or `entity_id` is present in `urlQuery`, its value must be exactly `true`; statics live on other keys. One extra rejection branch in `validateTrackerStartLink` (task 1) and one test case (`action_id: 'literal'` rejected). This matches change 5's own rationale ("would silently ship the literal `true` into a URL" — a wrong literal action id is strictly worse) and costs nothing: an author who genuinely wants a static param simply names it something else.

## Stale facts — the codebase moved under the design

### 2. The "Read-side dependency (Parts 38 + 42)" paragraph describes a dependency that has since landed

> **Resolved (auto).** Rewrote the paragraph as "landed": verb-selection now exists (`visible_verbs.yaml` + `resolve_action_link.yaml` on disk, all three read APIs ref the shared stage — verified in working tree), dropped the sequencing clause, and folded task 4's deviation back — the design now says Part 44 **creates** `resolve_action_link.test.js` with the tracker-row cases. Files-changed "Read APIs" row updated to match.

The paragraph (design line 138) makes three present-tense claims that were true when the design was written (committed `87dfe80`, 2026-06-02) and are false on `workflows-module` today:

- *"all three link-projecting read APIs … still project the legacy singular `{slug}.link`"* — all three now `_ref` the shared stage: `get-entity-workflows.yaml:38`, `get-workflow-overview.yaml:52`, `get-action-group-overview.yaml:33` (Part 42 task 4, commit `1d8a03a`), and project the resolved `link` it computes (`get-entity-workflows.yaml:76`).
- *"the shared `visible_verbs.yaml` compute stage that `api/stages/visible_verbs_filter.yaml:16` refs is not on disk"* — it is: `modules/shared/workflow/visible_verbs.yaml`, and `visible_verbs_filter.yaml:16` resolves to it (Part 38 task 7, commits `c5dcc83` / `643aa12`).
- *"Part 38's read side is still in flight … Part 44 therefore sequences after"* — the sequencing precondition is satisfied; `modules/shared/workflow/resolve_action_link.yaml` exists and does the `edit > review > error > view` pick over non-null cells ∩ `visible_verbs`, exactly as the paragraph anticipates.

Separately, the paragraph's *"Part 44 adds a tracker-row case to **its tests**"* assumes Part 42 left a test file for `resolve_action_link.yaml`. It didn't — no `resolve_action_link.test.js` exists anywhere (Part 42 shipped the stage untested). Task 4 already discovered this and flags it as a deviation ("the design says … assuming Part 42 left a test file. None exists, so this task creates it"), creating `modules/shared/workflow/resolve_action_link.test.js`. Per CLAUDE.md, designs are the source of truth — fold the deviation back: the design should say Part 44 **creates** the read-side test file with the tracker-row cases, not "adds a case".

**Fix:** rewrite the paragraph in past tense — the dependency landed; Part 44 needs no read-API change because the generic pick already surfaces `links.edit` for pre-child trackers; its read-side contribution is creating `resolve_action_link.test.js` (task 4). The Files-changed "Read APIs" row's "(see note below)" wording updates the same way.

### 3. Line references drifted — Part 38's StartWorkflow rebuild and `seedStage` work landed after the design was written

> **Resolved (auto).** Applied all eight corrections to design.md after re-verifying each against the working tree. Stale refs appeared only in design.md — task files don't transcribe them, and review-1 is left as history.

Every cited line number still points at the right code, but the offsets moved. Corrections (verified against the working tree):

| Design cite | Now |
| --- | --- |
| `computeEngineLinks.js:66-77` (tracker branch) | `computeEngineLinks.js:68-79` |
| `planActionTransition.js:118-121` (tracker narrowing) | `planActionTransition.js:156-159` |
| `planActionTransition.js:144` (`doc.access` refresh) | `planActionTransition.js:182` |
| `planActionTransition.js:158` (per-slug links persisted) | `planActionTransition.js:196-199` |
| `StartWorkflow.js:62-64` (non-null child throw) | `StartWorkflow.js:137-142` |
| `StartWorkflow.js:53-72` (parent checks: kind / null child / type match) | `StartWorkflow.js:119-149` |
| `fsm/tables.js:125-127` (`not-required` → `in-progress` via `internal_mirror_child_active`) | `fsm/tables.js:130-131` |
| `makeWorkflowsConfig.js:247` (`link:` hard-error in built-in cells) | `makeWorkflowsConfig.js:258-263` |

The substance of every claim checked out — only the anchors moved. Worth a sweep since implementers navigate by these.

## Verified (no finding — recorded so later reviews don't re-litigate)

- **`_module.pageId` in app-level `workflow_config` resolves at build** (D1 / proposed change 1): the object form `{ id, module }` is explicitly supported at app level (`lowdefy/packages/build/src/build/buildRefs/walker.js:385-407` — only the string form errors as ambiguous), and resolver-ref `vars` are resolved *before* the resolver runs (`walker.js:542-548`), so `makeWorkflowsConfig`'s `pageId: string` validation sees the resolved scoped id, never the operator object. Part 45's already-authored `track-company-setup` (`design/45-demo-rebuild` branch) uses exactly this form with both sentinels — the two designs align.
- **D5's "seeded at or unblocked into `action-required`"**: both paths run `planActionTransition` (seedStage mode in `StartWorkflow.js:179-191`; `planAutoUnblock.js` resolves `unblock` "as a full transition via `planActionTransition` — … recomputed links"), so the start link materialises and is later wholesale-replaced (`doc[slug] = { ...doc[slug], links }`) by the child-overview view link.
- **D3's "no app-callable get-action-by-id API"**: confirmed — `modules/workflows/api/` has no such endpoint.
- **Known-limitation claims**: `StartWorkflow.js:137-142` rejects re-link on non-null child; `fsm/tables.js:130-131` permits `not-required` → `in-progress` resurrect; Cancel sweeps via `internal_cancel_action` (`tables.js:119`). All as stated.

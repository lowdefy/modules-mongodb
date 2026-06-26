# Consistency Review 2

## Summary

Re-checked Part 46's full file tree after three changes that landed since `consistency-1` (which covered only review-1): review-2 was actioned, the `simple→check` rename was committed (b124fff), and an **uncommitted** edit pulled the D6 timeline port in-scope as a fifth method (`GetEventsTimeline`) and applied the method renames (`GetAction`→`GetWorkflowAction`, `GetActionGroupOverview`→`GetWorkflowActionGroupOverview`, request `get_action`→`get_workflow_action`, response field `action_allowed`/`visible_verbs`→`allowed`). Walked review-1, review-2, and the `todo-discuss.md` resolutions (A–G) as the decision register. **Zero inconsistencies found** — every decision is fully and consistently propagated into `design.md`, and the reciprocal cross-doc section in the tasks-module plan matches. No edits made.

## Files Reviewed

- **Design:** `design.md` (working copy, incl. uncommitted diff)
- **Supporting:** `todo-discuss.md` (working scratch file carrying resolutions A–G)
- **Reviews:** `review/review-1.md`, `review/review-2.md`
- **Prior consistency reports (context only, out of chronology):** `review/consistency-1.md`
- **Cross-doc referenced:** `workflows-module-concept/tasks-module-plan/design.md`
- **Tasks / Plans:** none yet

## Decision Register → propagation

### review-2 findings

| Finding            | Decision                                                                                                                                                                          | Landed in design.md                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| #1 (Resolved)      | Connection-property user mechanism; `createEngineContext` reads `connection.user`; files-changed `schema.js`/`workflow-api.yaml`/`createEngineContext.js`; submit-gate fix Ripple | "The read methods" (line 144), Ripple "Shipped submit gate" (line 183)                                            |
| #2 (Resolved)      | Declare `entities` + `user` as top-level connection properties in `schema.js`; config-field additions need no schema work (`additionalProperties: true`)                          | "The read methods" §3 (line 139), "Validated config additions" (line 168)                                         |
| #3 (Resolved)      | Read methods set `meta = { checkRead: false, checkWrite: false }` — both checks disabled, access lives in the engine verb gate                                                    | "The read methods" (line 144) — **supersedes** review-1 #4's "reject meta entirely"                               |
| #4 (Resolved)      | `allow_not_required` kind-agnostic, default `false`, opt-in, load-gate all kinds; form `not_required.visible` flips to default-`true` opt-out; migration rule                     | D5 term 3 (line 59), D5 form bullet (line 65), "Validated config additions" (line 162), Part 39 Ripple (line 182) |
| #5 (Resolved auto) | `cancel` example → `approve`                                                                                                                                                      | line 13, line 61                                                                                                  |
| #6 (Resolved)      | Point at `button_signal_sources.yaml`/`FSM_TABLES.form` as authoritative; restrict inversion to the six `SIGNAL_VERBS`                                                            | D5 term 1 (line 57), "The read methods" (line 144)                                                                |

### todo-discuss.md resolutions (A–G)

| Item  | Decision                                                                                                                                                                                                                                                                                                                            | Landed in design.md                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | `GetWorkflowAction` gates on `allowed.view`, returns `null` when false                                                                                                                                                                                                                                                              | D8 (line 102), "The read methods" §4 (line 140)                                                                                                                                                                                                                        |
| B     | One name `allowed` for the per-verb bag across all methods                                                                                                                                                                                                                                                                          | line 13, D8, read-methods table                                                                                                                                                                                                                                        |
| C     | `GetWorkflowAction` returns a curated allowlist (engine envelope + form-field values + resolved), not a raw-doc spread; no resolved `link`                                                                                                                                                                                          | D8 (lines 92–98), read-methods §4 (line 140), table (line 153)                                                                                                                                                                                                         |
| D     | No host-app migration for `entities`; connection reads the existing module var server-side; `makeWorkflowsConfig` coverage validator retained                                                                                                                                                                                       | "The read methods" §3 (line 139), current-state table (line 123), deletions (line 173)                                                                                                                                                                                 |
| E     | `GetEntityWorkflows` projects per-action `_id`/`kind`; overviews omit them; modal-host note                                                                                                                                                                                                                                         | read-methods table (line 150), modal-host note (line 159), Part 40 cross-part contract (line 184)                                                                                                                                                                      |
| F + G | D6 reshaped → timeline port pulled **into Part 46** as cross-stream `GetEventsTimeline`; ownership inverted to avoid the events⇄workflows cycle; all three YAML stages + events inline lookup deleted; `GetWorkflowAction` early-returns `null` for `workflow_id: null`; method renames qualify the shared-collection "action" noun | intro/size/repo (lines 3–5), proposal 1 (line 9), D2 (lines 32–34), D6 (lines 72–82), D8 workflow-scope (line 100), read-methods (lines 131, 142, 159), table (line 157), deletions (lines 175–176), Ripples (lines 185–186), Non-goals (line 192), Related (line 201) |

## Inconsistencies Found

None within Part 46's file tree.

Internal cross-checks that passed:

- **Naming fully renamed.** No `GetAction`/`GetActionGroupOverview`/`get_action` (bare) stragglers. `action_allowed` survives **only** as the name of the deleted client mirror's `_state.action_allowed.*` field (correct historical/migration references) and `visible_verbs` **only** as YAML filenames and "today's `visible_verbs`" historical references — both intended.
- **Method count consistent at five** across intro (line 3), proposal 1 (line 9), read-methods intro (line 131); "four workflow-scoped + one cross-stream" split is consistent (lines 9, 131, 142).
- **Size repriced to XL** everywhere — no `L–XL` stragglers; `modules/events/` added to repo scope (line 5) matching the D6/events-module Ripple.
- **No stale "deferred timeline port / accepted debt" language.** Every remaining "deferred"/"follow-up" mention now scopes to _task-specific_ timeline auth/links (the legitimate tasks-module deferral, lines 82/142/185), not the port itself. D6 title and body both say "zero stragglers."
- **"What gets deleted" matches D2/D6.** All three shared YAML stages + `visible_verbs_filter.yaml` + the events-module inline lookup are listed (lines 175–176), consistent with D2 line 34 ("no copy remains") and the Ripples.
- **Curated-allowlist contract consistent** across D8 (lines 90–98), read-methods §4 (line 140), and the method table (line 153).
- **Cross-references resolve:** `40-simple-action-surfaces` (folder name unchanged by the content rename), `47-per-workflow-submit-endpoints`, `_completed/{34,38,39,42}-*`, and the `../../../workflows-module-concept/tasks-module-plan/design.md` link all exist.
- **Cross-doc reciprocity:** the tasks-module plan's "Timeline action cards are cross-stream" section (line 153) and its back-link to `GetEventsTimeline` match Part 46's D6 (pass-through on shared display fields; task auth/links deferred to the tasks side).

## No Issues

- Review-vs-Design drift: none — all review-1, review-2, and A–G annotations propagated.
- Design-vs-Task / Design-vs-Plan drift: n/a (no tasks/plans yet).
- Internal contradictions: none.
- Stale references / status / blockers: none — Part 40 "paused/depends" note is current and intentional; line-number citations were verified by the reviews on this branch.
- Moot sections: none — D3/D4 retain only decision + rejection rationale.
- **Scope note (checked, not an issue):** the events-timeline lookup is now in this part's deletion scope but is absent from the "Current state — the readers (verified)" table. This is intentional — that table is scoped to _client config-embed readers_, and `todo-discuss` item F explicitly reasoned that the events-timeline YAML "isn't a config-embed reader" (it already resolves access server-side). The deletions section, D6, and Ripples cover it. Adding a row would expand the table's established scope, so no change.
- **Historical artifact (no action):** `consistency-1.md` describes the pre-rename, four-method state (`GetAction`, `action_allowed`, "buttons only on `GetAction`"). Consistency reports are out of the source-of-truth chronology and record a past pass's state — left as-is by design.

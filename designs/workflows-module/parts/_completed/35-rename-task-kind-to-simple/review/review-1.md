# Review 1 — Scope accuracy against the codebase

The design is mechanically correct in intent but the file list and sequencing notes name some files that do not contain what the design says they contain, and miss the one shipped file that actually carries the `"task"` literal everyone is reasoning about. Findings below are ordered by impact on the implementer.

## Incorrect file references

### 1. The Part 28 sequencing note points at the wrong file

> **Resolved.** Verified: `handleSubmit.js` contains no `kind`/`task` references; the `actionConfig.kind === "task"` check is at `resolveTargetStatus.js:54`. Updated the Files-changed note and Open question 1 to point at `resolveTargetStatus.js`, and added a parenthetical flagging the same mis-naming in Part 28's design for its next review.

Section "Files changed — shipped code and templates" (note after the table, line 48) and Open question 1 both describe Part 28 as amending `handleSubmit.js` (`kind === "task" → "task" || "custom"`). Part 28's own design.md repeats the claim at [line 66](designs/workflows-module/parts/28-custom-action-kind/design.md) and [line 179](designs/workflows-module/parts/28-custom-action-kind/design.md) (`handleSubmit.js:32`).

The shipped `handleSubmit.js` contains **no** reference to `kind` or `"task"` — `grep -n "kind\|task" plugins/.../SubmitWorkflowAction/handleSubmit.js` is empty. The site that actually has `actionConfig.kind === "task"` is:

- [`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js:54`](../../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/resolveTargetStatus.js)

This part's table already lists `resolveTargetStatus.js` correctly for the rename. The sequencing prose just has the file name wrong. Fix: in the Part 28 note and Open question 1, change every "handleSubmit.js" mention to `resolveTargetStatus.js`. Part 28's design will need the same correction — flag it for that part's next review rather than fixing it here (review files in this part should not edit Part 28's design).

### 2. The "Files changed — concept docs" table is stale

> **Resolved.** Verified each file — only `workflows-module-concept/design.md:314` still mentions `kind: task`, and that's the future-reservation note that must stay. Concept rename shipped in `13fed1b`. Deleted the "Files changed — concept docs" section entirely and dropped item 7 from "Proposed change" (it described work that isn't a change in this part). Added a bullet under Out of scope flagging the reservation note as something a sweep must leave alone.

The table lists four concept files for terminology sweeps:

- `workflows-module-concept/design.md`
- `workflows-module-concept/submit-pipeline/spec.md`
- `workflows-module-concept/ui/spec.md`
- `workflows-module-concept/action-groups/spec.md`

Of these:

- **`submit-pipeline/spec.md`** — already reads `Emitted for kind: form and kind: simple actions` ([line 75](../../../workflows-module-concept/submit-pipeline/spec.md)). No `task`/`simple` work remaining.
- **`ui/spec.md`** — already uses `simple` / `simple-edit` / `simple-view` / `simple-review` throughout ([lines 18, 76–78, 210, 273](../../../workflows-module-concept/ui/spec.md)). No work remaining.
- **`action-groups/spec.md`** — contains zero `task` references; nothing to flip.
- **`workflows-module-concept/design.md`** — already uses `kind: simple` / `simple-edit/view/review` throughout the worked example ([lines 12, 22, 31, 54, 67, 135, 166–194, 244–270](../../../workflows-module-concept/design.md)). The only `kind: task` mention is [line 314](../../../workflows-module-concept/design.md), which correctly describes the future tasks-module reservation — it must **not** be flipped (Design 35 says as much in item 7 but the table contradicts it).

This sweep already shipped in commit `13fed1b design(workflows-module-concept): Add tasks-module-plan + rename kind:task→simple`. Drop the "Files changed — concept docs" table entirely (or replace with a one-line "Concept docs already renamed in `13fed1b`; this part touches no `workflows-module-concept/` files"). Item 7 in "Proposed change" can collapse to the same.

This is a real scope reduction: the implementer reads the table, opens four files looking for hits that aren't there, and either wastes time or invents edits to justify the listing. Better to remove.

### 3. Two of the named Part 30 task files don't actually carry the rename surface

> **Resolved.** Verified the prose hits in `04-add-renderStatusMap.md:55` ("a `task` cell") and `10-strip-link-from-demo-configs.md` (kind enumerations on lines 5, 9, 28). List stays correct; added a note to the Part 30 tasks row clarifying that `04` and `10` carry `task` as a kind name in prose, not `kind: task` literals, and that `10`'s `track-step-*.yaml` filename reference is unrelated.

The "Files changed — active follow-on parts" table lists six Part 30 task files: `03`, `04`, `06`, `08`, `10`, `11`. Grep across `parts/30-status-map-rendering/tasks/` for `kind: task\|task-edit\|task-view\|task-review` returns:

- `03-add-computeEngineLinks.md` ✓
- `06-extend-api-contract-metadata-action-display.md` ✓
- `08-wire-updateAction.md` ✓
- `11-resolver-cell-shape-validation.md` ✓
- `04-add-renderStatusMap.md` — one hit ([line 55](../../../_rejected/30-status-map-rendering/tasks/04-add-renderStatusMap.md)) but it says "a `{ action_id: true }` in a `task` cell would not be swapped" — uses the word `task` as a built-in-kind label in prose; flipping it to `simple` is the right swap, so keep it in the list.
- `10-strip-link-from-demo-configs.md` — four hits ([lines 5, 9, 28, 41](../../../_rejected/30-status-map-rendering/tasks/10-strip-link-from-demo-configs.md)); three are `(task, form, tracker)` enumerations and one is `track-step-*.yaml`. The `task` mentions in the kind enumerations should flip; the `track-step-*` filename is unrelated.

Net: the list is correct, but the implementer should be told what they're looking for in `04` and `10` is `task` as a kind name in prose, not `kind: task` literally — otherwise they may miss it on a literal-string sweep.

## Off-by-some counts

> **Resolved.** Verified the grep — `makeWorkflowsConfig.test.js` has 19 sites and `handleSubmit.test.js` has 17. Tightened both counts in the test files table.

The test-fixture site counts are approximations (`~14`, `~16`, etc.) but two are noticeably off — worth tightening because the implementer will use them as a sanity check that the sweep is done:

- `makeWorkflowsConfig.test.js` — design says ~16, actual grep returns **19** sites of `kind: "task"`.
- `handleSubmit.test.js` — design says ~14, actual grep returns **17** sites.

CloseWorkflow (~11) and StartWorkflow (~5) match. Either tighten the counts or drop them and just say "every `kind: \"task\"` fixture flips" — exact counts give false precision.

## Smaller items

### 4. The `apps/demo` `.lowdefy/` cache note is fine but undersells one risk

> **Rejected.** If the dev server genuinely serves stale page IDs after a file rename, that's a Lowdefy bug — not a gotcha to bake into every rename design. The claim wasn't verified against Lowdefy's dev-server behaviour, and the Verification section is for checks, not generic operational tips. No change.

The Verification section says `apps/demo/.lowdefy/server/build/pages/workflows/` regenerates on rebuild. True, but the **dev server** (`pnpm dev`) often serves stale page IDs from in-memory caches; if a reviewer pulls the rename branch with a running dev server, the renamed pages can 404 until restart. One-liner: "If `pnpm dev` is running on a checkout that crosses the rename, restart it — the page-id index is built once at server start."

### 5. The manifest edit is one logical edit, not three

> **Resolved.** Extended the `module.lowdefy.yaml` row to note that the three entries sit contiguously inside the `pages: _build.array.concat:` block around lines 128–134, not in a flat top-level `pages:` list.

"Flip the three `pages: _ref:` entries to the new filenames" — accurate but the three entries sit inside a `_build.array.concat` block ([module.lowdefy.yaml:128–134](../../../../modules/workflows/module.lowdefy.yaml)). Worth noting they're contiguous lines so the implementer doesn't go hunting for a `pages:` list elsewhere.

### 6. Missing: `isTask` local variable rename

> **Rejected.** No fix needed — the finding itself concludes that the README row already covers the user-facing wording mention on line 130. Recorded as a confirmation, not an action.

The shipped-code table row for `makeWorkflowApis.js` says "rename the local var so reads cleanly" — but the README also references this through the user-facing wording on [line 130](../../../../modules/workflows/README.md) (`one per kind: form or kind: task action`). Already covered by the README row in the table. No fix needed; flag is just to confirm the README row catches every "task" mention, not only the shared-pages table.

## Suggested patch summary

1. Replace `handleSubmit.js` with `resolveTargetStatus.js` in the two places it appears (Files-changed note + Open question 1). Note that Part 28's design has the same error and flag it for Part 28's next review.
2. Delete the "Files changed — concept docs" section and the matching paragraph in item 7 of "Proposed change"; replace with one line stating the concept rename already shipped in `13fed1b`.
3. Tighten the two off counts (19 and 17) or drop counts entirely.
4. Add the "restart `pnpm dev`" note to Verification.
5. Clarify in the Part 30 tasks row that tasks `04` and `10` carry prose mentions, not `kind: task` literals.

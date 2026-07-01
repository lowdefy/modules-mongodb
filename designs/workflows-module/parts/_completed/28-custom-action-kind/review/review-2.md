# Review 2

Review 1's findings were all resolved by a substantial rewrite, and the rewritten
engine-routing story (§Links, §What `custom` means) is now correct against the
per-verb `links` contract — `collapseLink` priority (`edit > review > error >
view`, `resolveActionAccess.js:78–81`), the `STAGE_VERB_PAGE` table
(`computeEngineLinks.js:43–52`), the unwired `kind: custom` short-circuit
(`computeEngineLinks.js:65`), the `validateAction` guard (`makeWorkflowsConfig.js:535`),
the `isCustom` cell branch (`makeWorkflowsConfig.js:434,466`), the missing
`custom` FSM table (`fsm/tables.js:136–144`), and the orphaned
`substituteActionIdSentinel.js` (only its own `.test.js` imports it) all check out
exactly as the design now describes.

**But the design was rewritten against a tree that Part 56 has since changed
underneath it.** The git log shows `part-56-three-tier` merged into this branch
("retarget check e2e + wire entity_view"), and Part 56 D3 **retired the shared
check pages the design's observer fallback depends on.** That is the central
finding below.

## Correctness — the observer-fallback page no longer exists

### 1. `workflow-action-view` was retired by Part 56; the design's observer fallback points at a deleted page

> **Resolved.** Confirmed against source: the three shared `workflow-action-*` pages are gone, replaced by Part 56's per-workflow `{workflow_type}-check` page, which `emitCheckPage` emits only when the workflow has a `check` action. Resolution per user direction goes to the root cause rather than fix (a)/(b): **Part 56 wrongly scoped that page to check — it is kind-agnostic** (loads any action by `?action_id`, derives `view`/`edit`/`review` mode at runtime, all working buttons backed by `handleSubmit`'s server-side per-verb access gate). This part **generalizes it**: rename `emitCheckPage` → `emitActionPage` and `templates/check.yaml.njk` → `action.yaml.njk`, emit `{workflow_type}-action`, broaden the guard to `check` **or** `custom` (and future `external`). `computeEngineLinks`' check arm and custom's `view`-slot fallback both target it; a custom-only workflow now gets the page, so the "always has a read-only surface" guarantee holds with no 404. No template block changes (verified the `kind: check` var only selects non-form chrome). The rename cascades — mechanically and in-scope — across `computeEngineLinks` + the two resolver test files, the three Part 56 e2e specs (`tracker-child`, `error-recovery`, `check-blocked-by`), and two header comments. Design updated: §Summary, kinds table (check + custom rows), §What `custom` means, §Why a fourth kind, §Proposed change 3–4, §Links, new §Page emission, §What's still wired up, §What's deliberately not provided, and four Files-changed rows (makeActionPages now a code change; new template-rename + e2e-retarget rows; computeEngineLinks check-arm retarget). Tasks 04/07/08 will be re-pointed off the dead page id in the task pass.

The design routes the `view` slot to "the author's `view_link` if present, **else by
the entry-scoped shared `workflow-action-view` page** (`{ pageId, urlQuery: {
action_id } }`)." This fallback is load-bearing — it is what guarantees "a custom
action always has a read-only status surface even when the author authors only a
working `link`" (§What's deliberately not provided), and it is named in §Summary,
the kinds table (line 25), §What `custom` means (line 27), §Proposed change 3
(line 11), §Links (line 65), §What's still wired up (line 155), and both e2e
assertions (lines 14, 181 — "a view-only user lands on the shared
`workflow-action-view` page").

That page **does not exist anymore.** Part 56 D3 deleted all three shared check
pages and replaced them with one per-workflow page:

- `modules/workflows/templates/check.yaml.njk:3` — "Replaces the three retired
  shared check pages (workflow-action-view / -edit / -review) with ONE
  per-workflow page, `{workflow_type}-check`".
- `computeEngineLinks.js:17` — built-in `check` now targets `${workflow_type}-check`,
  "Part 56 D3: replaces the fixed `workflow-action-{verb}` module pages".
- `modules/workflows/pages/` contains only `workflow-overview.yaml` and
  `workflow-group-overview.yaml` — no `workflow-action-*` page.

So the fallback as written produces a link to a non-existent entry-scoped page;
every observer of a custom action that authored no `view_link` lands on a 404 — the
exact failure mode the fallback was introduced to prevent.

Worse, the natural substitute is **not a drop-in**. The replacement
`{workflow_type}-check` page is emitted only when the workflow contains a check
action:

```js
// makeActionPages.js:132–134
function emitCheckPage(workflow, workflowTitle) {
  const hasCheck = (workflow.actions ?? []).some((a) => a.kind === "check");
  if (!hasCheck) return [];
```

A **custom-only workflow** (e.g. the design's own `account-review` /
`review-document` example, if it has no check action) gets _no_ module read-only
page at all. Rerouting the fallback to `${workflow_type}-check` therefore also
requires extending this guard to fire for custom actions
(`hasCheck` → `a.kind === "check" || a.kind === "custom"`), and confirming the
check page renders sanely when loaded for a custom action (it fetches by
`?action_id` and derives mode from the loaded action — for a view-only user it
derives `mode: view`, `check.yaml.njk` mode table rows 1/4 — so it would show a
read-only surface, which is the desired observer behaviour; working users never
arrive here via the card because `collapseLink` routes their `edit`/`review` verb
to the app `link` first).

**Proposed fix.** Pick one and bake it in:

- **(a) Reroute the fallback to `${workflow_type}-check` and extend `emitCheckPage`
  (recommended, most aligned with Part 56).** Replace every `workflow-action-view`
  reference with `${workflow_type}-check`, and change the `emitCheckPage` guard to
  also emit for `kind: custom`. Add a note that the page renders read-only for a
  view-only user (mode derivation already handles a custom action's status). This
  preserves the "always has a read-only surface" guarantee. Verify the check page's
  baked vars (`entity_view_slot`, `connection_id`, `reference_field`) are available
  for a custom-containing workflow — `workspaceVars` is computed per-workflow, so
  this should hold, but the design should assert it.
- **(b) Require `view_link` for custom; drop the module fallback.** Simpler — no
  resolver change — but it contradicts the design's stated guarantee and means a
  custom action with no `view_link` has _no_ read-only surface for observers.
  `validateStatusMapCells` would then need to require `view_link` whenever the
  action is reachable by view-only access.

Either way, the design currently ships a fallback to a page that was deleted on
this very branch. This must be corrected before implementation (tasks 04 and 07/08
encode the dead page id).

## Design completeness

### 2. The `done` stage routes the working `link` into the `view` slot — but the `view`-slot fallback also targets `view`; precedence is unspecified

> **Resolved.** Confirmed the collision (`STAGE_VERB_PAGE.done` exposes only `view`, so both §Links rules fire on it). Precedence now stated explicitly, aligned with the existing "`done: { link }` reads naturally" framing: at `done` the working `link` wins the `view` slot (it is the canonical closed-action destination); `view_link` and the fallback fill `view` only at the in-flight/error stages where `link` occupies a working verb. A `done` cell with no `link` falls through to `view_link` → fallback, so it still resolves. Authoring both at `done` is redundant (no working verb there); `link` wins deterministically. Added a "**`done`-stage precedence**" paragraph to §Links.

§Links gives two rules that collide at `done`:

1. "At `done` (a view-only stage) there is no working verb, so `link` lands in the
   `view` slot."
2. "The `view` slot is filled by the author's `view_link` if present, else by the
   … shared … page … wherever the stage exposes `view`."

`done` exposes `view` (`STAGE_VERB_PAGE.done = { view: true, … }`), so both rules
fire on the same slot. The worked example (design lines 113–116) only authors a
`done.link` and no `done.view_link`, so it doesn't exercise the conflict — but an
author who writes both a `done.link` _and_ a `view_link` (or relies on the
fallback) hits an undefined precedence. State it explicitly: at `done` the working
`link` wins the `view` slot (it _is_ the canonical view target for a closed
action), and `view_link`/the fallback only fills `view` at stages where the
working `link` occupies a different verb. Otherwise the routing code at task 04 has
to guess.

### 3. Minor: stale file path / call-site framing for `planActionTransition`

> **Resolved.** Qualified the §Links reference with the full directory (`shared/phases/planners/planActionTransition.js`); the line numbers were already accurate (render 240–245, `computeEngineLinks` 248). Added a one-line note that the sibling `planFieldsUpdate.js` (`{type}-update-fields` path) deliberately skips `computeEngineLinks` — a fields edit changes neither stage nor access, so custom's routed links need no re-routing there. No design change.

§Links (line 58) cites `planActionTransition.js:240–245` / `(line 248)`. The file
now lives at `connections/shared/phases/planners/planActionTransition.js` (the
`computeEngineLinks` call is at line 248 — accurate; the render range drifted
slightly). Not load-bearing, but worth correcting since task 04 points an
implementer there.

Also worth a one-line note for completeness: the sibling planner
`planFieldsUpdate.js` **deliberately does not call `computeEngineLinks`** (its
header, line 27: "No engine-link recompute — stage and access are [unchanged]").
This is correct for custom — a `{type}-update-fields` call doesn't change stage or
access, so the authored links don't need re-routing on that path — and confirms the
design's "rides `{type}-update-fields` like any other kind" claim is safe. No
change needed; flagging only so the single-call-site assumption in §Links isn't
mistaken for an oversight.

## What checks out

- The per-verb routing model (working `link` → active verb slot, `view_link` →
  `view` slot), the `collapseLink` priority that makes it route working-user→app /
  observer→view, and the sentinel-helper extraction from the tracker arm
  (`computeEngineLinks.js:94–106`) are all correct against source.
- `substituteActionIdSentinel.js` is genuinely dead (only its own test imports it);
  the deletion is safe.
- `FSM_TABLES` (`fsm/tables.js:136–144`) is `{ form, tracker, check: form }` with no
  `custom` — the `custom: form` alias is correctly identified as required.
- `makeActionPages.js:76` (`if (action.kind !== "form") return []`) excludes custom
  from per-action pages; §Page emission holds.
- `makeWorkflowApis` submittability and `validateStatusMapCells`'s reuse of
  `validateTrackerStartLink` (`makeWorkflowsConfig.js:361`) for cell-shape validation
  are accurate.

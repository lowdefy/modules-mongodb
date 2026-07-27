# Review 14 — Task 18 (display-surface renames) vs Parts 39/40/42/43/45

Scope: `tasks/18-display-surface-renames.md`, compared against Part 39 (form submit buttons), Part 40 (simple-action surfaces), and — pulled in because they own pieces of task 18's surface — Part 42 (timeline action cards) and Part 43 (rename simple→check + `action-*` pages). The user's question ("are we doing double work; should some of this defer to the more thorough designs?") is answered concretely per finding.

## Double work / rename churn

### 1. The `simple-*` → `workflow-simple-*` renames are scheduled to be churned twice more — the intermediate names never ship to a user

> **Resolved.** Adopted a third shape, better than both proposed: task 18 renames once to **`workflow-action-view/edit/review`** — the domain noun keeps kind names out of routes permanently (Part 43's original page rationale), and the `workflow-` prefix keeps the pages inside Part 34 D10's fixed-page glob, so no `action` type-name reservation or D10 amendment is needed (largely mooting #2). Part 43 shrinks to the `simple` → `check` kind sweep (its design.md rewritten; OQ1 resolved; page ids now out of its scope). Updated across: task 18 (targets, criteria, notes), task 3 (link-table criterion), Part 38 design.md ¶13/¶14 + files-changed, carried-surfaces.md, worked-example.md, Parts 39/40 (incl. Part 40's tasks) page references, Part 42 design + tasks file paths, Part 45 + its e2e task (`action-*` → `workflow-action-*`), Part 22 e2e (\_next), implementation-plan row 43, and the concept docs (ui, module-surface, action-authoring, state-machine, submit-pipeline, spec, tasks-module-plan). The `group-overview` → `workflow-group-overview` rename stays in task 18 as the review recommended. Since tasks 1–16 were already implemented against the interim `workflow-simple-*` strings, task 18 is the explicit catch-up: its Files list enumerates every implemented site (task 3's `computeEngineLinks.js` + test, task 10's `planActionTransition.test.js` fixtures, universal-fields comment, README, manifest) with a grep-empty exit criterion.

Task 18 renames `simple-view/edit/review` → `workflow-simple-*` (files, ids, internal `_module.pageId` refs, manifest, `computeEngineLinks` link table). But:

- **Part 40 rewrites those same page bodies** (moved into the shared `simple-action-surface` component; Part 40 "Files changed" references them as `pages/simple-edit.yaml` etc. — paths that go stale the moment task 18 lands).
- **Part 43 renames them again** to `action-edit/view/review`, sequenced "after Part 40 lands" (Part 43 § Sequencing). Part 43's design doesn't even acknowledge the intermediate `workflow-simple-*` names — it maps `simple-*` → `action-*` directly.
- **Part 38's own design already records the final state**: design.md line 39 ("tasks 1–19 → Part 43 (`kind: check` + `action-*` pages) → Part 44 → Part 45") and `tasks/20-demo-migration.md` line 5 repeat the landing chain. Part 45's e2e (`45-demo-rebuild/tasks/08-e2e-happy-path.md` lines 18, 32) is already scripted against `action-edit` / `action-review`.
- The demo — the only in-tree exercise of these pages — lands at Part 45, _after_ Part 43. So `workflow-simple-*` ids would exist only in the gap between task 18 and Part 43, visible to no one.

Task 18's Notes claim "`computeEngineLinks` (task 3) must target the **final** renamed ids" — false: `workflow-simple-*` is not final; `action-*` is. The link table (already implemented per the task-18 names, see #4) gets rewritten again by Part 43 (its "Surfaces changed" lists "the per-verb `links` map the Part 38 engine computes/emits").

**Proposed fix — rename once, to the final names.** Two workable shapes; the first is recommended:

- **(a) Task 18 adopts `action-*` directly.** Rename `simple-*` → `action-view/edit/review` here (pulling forward exactly the page-route half of Part 43, which its own Open Question 1 already contemplates ceding); Part 43 shrinks to the `kind: simple → check` vocabulary sweep. `computeEngineLinks`' table flips once (`workflow-simple-*` → `action-*`). Part 40's design rebases its file paths to `action-*.yaml` (a smaller edit than rebasing twice). Requires the D10 reconciliation in #2.
- **(b) Defer the simple-page renames out of task 18 entirely** and let Part 43 do the one rename after Part 40's rewrite. Cheaper for task 18 but leaves the _already-implemented_ task-3 link table emitting `workflow-simple-*` against pages still named `simple-*` — dangling links until Part 43 — so it forces a task-3 erratum reverting the table to `simple-{verb}` in the interim. More total motion than (a).

Either way, **the `group-overview` → `workflow-group-overview` rename stays in task 18** — no other part owns it (Part 43 touches only the three shared simple pages), and it's needed for the D10 fixed-page glob. Only the simple-page renames are double work.

### 2. Part 43's `action-*` breaks Part 34 D10's `workflow-*` glob rationale, and no design reconciles it — task 18/6 inherit the gap

> **Resolved.** The reservation/amendment half is mooted by #1's resolution: the final ids are `workflow-action-*`, which stay inside Part 34 D10's fixed-page glob — no `action` type-name reservation, no D10 amend-via-note; the existing `workflow` reservation (task 6) already protects the space (noted in task 18's Notes). The staleness half is fixed tree-wide, not just the cited `ui/spec.md` lines: the earlier-draft prefixed derived-id form `workflow-{workflow_type}-{action_type}-{verb}` (dropped by Part 34 review-3 #1; implemented unprefixed in `computeEngineLinks.js:87`) was corrected to `{workflow_type}-…` across all live concept docs (ui, submit-pipeline, action-authoring, module-surface, engine, call-api, state-machine, spec, design — ~60 sites incl. literal `workflow-onboarding-*` examples), and `module-surface/design.md`'s stale "generic page kinds for form actions (`action-edit`/`action-view`/`action-error`)" claim was rewritten to the per-action derived-page model.

Task 18's Context cites Part 34 D10: the `workflow-` prefix on fixed pages "reserves the `workflow-*` glob space for the module's fixed pages (so `{entry_id}/workflow-*` slices module infrastructure, disjoint from per-type derived endpoints)", and task 6 reserves the workflow-type name `workflow` for exactly that reason (task 18 Notes restate it).

Part 43 moves the three shared pages _out_ of the `workflow-*` space to `action-*` without addressing D10 at all: the fixed-page glob `{entry_id}/workflow-*` no longer covers the shared action pages, and a workflow type literally named `action` would have derived ids `action-{action_type}-{verb}` landing inside the fixed-page `action-*` glob — the same collision D10 reserved `workflow` against, unreserved.

If #1(a) is adopted, task 6/18 must carry the reconciliation: reserve `action` as a workflow-type name alongside `workflow` (resolver rejection + test), and amend Part 34 D10 via note (it's `_completed/` — same amend-via-note treatment D10's table gave Parts 12/13/17) so the auth-glob story reads: fixed pages live under `workflow-*` **and** `action-*`, both reserved type names. If #1(b) is adopted, this lands in Part 43 instead — but it must land somewhere; today no design owns it.

Related staleness feeding Part 43's premises: `ui/spec.md` (lines 9, 17, 195) still says generated form pages are `workflow-{workflow_type}-{action_type}-{verb}` — the earlier-draft prefixed form Part 34 review-3 #1 explicitly dropped (D10: derived ids carry **no** literal prefix; implemented that way in `computeEngineLinks.js:87`). Part 43's "Why the pages move" point 3 cites that stale spec line as evidence `action-*` is unused. The conclusion happens to survive, but the spec should be fixed before it misleads the next design.

## Stale scope (owned elsewhere)

### 3. The `workflow-group-overview` "reads `.message` / `.links`" item is already shipped page-side; the residual is Part 42's — and `.links` contradicts Part 42 D5

> **Resolved (auto).** Task 18's group-overview scope shrunk to rename + reference updates: the "Switch it to read…" instruction deleted (page already reads `.message` + singular `.link`), acceptance criterion 4 reworded to "page-side reads unchanged; link projection replaced by Part 42 D5's `resolve_action_link.yaml` (owned by Part 42)", the stale Context parenthetical removed, and the interim broken-link window (Part 38 stops writing the singular `link` cell → Part 42 adopts the resolve stage) stated explicitly in Notes as accepted-by-design. This finishes the half-applied Part 42 repoint (commit `d462706`).

Task 18 (lines 11, 29) instructs "Switch it to read `actions_list.$.message` / `.links` (the per-verb map)" and carries a matching acceptance criterion. Verified against the codebase and Part 42:

- The page **already** reads `actions_list.$.message` (`group-overview.yaml:256–262`) and the singular `actions_list.$.link` (`:263–282`) — shipped in the May 26 overview rework (`623e1277`).
- Part 42 D5 (post consistency-2, which is the commit `d462706` that touched this very task file) resolves the link boundary the other way: the single link is computed **server-side** by `resolve_action_link.yaml`, adopted by `get-action-group-overview` replacing its `link: $<app_name>.link` projection (`get-action-group-overview.yaml:61–65`), and "the consuming pages are untouched — they render `actions_list.$.link`" (Part 42 lines 6, 90, 202). The UI never reads the per-verb `links` map.

So "reads `.message` / `.links`" is doubly stale: the `.message` read needs no change, and `.links` is the one thing the page must _not_ read. The task's own line 11 already carries the repointed sentence ("resolved server-side by the shared `resolve_action_link.yaml` stage (Part 42 D5), not in the UI") — but the read-switch instruction and acceptance criterion 4 weren't deleted when Part 42 repointed it (Part 42's files-changed row for Part 38 says tasks 7 + 18 were repointed; the repoint was only half-applied here).

**Fix:** task 18's `workflow-group-overview` scope shrinks to the rename + reference updates. Delete the "Switch it to read…" sentence and acceptance criterion 4 (or reword to "page-side reads unchanged; link projection replaced by Part 42 D5's `resolve_action_link.yaml`"). One sequencing note worth keeping: between Part 38 (engine stops writing the singular cell `link`) and Part 42 (API adopts the resolve stage), the API's `link:` projection reads a field that no longer exists — group-overview link buttons render nothing in that window. That's accepted by the landing chain (demo only lands at 45), but say it rather than imply the page is fixed here.

## Codebase mismatches

### 4. `computeEngineLinks` (task 3, implemented) emits links to a page that will never exist: `workflow-simple-error`

> **Resolved.** Simple-kind `error` verb links to the **view** page (`workflow-action-view`, final id per #1) — where Part 40 D4's `resolve_error` button lives — so an error-verb-only user still gets a working link; form kind unchanged (generated `-error` pages exist). Owned by task 18's link-table coordination (instruction + acceptance criterion added, incl. the test fix for `computeEngineLinks.test.js:76`), mirrored in task 3's acceptance criteria, and Part 40 D4's false "no engine change is needed" sentence rewritten to cite the actual fix.

`computeEngineLinks.js:39` exposes the `error` verb at the `error` stage; `:84–87` maps simple-kind verbs to `workflow-simple-${verb}`; the test asserts `workflows/workflow-simple-error` (`computeEngineLinks.test.js:66–77`). But there are only three shared simple pages (view/edit/review) — task 18 renames exactly three — and Part 40 D4 resolves **against** a simple error page ("There is **no** `simple-error` page in v1"; recovery is a `resolve_error` button on `simple-view`).

Part 40 D4's supporting claim — "the engine's `linkDefaults` for `kind: simple` **already** routes the `error` stage to `simple-view` … **No Part 30 change is needed**" — was true of the old engine but is false against the rebuilt table: the per-verb map now links the error verb to a nonexistent page.

**Fix:** special-case the simple kind in `computeEngineLinks` — the `error` verb links to the _view_ page (final id per #1) — and update the test. Form kind is correct as-is (generated `{type}-{action_type}-error` pages exist per verb). Owner: task 18 already claims the link-table coordination ("coordinate with task 3"), so fold it in there; and Part 40 D4's "no engine change needed" sentence needs correcting to cite the actual fix.

### 5. Files-list gaps and an over-broad grep-clean criterion

> **Resolved (auto).** Added `modules/workflows/components/actions-on-entity.yaml` (line 78 `_module.pageId: group-overview`) to the Files list. Scoped acceptance criterion 2's grep-clean to the module tree (`modules/workflows/` + `plugins/`) and stated explicitly that the demo's stale `simple-edit` refs (`schedule-followup.yaml:22,33`) are accepted-by-design until Part 45 re-authors the config.

- `modules/workflows/components/actions-on-entity.yaml:78` carries `_module.pageId: group-overview`. The task prose covers it ("The `_module.pageId: group-overview` references") but the Files section omits the file — add it, since the Files list is what an implementer works from.
- The demo config references the old ids: `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml:22,33` (`id: simple-edit` link cells). Acceptance criterion 2 ("No dangling `_module.pageId: simple-*` … grep clean") fails against the demo tree as written. Scope it explicitly to the module tree (`modules/workflows/` + plugin) and state that the demo's stale refs are accepted-by-design until Part 45 deletes and re-authors the config (landing chain, design.md line 39) — same interim-breakage note as #3.

## Summary for the deferral question

| Task 18 item                                               | Verdict                                                                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group-overview` → `workflow-group-overview` rename + refs | **Keep here** — no other part owns it.                                                                                                                                                  |
| `simple-*` page renames                                    | **Don't do as written.** Rename once to the final `action-*` (pull Part 43's page-route half forward, #1a), or defer entirely to Part 43 (#1b). `workflow-simple-*` should never exist. |
| group-overview `.message`/`.links` read switch             | **Drop** — page-side already shipped; link side is Part 42 D5's `resolve_action_link.yaml` (API-side).                                                                                  |
| `computeEngineLinks` coordination                          | **Keep, extend** — flip the table to the final ids once, and fix the simple-kind `error`-verb target (#4).                                                                              |
| Manifest `pages:` refs / export ids                        | Keep (follows whichever rename shape #1 lands).                                                                                                                                         |

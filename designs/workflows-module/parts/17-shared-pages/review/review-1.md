# Review 1 — Part 17 shared-pages design

Reviewed against: [part 16 design](../../16-page-templates/design.md), [part 12 design](../../12-resolver-pages/design.md), [part 13 design](../../13-resolver-apis/design.md), [part 19 design (completed)](../../_completed/19-operational-apis/design.md) and [task 6](../../_completed/19-operational-apis/tasks/06-get-workflow-overview-api.md), [workflows-module-concept/ui/spec.md](../../../../workflows-module-concept/ui/spec.md), [workflows-module-concept/action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/engine/spec.md](../../../../workflows-module-concept/engine/spec.md).

## Substantive issues

### 1. Module-shipped `get_workflow_overview_data.yaml` / `get_workflow_entity.yaml` requests duplicate the already-shipped `get-workflow-overview` Api

> **Resolved.** Dropped the "Shared module-shipped requests" section. The workflow-overview page bullet now commits to one `CallApi` to `get-workflow-overview` on mount, returning `{ workflow, actions: [] }` per part 19's contract (with null short-circuit). "Contract to neighbours" now spells out that part 17 does not duplicate the join as a page-level `Request`. Stale `../19-operational-apis/` and `../15-resolver-form-builder/` links updated to `../_completed/...`. The `get_workflow_entity.yaml` question rolls into #2.

Part 17 § "Shared module-shipped requests" (lines 45–47) declares the overview page ships two YAML requests under `requests/`:

> - `requests/get_workflow_overview_data.yaml` — server-side fetch of one workflow + its actions.
> - `requests/get_workflow_entity.yaml` — fetch the entity doc referenced by a workflow.

But part 19 (already shipped) emits `get-workflow-overview` as a top-level Api whose routine joins the workflow + access-filtered + ordered actions in a single aggregation, and explicitly commits the response shape `{ workflow, actions: [] }` with the null short-circuit ([part 19 design § "`api/get-workflow-overview.yaml`"](../../_completed/19-operational-apis/design.md#apiget-workflow-overviewyaml), [task 6](../../_completed/19-operational-apis/tasks/06-get-workflow-overview-api.md)). The same § "Contract to neighbours" lists this part as "Part 17 (`workflow-overview` page) consumes `get-workflow-overview`."

Calling both — a page-level request **and** an Api — would do the same `$lookup` twice. Two concrete problems:

- **Access filter parity.** Part 19's Api uses the `stages/access_filter.yaml` (verb-list ∩ `[view,edit,review]` AND role-gate). A page-level request hand-rolled in this file would have to duplicate that, and the part 17 design doesn't say it will.
- **Spec drift.** [ui/spec.md:92–98](../../../../workflows-module-concept/ui/spec.md) says the page "Calls `get-workflow-overview` ([part 19](../../_completed/19-operational-apis/design.md)) on mount" — note the singular Api call. The current part 17 design contradicts both the spec and part 19's contract.

**Fix.** Drop the two `requests/` files. The page should fire a single `CallApi` on mount targeting `get-workflow-overview` ([part 19 design § "Contract to neighbours"](../../_completed/19-operational-apis/design.md)). If the page genuinely needs the entity doc for breadcrumbs / back-link, fetch it from a separate `get_entity` request (the same one part 16 owns — see issue 2). If `entity_id`/`entity_collection` aren't actually needed on this page, drop the second request entirely. Either way, don't duplicate the workflow+actions join.

### 2. `get_entity.yaml` request, if needed, should reuse part 16's, not be re-shipped

> **Resolved.** Added "Reused module-shipped requests" section: task pages fire `get_action.yaml` (and task-edit also fires `get_workflow.yaml`); workflow-overview fires `get_entity.yaml` after the `get-workflow-overview` Api returns. All three files live at `modules/workflows/requests/` and are owned by part 16. Added part 16 to "Depends on" and a new bullet to "Contract to neighbours" spelling out the ownership: part 16 owns the files, part 17 `_ref`s them. Task pages explicitly do not fetch the entity doc in v1 (no entity-context fields or back-links from task pages).

Part 16 § "Module-shipped requests" already ships `requests/get_action.yaml`, `requests/get_workflow.yaml`, `requests/get_entity.yaml` for templates ([part 16:38–46](../../16-page-templates/design.md)). Part 17 § "Shared module-shipped requests" declares `requests/get_workflow_entity.yaml` for the overview page (line 47). These are the same MongoDB find on the entity's own collection by `_id`.

Even task pages (`task-edit`, `task-view`, `task-review`) — which part 17 owns — need `get_action` (and likely `get_workflow` to read `form_data`-derived bits), but part 17 says nothing about how task pages fetch the action doc. Part 16's three requests file paths are the natural home.

**Fix.** Commit explicitly that part 17's task pages and `workflow-overview` reuse `modules/workflows/requests/get_action.yaml`, `get_workflow.yaml`, `get_entity.yaml` from part 16's filesystem layout. Add the cross-link to part 16 in the "Depends on" section. If the overview page needs a slightly different shape (it doesn't — the entity find is `_id: { _request: get_action.entity_id }`-ish, with `workflow.entity_id` instead), reshape the existing file rather than ship a parallel one.

### 3. `task-edit` status selector — "priority rule" filter needs the action's current stage, but the design doesn't say where it reads from

> **Resolved.** Rewrote the `task-edit` status-selector bullet to spell out all four missing pieces: (1) the priority filter's three inputs (current stage from `_request: get_action.status[0].stage`, status enum from `_global: action_statuses`, `currentActionId` self-exception for same-stage idempotent saves); (2) `force: true` not exposed in UI; (3) the `not-required` terminal disabled state with a "no transitions available" message; (4) the `vars.action_statuses_display` merge. Added a `required_after_close` gate to both `task-edit` and `task-review`: when the workflow is `completed`/`cancelled` and the action doesn't declare `required_after_close: true`, the write buttons render disabled and a "workflow closed" banner appears above the form (mirrors the engine's server-side reject; surfaces the constraint up-front rather than via a generic post-submit error).

Part 17 § "Task pages" (line 14) says:

> Status selector populated from `global.action_statuses` and filtered by the priority rule at render time (lower-priority transitions only, plus same-stage idempotent option).

The priority rule needs three inputs: (1) the action's **current** stage, (2) the full status enum with priorities, (3) the `currentActionId` self-exception ([engine spec § "Status enum priority rule"](../../../../workflows-module-concept/engine/spec.md), lines 297–303). Input (1) lives at `_request: get_action.status[0].stage` — but part 17 doesn't reference any `get_action` fetch. There's no `onMount` sequence documented for task pages at all.

Also missing:
- **`not-required` terminal case.** Engine spec line 303 says "`not-required` (priority 0) is the universal terminal — only per-entry `force: true` moves it." UI spec line 225 confirms: "If current stage is `not-required` (priority 0, universal terminal), selector is disabled with a 'no transitions available' message." Part 17 doesn't carry this rule.
- **App-supplied display merges.** UI spec line 222 says the selector reads `global.action_statuses` "with app-supplied display merges from `vars.action_statuses_display`." Part 17 doesn't mention this.
- **`required_after_close` interaction.** [action-authoring/spec.md:185](../../../../workflows-module-concept/action-authoring/spec.md) — when the workflow is `completed`, submits reject unless `required_after_close: true`. Part 17 should say whether `task-edit` hides the Save button (or whole page) when the workflow is closed, or whether it relies on the server-side reject and surfaces the error. Mirror part 16's `_state.action_allowed` gate.

**Fix.** Add an `onMount` sequence for the three task pages parallel to part 16's eight-step sequence (`action_id` guard → `get_action` → stale-status redirect → `get_workflow` → `get_entity` → `action_role_check` → SetState → author tail). Document the priority-filter inputs (current stage from `get_action.status[0].stage`, enum from `global.action_statuses`, self-exception via `_request: get_action._id`). Add the `not-required` disabled state, the `action_statuses_display` merge, and the `required_after_close` gate.

### 4. Task pages duplicate part 16's `onMount` machinery — extract or commit to duplication

> **Resolved.** Added an "`onMount` sequence (task pages)" subsection spelling out the eight-step sequence as the task-page projection of part 16's. Each step carries task-page-specific notes: `get_action` reuses part 16's file; `get_workflow` fires on `task-edit` only; `get_entity` is skipped on all task pages; the `SetState` step primes `_state.status` (status selector default) only on `task-edit`. Committed to duplication rather than extraction in v1 — same pragmatic choice part 16 makes across its four form-action templates. Added "must stay in sync with part 16's sequence" note with test parity requirement. Open question added to defer extracting `_action_page_onmount.yaml.njk` until drift risk is measurable.

Part 17 § "Page event wiring" (line 51) says task pages use the "Same `onMount` / `onSubmit` / `onApprove` / `onRequestChanges` vocabulary as [part 16]." But part 16 carries a long fixed `onMount` sequence (request guards, two doc fetches, the `action_role_check`, `SetState` priming) — not just a vocabulary of event names. Task pages need the same scaffolding (same `get_action` → `get_workflow` → `action_role_check` chain), with one variation: task-edit's `SetState` primes form state plus a `status` selector default.

If the eight-step sequence is implemented twice (once per template suite), they'll drift. Apps that customize via `pages.{verb}.events.{handler}` will hit subtly different state shapes between form `-edit` and `task-edit`.

**Fix.** Pick one of:
- (a) **Shared Nunjucks include.** Extract the `onMount` chain into a partial (e.g. `templates/_action_page_onMount.yaml.njk` or a YAML fragment in `requests/`) and `_ref` it from both part 16 templates and part 17 task pages. Document this in part 17.
- (b) **Duplicate with explicit `Notes` about drift risk.** Spell out the exact sequence on both sides and reference part 16 as the canonical source.

Either way, part 17 must spell out what the sequence is, not just "same vocabulary."

### 5. `workflow-overview`'s `DataView` reads `global.action_form_configs.{action_type}.form` — but instanced actions store under `{key}`

> **Resolved.** Rewrote the card-body bullets to commit two things: (1) the DataView's `formConfig` concatenates `global.action_form_configs.{action_type}.form` and `.form_review` into one ordered array (keeps v0's `_array.concat` pattern); (2) per-card `form_data` indexing is `workflow.form_data[action.type]` for non-keyed actions and `workflow.form_data[action.type][action.key]` for keyed actions, with the action doc's `key` field as the discriminator (returned by `get-workflow-overview` per part 19 task 6). Keyed actions surface as their own cards kept adjacent by the Api's `(_group_index, sort_order, _id)` sort, so per-card indexing is a simple lookup.

Part 17 § "Workflow overview page" (line 40):

> Card body: empty-state or DataView over `form_data` using the metadata trees at `global.action_form_configs.{action_type}.form` / `.form_review` from [part 15](../../15-resolver-form-builder/design.md). Switch on each node's `component` to pick the read-only renderer; recurse into the nested `form:` array on structural components (`controlled_list`, `section`, `box`, `label`, `file_upload`).

Then line 42:
> Keyed actions render as N cards within their group slot.

The `action_form_configs` map is keyed by `action_type` only (per [part 15 design.md:10](../../_completed/15-resolver-form-builder/design.md): "Emits a build-time `global.action_form_configs` object keyed by `{action_type}` (the action_type is the schema identity; per-instance keys on keyed actions vary at runtime and don't affect schema, so they don't appear in this map)"). Good — the schema is shared. But the `form_data` on the workflow doc is `form_data.{action_type}.{key}.{field}` per [part 16:138](../../16-page-templates/design.md) and [ui spec](../../../../workflows-module-concept/ui/spec.md). Part 17 doesn't say how the overview's DataView selects the right slice per instance card.

Concrete: when rendering a keyed `proof-of-installation` action card, the renderer needs `form_data["proof-of-installation"]["device-A"]` against the schema at `action_form_configs["proof-of-installation"].form`. Part 17 just says "Keyed actions render N cards"; the indexing logic into `form_data` is left implicit.

**Fix.** Add a sentence to the workflow-overview section: "For keyed actions, the DataView reads `form_data[action_type][key]`; for non-keyed actions it reads `form_data[action_type]`. The action doc's `key` field selects which slice."

### 6. `task-edit` Save button isn't gated on `_state.action_allowed`; part 17 doesn't carry the access check

> **Resolved.** Added explicit "Role gate" bullets to `task-edit` (Save) and `task-review` (`approve` / `request_changes`): write buttons gate on `_state.action_allowed === true` from step 6 of the `onMount` sequence (`action_role_check`, the shared primitive from part 18). Mirrors part 16's button-vocabulary gate; users without role access see no write buttons. The gate is wired structurally via the template-shipped button blocks (same blocks part 16 uses), but the contract is now readable from part 17 alone.

Part 16 § "Button vocabulary" (lines 92–95) says all interaction buttons are gated on `_state.action_allowed === true` from step 6 of the `onMount` sequence (`action_role_check`). Part 17 task pages also expose `submit_edit` (task-edit) and `approve` / `request_changes` (task-review), and they need the same gate — `get-workflow-overview` and `get-entity-workflows` already do the query-time access filter ([part 19 § Access enforcement](../../_completed/19-operational-apis/design.md)), and the submit-time check happens server-side, but the page-level gate is what part 16 commits to and part 17 inherits.

Part 17 § "Task pages" (lines 14–29) doesn't mention `action_role_check`, `_state.action_allowed`, or any role gate at all. The page would render write buttons for users whose roles don't satisfy `access.{app_name}.{verb}` + `access.roles`, and they'd hit a server-side reject on click — bad UX vs. the form-action templates.

**Fix.** Mirror part 16's gate. Reference `action_role_check` (the shared primitive from [part 18](../../18-entity-components/design.md), per [part 16:57](../../16-page-templates/design.md)) and gate `task-edit.submit_edit` and `task-review.approve` / `request_changes` on `_state.action_allowed === true`.

### 7. Stale-URL guards for task pages aren't specified

> **Resolved.** Added "Stale-URL redirect guards (task pages)" subsection with the same allowlists as part 16 — `task-edit`: `[action-required, in-progress, changes-required]`; `task-view`: no guard; `task-review`: `[in-review, error]`. Redirect target is `task-view?action_id=<id>` (the shared task view, equivalent to part 16's per-action `-view` target). Confirmed `error` belongs in `task-review`'s allowlist since task actions can land in `error` when a hook or side-effect throws (per engine/spec.md § "Engine-driven mid-submit failure"). Allowlists are hardcoded at the top of each task page, no automatic propagation.

Part 16 § "Stale-URL redirect guards" (lines 64–76) defines per-template allowlists for form-action pages — `edit` allows `[action-required, in-progress, changes-required]`, `review` allows `[in-review, error]`. Task pages need the same protection: a stale `task-edit?action_id=X` link from an email after the action moved to `done` should redirect to `task-view`, not silently render an editable form against terminal state.

Part 17 doesn't carry any redirect guards. The "Page event wiring" section just says "Same `onMount` / ... vocabulary." That's the event names; it's not the stale-status check.

**Fix.** Add an allowlist table for task pages. Reasonable v1 stance:

| Template      | Allowed stages                                       |
| ------------- | ---------------------------------------------------- |
| `task-edit`   | `[action-required, in-progress, changes-required]` (same as form `edit`) |
| `task-view`   | (no guard) |
| `task-review` | `[in-review, error]` (same as form `review`) |

If task actions don't have an `error` stage in practice, drop it from `task-review`. Document the decision.

### 8. Page-event wiring for `pages.{verb}.events.{handler}` — task actions opt-in surface unclear

> **Resolved (option i).** Committed to the narrow allowlist: only `pages.{verb}.events.{handler}` is supported on task actions. All other `pages.{verb}.*` chrome slots (`title`, `requests`, `formHeader`, `formFooter`, `modals`, `maxWidth`, `template`, `buttons.submit.{title,modal}`) are rejected at build time by part 4's validator. Rationale: per-action chrome on shared pages would create a Frankenpage that defeats the "one experience per task verb" contract; apps that need per-action chrome use form actions. Part 4 added to "Depends on" and "Contract to neighbours" with the validator obligation. Ui spec's "Apps don't override task pages" reads as "no per-action templates / chrome" — the events-handler allowance is the narrow exception so apps can wire page-state behavior without forking the template.

Part 17 § "Page event wiring" (line 51) says: "Apps customize via `pages.{verb}.events.{handler}` on the task action YAML (declared in [part 4](../../04-workflow-config-schema/design.md))." But the [ui spec § "Static task-action pages"](../../../../workflows-module-concept/ui/spec.md) commits that "Apps don't override task pages — task actions intentionally share one experience per verb."

There's a tension: do task actions expose `pages.{verb}.events.{handler}` at all? If yes (per part 17), then [ui/spec.md:90](../../../../workflows-module-concept/ui/spec.md) is contradicted ("Apps don't override task pages"). If no, then part 17 should say tasks have no author event handlers.

The spec's wording "apps don't override task pages" plausibly means "don't ship per-task page templates" — and per-action event handlers on the shared page are still allowed. Either reading works; the design needs to pick one.

**Fix.** Resolve the tension explicitly. Reasonable resolution: "Per-action `pages.{verb}.events.{handler}` is supported on task actions (same vocabulary as form actions). Per-action `pages.{verb}.template` is NOT supported — task pages are shared." Document this in the "Page event wiring" section.

### 9. `display_order` for workflows on the overview page — undefined

> **Resolved.** Overview page now renders the header via `_ref` to part 18's `workflow-header` component (same component used by `actions-on-entity`), passing the workflow doc from the Api. Same data shape, no part 18 API changes needed. The component's collapse / expand toggle hides the action card list below (analogous to how it hides the group sections on the entity page). Added part 18 to "Depends on" and a bullet to "Contract to neighbours" spelling out the ownership. Workflow ordering is not relevant on this page (single-workflow URL), so the `display_order` half of the finding doesn't apply.

Part 17 § "Workflow overview page" describes ordering of action cards (line 39: "wrapped in `layout.card`" with status badge) but says nothing about workflow ordering. This is a single-workflow page (`?workflow_id=<id>`), so workflow ordering isn't relevant, but the workflow-header section ([ui/spec.md:99](../../../../workflows-module-concept/ui/spec.md)) reads `summary counts` and milestone label that aren't in the part 17 in-scope list. Either the workflow-header isn't part 17's responsibility (and lives in part 18 with `workflow-header`), or part 17 needs to spec it.

Cross-reference: part 18's `workflow-header` is described in [ui/spec.md:272](../../../../workflows-module-concept/ui/spec.md) — it's an `actions-on-entity`-page component. Whether the same component renders on `workflow-overview` is unclear.

**Fix.** State explicitly whether the overview page re-uses part 18's `workflow-header` component (likely yes — it's the same data shape), or ships its own header. If reused, list it as a dependency.

### 10. `requests:` section title misleadingly suggests Lowdefy `Request` blocks

> **Resolved as side-effect of #1 and #2.** The ambiguous "Shared module-shipped requests" section is gone. Its replacement, "Reused module-shipped requests," is explicit: page-level `Request` files live at `modules/workflows/requests/` and are owned by part 16; the `get-workflow-overview` Api is fired via `CallApi`. Each fetch in the section names its mechanism, so the Request-vs-Api distinction is no longer blurred.

The header "Shared module-shipped requests" (line 45) implies these are Lowdefy `Request` blocks (page-mounted MongoDB find requests via `requests:`). That contrasts with part 19's `Api`s (`type: Api` with a `routine:` block). Given issue 1 (the overview should call `get-workflow-overview` Api, not a separate request), and the file paths suggest plain `Request` YAML, what's the intent here? Two separate Lowdefy concepts with the same word:

- **Requests** (`requests/`): page-level MongoDB read blocks referenced via `requests: [_ref: requests/foo.yaml]`. These are what part 16 ships.
- **Apis** (`api/`): top-level Lowdefy routines callable via `CallApi`. These are what part 19 ships.

If the intent is "request blocks fired on mount" (like part 16's `get_action.yaml`), then they're shared with part 16 and should be in the same `modules/workflows/requests/` directory — and part 17 task pages also need `get_action.yaml` (issue 2). If the intent is "Api endpoints," they conflict with part 19's `get-workflow-overview` (issue 1).

**Fix.** Resolve the terminology. Either:
- Delete the section (per issues 1, 2) and reference part 16's `requests/` directory.
- Rename the section "Page-level requests" and describe the two `Request` files explicitly as page-mounted finds (and resolve the `get-workflow-overview` Api duplication).

## Cosmetic / smaller findings

### 11. Verification subjects don't cover task-page acceptance

> **Resolved.** Added per-page verification bullets covering: `task-edit` priority-filter behaviour (lower-priority transitions + same-stage idempotent + `not-required` disabled state); role-gate hide on `task-edit` / `task-review`; `required_after_close` banner and disabled buttons on both pages; `task-view` status + comment timeline rendering; `task-review` approve / request_changes pathway with correct target stages; stale-URL redirect from `task-edit` to `task-view`; the `pages.{verb}.events.{handler}`-only allowlist (positive and negative cases); workflow-overview header via part 18's component; and keyed-action `form_data` indexing on the overview page.

§ Verification (lines 67–74) covers `task-edit` transition and `workflow-overview` rendering, but doesn't cover `task-view` (status + comment timeline rendering), `task-review` (approve / request_changes pathway), or the access-gate UX. Add bullets per task verb.

### 12. Missing "Contract to neighbours" entries

> **Resolved.** Contract to neighbours now lists parts 4, 13, 15, 16, 18, 19, 22, and 24. Part 18's bullet now covers both `workflow-header` (composed on overview) and `action_role_check` (called by task pages). Part 16's bullet covers the request files and the canonical `onMount` sequence. Part 22 (e2e suite) added so the cross-link from Verification is mirrored in Contract to neighbours.

§ Contract to neighbours (lines 81–83) lists parts 19 and 13. Missing: part 16 (request files reuse — issue 2; eventual `onMount` extraction — issue 4), part 18 (`action_role_check` primitive — issue 6; `workflow-header` reuse — issue 9), part 4 (`pages.{verb}.events.{handler}` schema — issue 8).

### 13. Open questions section is light

> **Resolved.** The bigger questions surfaced by this review got resolved inline rather than parked: #8 committed to the `pages.{verb}.events.{handler}`-only allowlist for task actions; #3 committed the `not-required` terminal selector behaviour (disabled with "no transitions available"). The one new open question worth deferring — extracting `_action_page_onmount.yaml.njk` as a shared partial — was added during #4's resolution. The section now carries three open questions: addressing scheme, tracker linking, and the partial extraction.

Two open questions listed (URL scheme, tracker linking). Bigger ones surfaced by this review (e.g. should task actions support per-action page events at all — issue 8; how the `not-required` terminal selector renders — issue 3) deserve listing if not resolved before implementation.

## Summary

The part 17 design has the right scope (four shared pages) but is **under-specified** relative to its sibling part 16. The two largest concrete issues are:

- **Duplicate fetch machinery** (issue 1): the overview page calls a separate page-level `requests/get_workflow_overview_data.yaml` that duplicates the already-shipped `get-workflow-overview` Api from part 19.
- **Missing `onMount` / role-gate scaffolding for task pages** (issues 3, 4, 6, 7): task pages need the same eight-step `onMount`, `action_role_check` gate, and stale-status redirect machinery part 16 spells out, but part 17 only says "same vocabulary."

Both are fixable by tightening references to parts 16 and 19 and committing to shared infrastructure (extracted `onMount` partial, reused `requests/` files, single `get-workflow-overview` Api call).

# Review 1

Scope: `designs/workflows-module/parts/56-three-tier-action-pages/design.md`. Verified against the resolver (`makeActionPages.js`), the link computer (`computeEngineLinks.js`), the three shell-dependency components (`actions-on-entity.yaml`, `workflows-events-timeline.yaml`, `check-action-modal.yaml`), the form template (`templates/view.yaml.njk`), the manifest, and the existing test/e2e surface.

## Correctness / internal consistency

### 1. The History tab can't be "always present" while `reference_field` lives only on `entity_view`

> **Resolved.** Root cause was that the design invented `entity_view.reference_field` instead of reusing the field that already exists: `workflow.entity_ref_key` is a **required** workflow-config field (`schema.js:91`) — the event-references key the engine writes onto every event doc (`planEventDispatch.js:157`, throws if missing). The shell now bakes `reference_field` from `workflow.entity_ref_key` (alongside `entity_collection`), so History is genuinely always present (the original instinct was right; the field was just plumbed from the wrong place). `entity_view` is reduced to `{ slot }` (Details only). Updated: proposed-change §2, the shell-var list, the config-shape example + prose, the resolver and Part 4 files-changed lines, and the verification bullets.

The shell description says History is `workflows-events-timeline` and is **"always present"** (§ The three-tier shell, the ASCII box, and the Tabs bullet). But the shell-var list bakes `reference_field` *from* `entity_view.reference_field`, and the config-shape section then says:

- "`entity_view` is optional. Omitted ⇒ pages render with no Details tab (**History still shows**)."
- "Present with only `reference_field` ⇒ **History wired**, no Details tab."

These conflict. `workflows-events-timeline.yaml:44-48` makes `reference_field` a **required** var — it is interpolated straight into the `get_events_timeline` request's `$match`. With `entity_view` omitted there is no `reference_field`, so the History request matches on an undefined field: it renders "No activity" at best, or fails. So History is *not* "always present"; it is contingent on `entity_view.reference_field`. The "History still shows when `entity_view` omitted" claim is false as written.

**Fix:** pick one model and state it once. Either (a) History is gated on `reference_field` — omitting `entity_view` yields left+middle only, no right column; or (b) give `reference_field` a non-`entity_view` source (e.g. a separate required shell var the resolver always bakes). The current text claims both.

### 2. One shared shell cannot read "the loaded action" — the state path differs (`action` vs `current_action`)

The "State contract" says: *"the loaded action lives at `_state.action` (form pages) / `_state.current_action` (check surface). The shell reads `entity_id` for the left panel and History `reference_value` from the loaded action … The shell gates the columns' render on the action being present (`visible: _ne [ <action>, null ]`)."*

But there is **one** shell component (`components/action-workspace.yaml`), and its var list (`middle`, `entity_collection`, `reference_field`, `details_slot`) carries **no state-path var**. A single component reading internally from a fixed path can't read both `_state.action` (form templates, confirmed `view.yaml.njk:62-64` writes `action`) and `_state.current_action` (check surface, confirmed `check-action-modal.yaml:101` and `check-action-surface` read `current_action`). The mount-sequencing gate, the `entity_id` read for `actions-on-entity` (which requires `entity_id`, `actions-on-entity.yaml:15-16`), and the History `reference_value` all hit this.

**Fix:** pass `entity_id` / `reference_value` / the gate's action value into the shell as operator vars from each template (so the form templates supply `_state: action.*` and the check page supplies `_state: current_action.*`), or add an explicit `action_state_path` var. Add it to the shell-var list either way — as written the shell has no way to know which path to read.

## Unverified load-bearing assumption

### 3. D2's "bake the slot via `_var`, same path as `formHeader`/`formFooter`" is unverified for a cross-file relative `_ref`

> **Rejected.** The premise rests on a misread of standard Lowdefy ref resolution. `_ref` paths resolve from the **config root**, never relative to the authoring file — so there is no "relative base survives the round-trip" question; refs are root-relative strings whether or not they pass through a resolver var, which is documented framework behaviour, not an open question. (A throwaway build probe confirmed both that a cross-file `_ref` nested in a resolver-passed `formHeader` inlines into the emitted page, and that the base is config root.) The one real defect the finding surfaced — the example `_ref: ../shared/components/nc-detail.yaml`, which as a root-relative path lands in `apps/shared/...` rather than an app-local component — is corrected in the config-shape example to a config-root-relative path.

D2 is the foundation of the whole feature, and it leans on the claim that an app-authored `entity_view.slot` — whose example value is `_ref: ../shared/components/nc-detail.yaml` (§ Config shape) — bakes into the emitted page "the same path `page_config.formHeader`/`formFooter` already take." Two things make that precedent weaker than stated:

- `makeActionPages` reads `workflows` from `_module.var: workflows_config` (manifest `pages:` block, `module.lowdefy.yaml:197-205`) and passes values into the emitted page's `_ref … vars` (`makeActionPages.js:79-101`). `formHeader`/`formFooter` flow through this path **as inline block arrays** (`view.yaml.njk:121-136`). I grepped the apps — **no existing config nests an `_ref` inside `formHeader`/`formFooter`** (or any resolver-passed var). So the precedent covers inline blocks, not a cross-file `_ref`.
- A **relative** `_ref` (`../shared/...`) resolves relative to the file it is written in. Whether that base survives the round-trip — app config var → resolver → emitted page `_ref vars` (the resolver/template live in the *module* package, not the app) → build `_ref` resolution — is exactly the kind of base-path question that silently breaks. The design asserts it works; it shows no probe.

Per CLAUDE.md ("Resolve the open question; don't defer it"), this needs a one-shot build probe before the design commits D2: author a workflow config with `entity_view.slot: { _ref: ../shared/...}`, run `pnpm ldf:b`, and confirm the slot's blocks land in the emitted check/form page. If relative `_ref` doesn't survive, constrain the slot to a base-stable form (e.g. require the ref be authored where the base is known, or document that the slot must be inline / app-page-relative) and update the example, which currently uses the risky relative form.

## Scope / blast radius

### 4. The test blast radius is under-counted — retargeting check links breaks ~8 handler test files, not the two listed

> **Resolved (auto).** Verified all nine handler/test files assert `workflow-action-*` for check actions. Files changed now enumerates them (with line cites) under a "Tests (unit)" block, noting every check-action `workflow-action-{verb}` expectation becomes `{workflow_type}-check` while form-action expectations are unaffected.

"Files changed → Tests" lists only `makeActionPages.test.js`, `computeEngineLinks.test.js`, and "Part 22 e2e". But retargeting the check branch (D3) changes the link value `computeEngineLinks` emits for **every** check action, and that value is asserted verbatim across the handler suite:

- `computeEngineLinks.test.js:16-17,62,66-79` (incl. the dedicated "check kind error verb maps to `workflow-action-view`" test — which D3 deletes/rewrites)
- `GetEntityWorkflows.test.js:151-152,316,329,342,465,492`
- `GetEventsTimeline.test.js:151-153`
- `StartWorkflow.test.js:335,348,352` ("seeded check-kind drafts carry … `workflow-action-*` engine links")
- `GetWorkflowAction.test.js:245-247`
- `GetWorkflowActionGroupOverview.test.js:152-153,484`
- `GetWorkflowOverview.test.js:157-158`
- `planActionTransition.test.js:244,419-423,508`

Every `workflows/workflow-action-{view,edit,review}` expectation for a check action becomes `workflows/{workflow_type}-check`. The design must enumerate these so the implementer doesn't discover them via a red suite. (Form-action expectations are unaffected.)

### 5. The `apps/workflows-test` app is entirely unaccounted for

> **Resolved (auto).** Confirmed `check-blocked-by.spec.js:79,95,102,124` navigates to and asserts the retired ids. Added to Files changed (e2e block): retarget those URLs/assertions to `{workflow_type}-check` and update the `check-blocked-by.yaml`/`second-check.yaml` fixtures and comments.

There is a second test app, `apps/workflows-test/`, whose check e2e suite navigates **directly** to the retired page ids:

- `apps/workflows-test/e2e/workflows/check-blocked-by.spec.js:79,95,102,124` build URLs like `/workflows/workflow-action-edit?action_id=…`, `-review`, `-view` and assert `toHaveURL(/workflow-action-review/)` etc.
- Its fixtures/comments are written around those pages (`check-blocked-by.yaml:12`, `second-check.yaml:3`).

After D3 these URLs 404 and the assertions fail. The design references only "Part 22 e2e" (which lives in `apps/demo`). `apps/workflows-test` — including its `check-blocked-by` workflow config and spec — must be added to Files changed, or the design must say why it's exempt.

### 6. `apps/demo` happy-path e2e hard-codes `workflow-action-edit/-review` for check steps

> **Resolved (auto).** Confirmed `onboarding-happy-path.spec.js` references the retired ids. Added to Files changed (e2e block): retarget the `waitForURL`/assertions for check steps and the negative `not.toContain` checks to `{workflow_type}-check`.

`apps/demo/e2e/workflows/onboarding-happy-path.spec.js` waits on / asserts `workflow-action-edit` and `workflow-action-review` substrings throughout (e.g. lines 124, 314, 361, 425, 595, plus the negative `not.toContain('workflow-action-edit')` checks). These are check-action steps; once check actions land on `{workflow_type}-check` the `waitForURL` calls hang and the negative assertions are trivially true for the wrong reason. This spec needs updating alongside the link change; it isn't in Files changed.

## Documentation drift

### 7. Retiring the shared pages invalidates "canonical page" claims and the duplicate-`get_workflow_action` constraint

> **Resolved (auto).** Confirmed the stale comments in `check-action-modal.yaml:6-7,22-25`. Files changed now lists the comment/doc files to re-point: `check-action-modal.yaml`, `check-action-surface.yaml:4`, the manifest export description (`:137-138`), and the README Exports rows (`:300-302,308,317`) — the duplicate-`get_workflow_action` constraint moves to the new `{workflow_type}-check` page.

The design says `check-action-modal` is "untouched", which is true behaviourally — but its header and the manifest export description assert facts that D3 falsifies:

- `check-action-modal.yaml:6-7` ("never a replacement for the canonical `workflow-action-*` pages") and `:22-25` ("NEVER drop this component on a page that already defines a `get_workflow_action` request — i.e. the `workflow-action-*` pages").
- `check-action-surface.yaml:4` (same page list).
- `module.lowdefy.yaml:137-138` (export description repeats the constraint).
- `README.md:300-302,308,317` (Exports table rows for the three shared pages + "check actions use the shared `workflow-action-*` pages").

The new `{workflow_type}-check` page *also* defines a URL-bound `get_workflow_action`, so the "never drop the modal on a page with that request" constraint now applies to the per-workflow check page instead of the retired shared ones. The comments must be re-pointed, not just the README. Add these files to the documentation line of Files changed (currently only README + idioms are listed).

## Minor

### 8. The check page must replicate the modal's *response-derived, single-SetState* mode derivation — not a naive `_state` derive

> **Resolved (auto).** D3 now carries a callout: mode is **new** page code copied from `check-action-modal.yaml:50-64,98-146` (response-derived, one `SetState` spreading the response), not the retired pages' literal-mode pattern — with the reason (params read pre-`SetState` state; split writes prune `current_action.status`).

D3 says the page "derives mode the way `check-action-modal` already does." `check-action-modal.yaml:50-64,98-146` documents this as load-bearing: mode must be derived from the GetWorkflowAction **response** (`_request: …`), written in the **same** `SetState` that spreads the response, because (a) params evaluate against pre-SetState state so `_state: current_action.status` is empty, and (b) splitting the writes prunes `current_action.status` before mode is set. The old shared pages wrote a **literal** mode per verb (`view.yaml.njk` analog), so this derivation is *new* code on the page, not a copy of an existing page's onMount. Worth a one-line callout in D3 so the implementer copies the modal's pattern (response-derived, one SetState), not the retired pages' literal-mode pattern.

### 9. State the check `error`-verb cell explicitly in D3

> **Resolved (auto).** Confirmed the `error`→`workflow-action-view` special case at `computeEngineLinks.js:116-121`. D3 now states it explicitly: the fix collapses that special case (the page derives `view` at stage `error`), all non-null check cells incl. `error` target `{workflow_type}-check`, and `computeEngineLinks.test.js:66-79`'s error-verb test is rewritten — honouring the "confined to lines 116-121" claim.

D3 says "every non-null check cell now points at the same `{workflow_type}-check` page," but `computeEngineLinks.js:116-121` currently special-cases the check `error` verb to `workflow-action-view`. The fix collapses that special case (the page derives `view` mode at stage `error` anyway). Say so explicitly — and note `computeEngineLinks.test.js:66-79`'s error-verb test is rewritten, not just edited — so the "confined to lines 116-121" claim is honoured precisely.

## Confirmed sound

- D4 (no-modal degrade path): verified. `actions-on-entity.yaml:10-12` and `workflows-events-timeline.yaml:26-28` confirm the modal is dropped by the **page**, not the surface; neither bundles it. Workspace pages drop no modal, so `check-action-click.yaml`'s `try`/`catch` (lines 29-63) navigates check rows via `action.link`. The claim holds.
- The resolver already bakes `entity_collection` into form templates (`makeActionPages.js:85`), so adding `entity_view`/`reference_field` to the same vars bag is mechanically straightforward.
- `makeActionPages` reads the **raw** `workflows_config` var, independent of `makeWorkflowsConfig`'s output, so stripping `entity_view` from the engine config (D-point 2 / "Files changed") does not starve the resolver. Consistent.
- Open question "ActionSteps has no `active`/`selected` prop": verified — `ActionSteps.js`/`meta.js` expose no such prop. The open question is accurate.

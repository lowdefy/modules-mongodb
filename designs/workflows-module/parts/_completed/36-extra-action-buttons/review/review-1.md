# Review 1 — Factual checks against templates, validator, and demo

## Factual errors

### 1. Demo target file doesn't exist

> **Resolved.** Switched the demo exercise to `onboarding/qualify.yaml` (a real form action with an `edit` page) and updated the Verification URL example to `/workflows/{onboarding_workflow_id}/qualify-edit?action_id=...`. The README worked example uses `lead-pipeline-qualify-edit` as an illustrative URL and doesn't reference `initial-details`, so no README change was needed for this finding.

The "Files changed — demo app" section (lines 160-183) says to add `pages.edit.buttons.extra` to `apps/demo/modules/workflows/workflow_config/installation/initial-details.yaml`, "an `edit` page on a form action already in the worked example."

There is no `initial-details.yaml` in the demo. `apps/demo/modules/workflows/workflow_config/installation/` contains only `installation.yaml` and `install-step.yaml`. `install-step.yaml` is `kind: task` (renamed to `simple` in Part 35) and has no `pages.edit` block to extend.

The only form actions in the demo live under `apps/demo/modules/workflows/workflow_config/onboarding/`:

- `onboarding/qualify.yaml` — `pages: { edit: { title: ... }, view: { ... } }`
- `onboarding/send-quote.yaml`
- `onboarding/proof-of-installation.yaml`

Pick one of those (e.g. `onboarding/qualify.yaml`) for the Open Help exercise and update the Verification section's URL example accordingly (the worked example in `modules/workflows/README.md:47` and the URL `/workflows/{installation_workflow_id}/initial-details-edit?action_id=...` at line 197 also need updating).

### 2. The `pages.{verb}.modals:` "coexistence" claim is based on a shape that doesn't exist

> **Resolved.** Dropped the new `pages.{verb}.modals:` slot entirely. Author modals now live in the existing `pages.{verb}.formFooter:` slot — Lowdefy modals overlay at render time regardless of declaration position, so a dedicated slot adds no capability and the v0 `formFooter` + `CallMethod` pattern carries over directly. The coexistence sentence is gone, the YAML example puts the modal block in `formFooter`, "Modals with extras" is rewritten, the template / validator / unit-test entries for `page_config.modals` are removed, and the concept-design tasks now correct the stale `modals.{name}.{field}:` row in `ui/design.md:331` (the request-changes modal overrides actually live under `buttons.request_changes.modal.{title,content,visible}` per the shipped `review.yaml.njk`). Out-of-scope now explicitly defers both a dedicated `modals:` slot and an inline `modal:` sub-field.

Line 106 says:

> The existing `pages.{verb}.modals.{name}.{field}:` config knobs on built-in modals stay as-is; the new shape is `pages.{verb}.modals:` accepting a _list_ of full block declarations. The two coexist because the existing shape is keyed by built-in modal name; the new shape is a plain array of author blocks.

`modules/workflows/templates/review.yaml.njk` does not read any `pages.review.modals.*` path. The actual review-page knob shape for the built-in request_changes modal is `page_config.buttons.request_changes.modal.{title,content,visible}` (`review.yaml.njk:230,246,250,317`), not `page_config.modals.request_changes.*`. The `modals` row in `workflows-module-concept/ui/design.md:331` documents a slot that was never wired.

Consequences:

- There is no live "object-keyed" shape to coexist with — the design's justification for the list shape is fighting a non-issue.
- `workflows-module-concept/ui/design.md:331` and `workflows-module-concept/action-authoring/design.md:751-773` need updating to remove the stale `modals.{name}.{field}` description; the design's docs-update list mentions touching these but currently only adds the list shape, not the correction.

Either remove the coexistence reasoning entirely (just introduce the list shape and note no prior `modals:` slot existed), or — if you want the object-keyed knob shape for `request_changes` to actually ship — that's a separate small change in `review.yaml.njk` and a separate concept-design update.

## Structural issues

### 3. README target section doesn't exist

> **Resolved.** Chose option 1: add a new `### Per-page chrome` subsection under "How to Use" that enumerates every shipped `pages.{verb}.*` chrome slot — `title`, `requests`, `formHeader`, `formFooter`, `buttons.{verb_name}.{title,disabled,visible,modal}`, `events.{onMount,onSubmit}`, and `buttons.extra`. The README has no chrome documentation today, so this part inherits documenting the four pre-existing slots; the scope inflation is called out in the README task entry so it isn't reviewed as silent expansion. The "Why a dedicated part" paragraph and Proposed Change item 5 are updated to reflect the broader README work, and the size estimate moves from S to S-to-M.

Line 144 says to "Add `buttons.extra` and `modals` (list shape) to the per-page chrome list in the 'Authoring an action' section" of `modules/workflows/README.md`.

The README has no "Authoring an action" section and no per-page chrome list. The closest is `### Worked example — a single form action` (`README.md:47-89`), which shows a `qualify` action with `form`, `interactions`, `status_map` — no `pages.*` chrome at all.

The README change is more substantive than the design implies. Options:

- Add a new `### Per-page chrome` subsection (under "How to Use" or "Authoring") enumerating `formHeader`, `formFooter`, `requests`, `buttons.{verb}.{title,disabled,visible,modal}`, `buttons.extra`, `modals`. This is the natural place to introduce the slot — but it means documenting the four pre-existing slots too, since none of them are documented yet.
- Or scope the README change to a single paragraph in the worked example and defer the full chrome reference to a follow-on.

Pick one and update the design's task list. Also flag that no shipped concept work or completed part has populated the README's per-page chrome surface yet — this design inherits a documentation gap.

### 4. "Single source of truth" for reserved ids is misleading

> **Resolved.** Softened the language (option 1). The Proposed Change item now states the validator reads ids from `RESERVED_BUTTON_IDS` _and_ the templates also hardcode them, with explicit file:line refs; calls the duplication acceptable for a 5-id set; and notes the heavier alternative without proposing it. The out-of-scope entry for future locked-verb parts is updated to match: each new verb part touches both the template button block and the constant.

Line 11:

> the validator reads the reserved ids from a single source of truth (a constant in `makeWorkflowsConfig.js`) so each new verb part adds one line.

The button ids the constant lists (`button_submit_edit`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`) are also hardcoded as block `id:` values in the templates (`edit.yaml.njk:199,262`, `review.yaml.njk` and `error.yaml.njk:229`). Each new locked-verb part will need to add the button block in its template AND extend `RESERVED_BUTTON_IDS`. The constant is one source; the templates are another.

Either:

- Acknowledge the duplication in the design — "each new locked-verb part updates both the template button block and the `RESERVED_BUTTON_IDS` constant" — and treat it as acceptable for five ids.
- Or sketch a single-source pattern: e.g. an exported `RESERVED_BUTTON_IDS` constant that the resolver references and the templates `_ref` (or, more practically, the resolver injects the id list into each verb template as a build-time var, and the templates read button ids from that list — though this is heavier than the duplication and probably not worth it).

I'd take the first option; the second is over-engineered for a 5-id set. But the design's "single source of truth" claim should be softened.

### 5. Reserved-id check: per-page vs global is ambiguous

Line 11 lists reserved ids with per-page annotations:

> `button_submit_edit`, `button_not_required` (edit), `button_approve`, `button_request_changes` (review), `button_resolve_error` (error)

and proposes one constant `RESERVED_BUTTON_IDS`. The unit test list (line 199) names per-page rejection — case (e) `button_submit_edit` rejected on `edit`, case (f) `button_resolve_error` rejected on `error`.

Two readings:

- **Global**: any extra with one of the five ids is rejected on any page. Simpler; `button_approve` on edit is harmless to reject because the template button doesn't exist there anyway, but the validator just refuses the id. The cited test cases pass.
- **Per-page**: each reserved id is rejected only on the pages where the template ships that button. Tighter, but more code (a map from verb → reserved ids) and more docs-burden when locked verbs land.

Pick one. The "block tree id collision" justification on line 190 only cares about collisions on the same page (a `button_submit_edit` extra on `review` doesn't collide with anything), so per-page is the principled choice — but the design's RESERVED_BUTTON_IDS phrasing reads as global. Decide and write the validator to match.

## Smaller notes

### 6. v0 used `buttons.additional`; design renames to `buttons.extra`

`/Users/sam/Developer/mrm/prp/apps/shared/workflow_config/` uses `buttons.additional:` on 17 form actions (`device-query/technician-on-site.yaml:258`, `device-installation/site-check.yaml:273`, etc.). The design's "Modals with extras" section explicitly cites v0 muscle memory as a reason to keep the `formFooter` + `CallMethod` pattern intact (line 116), but doesn't justify renaming `additional` → `extra`.

If the v0-port story matters here, `buttons.additional:` is the lower-friction name. If "extra" reads better and v0 ports will rewrite the slot anyway (the inline modal blocks in `formFooter` need rewriting to land in `modals:`, so the rename is part of a forced rewrite), keep "extra" and say so. Right now neither rationale is in the design.

### 7. `makeActionPages.test.js` coverage in the verification doesn't match what `makeActionPages` does

> **Resolved.** Replaced the `actions:` array-length assertion with a round-trip assertion on `emittedPage._ref.vars.page_config.buttons.extra`, and noted that the merged-list behaviour belongs to the "Build passes" check since the `_build.array.concat` runs inside Lowdefy's build, not inside the resolver.

Line 200:

> `makeActionPages.test.js` — no change required if the templates compile via `.njk` substitution alone; if any fixture needs to assert the rendered button list, add a fixture with a `buttons.extra` block and assert the output's `floating-actions` `actions:` array length grows by the number of extras.

`makeActionPages.js:67` only forwards `page_config: action.pages?.[verb] ?? {}` to the template var; it does not assemble the `actions:` array. The `_build.array.concat:` wrap happens inside Lowdefy's build-time YAML processing when the template is materialised — not inside the resolver. A resolver-level test can only assert that `page_config.buttons.extra` is on the emitted page's `_ref.vars`. The actual concat behaviour belongs in a Lowdefy build-integration assertion (which the "Build passes" item in the Verification section already covers).

Either drop the `makeActionPages.test.js` line, or replace it with a one-line assertion that `emittedPage._ref.vars.page_config.buttons.extra` round-trips the author's array.

### 8. The verification mentions Part 22 supplements; flag the coordination

Line 201 says Part 22's e2e suite adds a one-line assertion that the new Help button is visible. Part 22 is in-flight (`parts/22-workflows-e2e-suite/`). If Part 22 lands first and freezes its spec, this part needs to either edit the spec or add its own spec file. Cheaper to add a tiny spec inside this part's diff so Part 22 doesn't need a follow-on edit — call that out as a decision (own-spec vs supplement Part 22), not deferred coordination.

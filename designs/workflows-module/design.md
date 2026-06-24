# Workflows Module — Implementation Design

This design carves the [workflows-module-concept](../workflows-module-concept/design.md) into 23 independently-implementable parts. Each part is a small, testable unit of work with a stateable contract to its neighbours — a coherent code change a single contributor can hold in their head and a reviewer can approve in one pass.

The concept design committed _what_ the module does and _why_. This design commits _how the work is split for delivery_ — where each capability lives, in what order parts ship, and what contract sits at each seam. Source rationale stays in the concept folder; parts link back rather than restate.

Parts 1–20 were cut from the original layering. Parts 21, 22, and 23 were added later as follow-ons — see [Follow-on parts](#follow-on-parts).

## Layers

The original 20 parts group into 5 layers by where they live in the runtime stack:

| Layer             | Parts        | Concern                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundational      | 1–3          | Upstream Lowdefy primitives + plugin scaffold the module depends on                                                                                                                                                                                                                                                                                                                                                                                       |
| Build-time config | 4            | YAML grammar + the validator that turns it into runtime config                                                                                                                                                                                                                                                                                                                                                                                            |
| Engine handlers   | 5–11         | Server-side `WorkflowAPI` connection handlers and their internal pieces                                                                                                                                                                                                                                                                                                                                                                                   |
| Resolvers         | 12–15        | Build-time emitters that turn workflow YAML into Lowdefy Apis and pages                                                                                                                                                                                                                                                                                                                                                                                   |
| UI delivery       | 16–18        | Page templates, shared pages, and entity-page components                                                                                                                                                                                                                                                                                                                                                                                                  |
| Surface           | 19, 20a, 20b | Module manifest + four operational Apis + demo wiring (a fifth `close-workflow` Api joins from [part 23](#follow-on-parts)). Part 20 split into [20a (static)](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md) and [20b (dynamic)](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md) to isolate the manifest entries that depend on upstream parts 01 + 02 |

## Parts

Each part has its own folder under [parts/](parts/) with a `design.md` containing: goal, in-scope artifacts (with exact identifiers), out-of-scope deferrals to other parts, dependencies, verification, and open questions. The concept sub-design carrying the full rationale is linked at the top.

| #   | Part                                                                                                                       | Source concept sub-design                                                                                                                         | Size |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | [call-api-primitive](parts/_completed/01-call-api-primitive/design.md)                                                     | [call-api](../workflows-module-concept/call-api/spec.md)                                                                                          | S    |
| 2   | [dynamic-module-pages](parts/_completed/02-dynamic-module-pages/design.md)                                                 | (new — upstream module-system extension)                                                                                                          | S    |
| 3   | [engine-plugin-shell](parts/03-engine-plugin-shell/design.md)                                                              | [engine](../workflows-module-concept/engine/spec.md)                                                                                              | M    |
| 4   | [workflow-config-schema](parts/04-workflow-config-schema/design.md)                                                        | [action-authoring](../workflows-module-concept/action-authoring/spec.md)                                                                          | M    |
| 5   | [start-cancel-handlers](parts/05-start-cancel-handlers/design.md)                                                          | [engine](../workflows-module-concept/engine/spec.md)                                                                                              | M    |
| 6   | [submit-action-writes](parts/06-submit-action-writes/design.md)                                                            | [engine](../workflows-module-concept/engine/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                     | L    |
| 7   | [group-state-machine](parts/07-group-state-machine/design.md)                                                              | [action-groups](../workflows-module-concept/action-groups/spec.md)                                                                                | M    |
| 8   | [side-effect-dispatch](parts/08-side-effect-dispatch/design.md)                                                            | [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                                                                            | M    |
| 9   | [hook-invocation](parts/_completed/09-hook-invocation/design.md)                                                           | [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                                                                            | M    |
| 10  | [tracker-subscription](parts/_completed/10-tracker-subscription/design.md)                                                 | [engine](../workflows-module-concept/engine/spec.md)                                                                                              | S    |
| 11  | [group-on-complete-fanout](parts/_next/11-group-on-complete-fanout/design.md)                                              | [action-groups](../workflows-module-concept/action-groups/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)       | S    |
| 12  | [resolver-pages](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md)                    | [action-authoring](../workflows-module-concept/action-authoring/spec.md) + [ui](../workflows-module-concept/ui/spec.md)                           | M    |
| 13  | [resolver-apis](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md)                      | [action-authoring](../workflows-module-concept/action-authoring/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md) | M    |
| 14  | [form-components-library](parts/14-form-components-library/design.md)                                                      | [action-authoring](../workflows-module-concept/action-authoring/spec.md)                                                                          | M    |
| 15  | [resolver-form-builder](parts/15-resolver-form-builder/design.md)                                                          | [action-authoring](../workflows-module-concept/action-authoring/spec.md)                                                                          | M    |
| 16  | [page-templates](parts/_completed/16-page-templates/design.md)                                                             | [ui](../workflows-module-concept/ui/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                             | M    |
| 17  | [shared-pages](parts/_completed/17-shared-pages/design.md)                                                                 | [ui](../workflows-module-concept/ui/spec.md)                                                                                                      | M    |
| 18  | [entity-components](parts/18-entity-components/design.md)                                                                  | [ui](../workflows-module-concept/ui/spec.md)                                                                                                      | M    |
| 19  | [operational-apis](parts/_completed/19-operational-apis/design.md)                                                         | [module-surface](../workflows-module-concept/module-surface/spec.md)                                                                              | M    |
| 20a | [module-manifest-static](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md)   | [module-surface](../workflows-module-concept/module-surface/spec.md)                                                                              | S    |
| 20b | [module-manifest-dynamic](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md) | [module-surface](../workflows-module-concept/module-surface/spec.md)                                                                              | S    |

### Follow-on parts

Added after the original 20 were cut. See [Follow-on parts](#follow-on-parts) for context.

| #   | Part                                                                           | Source                                                                                                                                                                     | Size |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 21  | [entity-type-to-collection](parts/21-entity-type-to-collection/design.md)      | [part 12 review-1 #1](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/review/review-1.md)                                                      | M    |
| 22  | [workflows-e2e-suite](parts/22-workflows-e2e-suite/design.md)                  | [concept § Worked example](../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs)                                                  | M    |
| 23  | [close-workflow-handler](parts/_completed/23-close-workflow-handler/design.md) | [part 6 review-1 #7](parts/_completed/06-submit-action-writes/review/review-1.md)                                                                                          | M    |
| 24  | [universal-fields](parts/24-universal-fields/design.md)                  | [ui spec § Page-level rendering of universal fields](../workflows-module-concept/ui/spec.md#page-level-rendering-of-universal-fields)                                      | M    |
| 25  | [group-overview-page](parts/_completed/25-group-overview-page/design.md)       | [action-groups spec](../workflows-module-concept/action-groups/spec.md) + [ui spec § Workflow overview page](../workflows-module-concept/ui/spec.md)                       | S    |
| 28  | [custom-action-kind](parts/_next/28-custom-action-kind/design.md)              | [action-authoring spec § Action kinds](../workflows-module-concept/action-authoring/spec.md) + [submit-pipeline spec](../workflows-module-concept/submit-pipeline/spec.md) | S    |

S ≈ 1 reviewer-day. M ≈ 2–4 reviewer-days. L ≈ 1–2 weeks (may sub-split).

## Dependency graph

| #   | Part                      | Depends on                                     |
| --- | ------------------------- | ---------------------------------------------- |
| 1   | call-api-primitive        | —                                              |
| 2   | dynamic-module-pages      | —                                              |
| 3   | engine-plugin-shell       | —                                              |
| 4   | workflow-config-schema    | —                                              |
| 5   | start-cancel-handlers     | 3, 4                                           |
| 6   | submit-action-writes      | 3, 4, 5                                        |
| 7   | group-state-machine       | 4, 6                                           |
| 8   | side-effect-dispatch      | 1, 6                                           |
| 9   | hook-invocation           | 1, 6, 7, 8                                     |
| 10  | tracker-subscription      | 5, 6, 7                                        |
| 11  | group-on-complete-fanout  | 1, 7, 9                                        |
| 12  | resolver-pages            | 2, 4                                           |
| 13  | resolver-apis             | 2, 4, 6                                        |
| 14  | form-components-library   | —                                              |
| 15  | resolver-form-builder     | 4, 12, 14                                      |
| 16  | page-templates            | 12, 13, 15                                     |
| 17  | shared-pages              | 13, 15, 19                                     |
| 18  | entity-components         | 4, 19                                          |
| 19  | operational-apis          | 5, 7                                           |
| 20a | module-manifest-static    | 3, 4, 5, 7, 10, 17, 18, 19, 21, 23, 25         |
| 20b | module-manifest-dynamic   | 20a, 1, 2, 6, 8, 9, 11, 12, 13, 14, 15, 16, 24 |
| 21  | entity-type-to-collection | —                                              |
| 22  | workflows-e2e-suite       | 20                                             |
| 23  | close-workflow-handler    | 3, 4, 5                                        |
| 24  | universal-fields          | 4, 16, 17                                      |
| 25  | group-overview-page       | 7, 15, 16, 19                                  |
| 28  | custom-action-kind        | 4, 6, 12, 13                                   |

Hard gates:

- **Parts 1 and 2** (upstream) ship before anything in the workflows module proper. Both are small.
- **Parts 3 and 4** unblock the rest. They can run in parallel.
- **Part 6** is the load-bearing engine work — parts 7–10 each extend its lifecycle in an orthogonal way and can ship in parallel after 6 lands.
- **Part 11** lands after 7 (which surfaces `completed_groups`) and 9 (which owns `context.callApi` invocation patterns).
- **Parts 12–15** can stream alongside 6–11 (the resolvers don't depend on the runtime, only on the YAML config from part 4).
- **Parts 16–18** (UI) can stream alongside 12–15 (templates only need the API contracts, not the resolver emission).
- **Part 19** depends on engine handlers (5, 6, 7, 10).
- **Part 20a** (manifest static surface) is the closeout for everything that doesn't depend on the upstream Lowdefy primitives — connections, four shared pages, six operational APIs, three entity components, two enums, vars, dependencies, plugin pin, secrets, plus a tracker-only worked-example demo. Lands before parts 01 / 02 / 12 / 13.
- **Part 20b** (manifest dynamic surface) adds the resolver-channel entries (`makeActionPages`, `makeWorkflowApis`) and grows the demo into the full four-action worked example. Depends on parts 01, 02, 12, 13 and the form / hook / side-effect / group-fan-out engine paths.
- **Part 21** is a schema simplification with no hard dependency — it slots wherever its consumers (parts 5, 12, 18, 19) are ready to absorb the `entity_collection`-only contract. Already shipped against parts 3, 4, and 14's code.
- **Part 22** is the end-to-end verification layer. It depends on parts 20a + 20b (demo wiring + worked-example YAML); each engine / resolver / UI part contributes its spec file as it lands. Part 20a contributes the static-surface spec slices; part 20b contributes the form / hook / side-effect / group-fan-out slices.
- **Part 23** introduces the `CloseWorkflow` handler + `close-workflow` operational API. Depends on parts 3, 4, 5; light dependency on shipped part 7 (reuses its `recomputeGroups.js` and `pushWorkflowStatus.js` helpers as-is, no contract change). Pairs with parts 19 and 20 (adds the fifth operational API + manifest export).
- **Part 24** is the universal-fields component (`assignees`, `due_date`, `description`). UI delivery wave; depends on parts 4, 16, 17.
- **Part 25** ships the group-overview page + `get-action-group-overview` operational API. UI delivery + surface; depends on parts 7 (persisted `groups[].summary`), 15 (`global.action_form_configs`), 16 (shared `requests/get_entity.yaml`), 19 (reusable `access_filter` aggregation stage).
- **Part 28** adds the `custom` action kind — fourth kind alongside `form`/`task`/`tracker`, for actions whose UI and submit endpoint live entirely in the host app. Amends shipped resolvers (parts 4, 12, 13) and the shipped `SubmitWorkflowAction` handler (part 6); no new shared helper, no contract change to engine or surface.

## Follow-on parts

Parts 21, 22, 23, 24, and 25 were not in the original cut. They were added once it became clear:

- **Part 21** — Part 12's [review-1 finding #1](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/review/review-1.md) surfaced that `entity_type` was redundant once `entity_collection` was on every doc. Spun out as a dedicated schema simplification rather than absorbed into part 12, because the change spans concept docs, the plugin schema, shipped resolver code (parts 3, 4), and the unimplemented siblings' designs (parts 5, 12, 19). Implemented parts' designs and `tasks/` directories stay frozen; part 21 amends shipped code directly.
- **Part 22** — End-to-end Playwright coverage was originally scoped under part 20's closeout. Lifted into its own part so each engine / resolver / UI part can land a `.spec.js` file in the same PR that ships the feature, with part 22 owning the spec authoring contract. Each shipping part now points its Verification section at part 22 for e2e coverage.
- **Part 23** — Part 6's [review-1 finding #7](parts/_completed/06-submit-action-writes/review/review-1.md) surfaced that the design collapsed close-vs-cancel into a single `CancelWorkflow` + implicit auto-complete, dropping v0's `CloseWorkflowActions` distinction. Real cases need both: user-initiated `completed` push on a non-terminal workflow, sweep that honors `required_after_close: true` (with the blocked-action exception), tracker subscription firing `done` instead of `not-required`. Spun out as a new handler + operational API rather than retroactively amending shipped part 5; reuses the shipped `pushWorkflowStatus` + `recomputeGroups` helpers inline (no new shared helper, no contract change to part 7).
- **Part 25** — Host apps want a group-scoped drill-down (one phase of a long workflow) without rendering the whole workflow-overview tree, and the natural target for entity-page link cells that point at a specific `action_group`. Spun out as a small page + Api pair rather than amending part 17 (which is also unshipped but already four pages wide) and part 19 (which is shipped — by convention shipped parts aren't reopened). The page reuses every primitive from parts 7/15/16/19; no new schemas.
- **Part 28** — A fourth action `kind: custom` for workflows whose per-action submit surface lives in app-supplied pages and APIs rather than the module. Same status-transition semantics as `task` (caller-supplied `current_status` on `submit_edit`) but with no module-emitted pages, no module-emitted submit endpoint, and no `hooks:`/`interactions:`/`event:` surfaces — the app's API routine _is_ the hook. Spun out as a follow-on rather than retroactively amending the shipped resolvers and `handleSubmit.js` via a `task` extension knob, because the kind is the discriminator downstream resolvers already key on and a flag would just be `custom` spelled awkwardly. Light touches across parts 4, 6, 12, 13; no contract change for parts 7, 17, 18.
- **Part 39** — Form-action submit buttons: migrates the button bars from the interaction model to signals + FSM-derived visibility, adds the `progress` ("Save Draft") button on the edit template (fires `onProgress`, lands `in-progress`), and adds a `view` button bar (Edit-nav Link + opt-in `request_changes` button). Button visibility is a three-way AND: author opt-out (`pages.{verb}.buttons.{name}.visible`, boolean or operator expression, restrict-only), FSM source-stage from `enums/button_signal_sources.yaml`, and per-verb `action_allowed.{verb}` role gate. Depends on Part 38's signal contract; sequences after Part 35 (`kind: task` → `simple`) and with/after Part 38.
- **Part 40** — Check-action surfaces: rewrites the three static shared check pages (`workflow-action-edit` / `-view` / `-review`) from the interaction model to the signal model — deletes the status selector and the `current_status`/`target_status` payload, fires `signal:` (FSM resolves `in-review` vs `done` from the action's `review` verb), and adds a `progress` ("Mark Started") button to the edit page. Resolves check-action error recovery as a `resolve_error` button on `workflow-action-view` rendered only at stage `error` (no `check-error` page). Extracts the shared `check-action-surface` body component (universal fields + comment + signal bar, `mode: edit|view|review`) that the three pages and a new standalone `check-action-modal` both `_ref`, and adds a generic `onActionClick(action)` event to the `ActionSteps` block (converging `EventsTimeline` onto the same contract). Button visibility is read entirely off `GetWorkflowAction`'s server-resolved `action.buttons.{signal}`; the only per-action policy is the root `allow_not_required` flag (validated + enforced server-side by Part 46). Depends on Parts 46 (the `GetWorkflowAction` contract this part renders from — lands first), 34 (per-verb access model, now in `_completed`), 35, 38, and 24 (the real universal-fields renderer). [Part 42](parts/_completed/42-timeline-action-cards/design.md) (timeline action cards, shipped) consumes this part's modal via host composition.

## Conventions across parts

- **Each part links its source concept sub-design.** Full rationale lives there; parts only carry the implementation-shaped restatement.
- **"Out of scope / deferred to" points at the part that picks up the rest.** No floating TODOs.
- **Identifiers are exact.** Function names, plugin handler names, page ids, API ids, YAML keys, file paths — all match the concept spec verbatim so /r:design-task can produce literal task prompts.
- **Open questions are part-local.** Cross-cutting unknowns stay in the [concept open-questions list](../workflows-module-concept/design.md#cross-cutting-open-questions-and-risks).

### Testing conventions

- **Unit tests use Jest.** Files colocate as `*.test.js` next to source under `modules/workflows/` and `plugins/modules-mongodb-plugins/src/`. Mirrors Lowdefy's own convention (`packages/operators/src/evaluateOperators.test.js` in lowdefy/lowdefy) and the established Jest posture elsewhere in the org.
- **Pure functions test without Mongo.** State-machine reducer (part 7), resolver transforms (parts 12/13/15), and payload validators (part 6) are table-driven where the input space is enumerable.
- **Handler functions use `mongodb-memory-server`** booted per test file. Same dependency that backs Playwright's `mdb` fixture (`@lowdefy/community-plugin-e2e-mdb`), so unit and e2e share the underlying Mongo posture.
- **No unit tests in `apps/demo/`.** The Lowdefy app is YAML consumed by the runtime; coverage is Playwright e2e via [part 22](parts/22-workflows-e2e-suite/design.md).
- **E2E vs. unit split.** A bug that could exist in the plugin JS without the Lowdefy runtime needs a unit test; a bug that only manifests through page → action → endpoint → DB → re-render needs an e2e spec.
- **Part 5's opt-out** ([part 5 design.md § Verification](parts/05-start-cancel-handlers/design.md#verification)) stands. The dispatcher-mock surface drift rationale is part-specific, not a precedent for other parts.
- **Parts 3, 4, 5, 14 are grandfathered.** They shipped before this convention; their existing posture stands. The convention applies forward from part 6.

## Next steps

Each part is ready for `/r:design-task workflows-module/parts/{n-name}` to produce ordered implementation task prompts. Suggested shipping order matches the dependency graph above.

The worked-example onboarding workflow in [workflows-module-concept/design.md](../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) remains the v1 integration smoke target — after parts 20a + 20b both land the demo app exercises every part.

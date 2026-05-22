# Part 27 — Demo app workflows wiring + worked-example verification

**Source rationale:** Spun out of [part 17](../_completed/17-shared-pages/design.md) task 7 ("Wire the worked-example onboarding workflow to the shared pages and verify"). Task 7's scope grew large enough that folding it into part 17 mixed two concerns — shipping the module-shipped pages (part 17's actual deliverable) and wiring an end-to-end demo flow that needs the full module surface (workflows entry, `workflows_config`, worked-example onboarding workflow, leads collection, lead pages, navigation). Splitting follows the established repo pattern for review findings that grow beyond their original part's scope (see `feedback_review_implemented_parts.md` in memory). **Layer:** integration + verification. **Size:** M. **Repo:** `apps/demo/`.

## Goal

Light up the four shared workflow pages (`task-edit` / `task-view` / `task-review` / `workflow-overview`, shipped by part 17) end-to-end in the demo app against a worked-example onboarding workflow. Produces a verification record proving the part-17 contract holds in practice and proving the broader workflows-module surface is consumable by a host app.

Part 17 shipped the page files and registered them in `module.lowdefy.yaml`, but the demo app does NOT currently import the workflows module at all — `apps/demo/modules.yaml` has no `workflows` entry, no `workflows_config`, no leads collection, no lead pages. Lighting up the worked-example demo is a substantial integration effort separate from "shipping the pages."

## In scope

### Demo app integration

- **Add workflows module entry** to `apps/demo/modules.yaml`, with `vars.workflows_config`, `vars.entities`, `vars.app_name`, `vars.user_schema` (whichever vars the module manifest declares as required at the point this part ships — depends on the state of part 20).
- **Wire a leads collection + lead pages** to host the worked-example onboarding workflow. Lead view page, lead edit page, lead new page, lead list page. Mirrors the contacts module pattern in the demo.
- **Author the worked-example onboarding workflow YAML.** Four actions (`qualify`, `send-quote`, `schedule-followup`, `track-installation`) per the original spec in `designs/workflows-module-concept/spec.md`. Lives under `apps/demo/workflow_config/onboarding/`.
- **`vars.entities`** mapping `leads-collection` → `{ page_id: lead-view, id_query_key: _id, title: Lead }`.
- **Demo navigation** — add a Workflows entry to the demo's CRM menu, plus a button on the lead-view page that opens the workflow-overview for a given workflow instance.

### Verification record

Manual verification of every bullet from part 17's design § Verification:

- [ ] Clicking `schedule-followup` (task action) on a lead with an onboarding workflow navigates to `workflows/task-edit?action_id=<id>` with the right action loaded.
- [ ] Submitting `task-edit` transitions the action; lead page reflects the new state.
- [ ] Priority-filtered status selector: from `action-required` shows lower-priority transitions plus the same-stage idempotent option; from `not-required` the selector is disabled with the "no transitions available" message.
- [ ] Role gate: a user without the action's role sees no Save button on `task-edit`, no approve/request_changes buttons on `task-review`.
- [ ] `required_after_close` banner: closing the workflow via `cancel-workflow` Api and revisiting `task-edit` / `task-review` shows the banner and disables write buttons.
- [ ] `task-view?action_id=<id>` renders the action header, universal-fields display, status timeline, and comment timeline.
- [ ] `task-review?action_id=<id>` renders read-only fields + approve / request_changes buttons; approve transitions to `done`; request_changes transitions to `changes-required`.
- [ ] Stale-URL redirect: `task-edit?action_id=<done-action-id>` redirects to `task-view`.
- [ ] Author-supplied `pages.edit.events.onSubmit` on a task action fires before the API call. **(Note: depends on the step-8 wiring mechanism, which is not implemented on shared task pages in v1 — see "Cross-part obligations" below.)**
- [ ] Task action declaring `pages.edit.formHeader` fails the build with part 4's validator message.
- [ ] `workflows/workflow-overview?workflow_id=<id>` renders all four actions in order with current status + form_data display.
- [ ] Workflow-overview header renders via part 18's `workflow-header` component (title, lifecycle badge, summary counts, milestone label).
- [ ] Entity back-link: button reads `"Lead <entity_id>"` and navigates to `lead-view?_id=<entity_id>`.
- [ ] Keyed-action form_data indexing: adding a keyed action (e.g. `proof-of-installation` with two `key` instances) renders one card per key, each reading its own slice.
- [ ] Build-time validator (part 4): a workflow YAML declaring `entity_collection: foo-collection` without a matching `vars.entities['foo-collection']` entry fails the build with the precise error message.

The verification record lands in `designs/workflows-module/parts/27-demo-workflows-wiring/verification.md` once this part is executed.

## Blockers / dependencies

- **Part 18** — `action_role_check.yaml`, `workflow-header.yaml`. Until part 18 ships, the four shared pages won't build (path-stubs fail the Lowdefy build).
- **Part 24** — `universal-fields/universal-fields.yaml`. Same posture; build fails until part 24 ships.
- **Part 20** — declares `vars.entities`, `vars.app_name`, `vars.user_schema`, `vars.workflows_config` in the manifest with proper `required: true` flags. Until part 20 ships, the demo app can still supply these vars, but they won't be schema-validated.
- **Part 4** — validates `vars.entities` completeness against `workflows_config.entity_collection` values. Until shipped, the demo can wire mismatched values without a build error (runtime failure surfaces only when the workflow-overview page tries to construct a back-link).
- **Part 17 step 8 onMount gap** — shared task pages do not currently wire author-supplied `pages.{verb}.events.onMount` (the mechanism for static pages to read per-action `page_config` isn't defined). Verification bullets that depend on author-supplied `onSubmit` / `onApprove` / `onRequestChanges` are blocked on resolving this gap. Tracked here for visibility; resolution may slot into part 4, part 13, or a follow-up design.

## Out of scope

- Anything not on the verification list above (e.g. richer entity back-link labels — see [part 26](../26-entity-data-contract/design.md)).
- Playwright e2e tests — those land in [part 22](../22-workflows-e2e-suite/design.md).
- Hardening the demo app's authentication / role configuration beyond what's needed to verify the role gate.
- Building generic "workflows in apps" infrastructure — this part is concretely about the demo app's worked example.

## Depends on

Part 17 (shared pages — landed), part 4 (validator), part 18 (action_role_check + workflow-header), part 20 (manifest vars), part 24 (universal-fields component). Should not start until at least parts 18, 20, 24 are landed — otherwise live verification is impossible.

## Verification

The verification record produced by this part IS the verification of part 17 and the workflows-module integration end-to-end against the demo app. No separate verification of this part itself.

## Open questions

- **Worked-example data fixture.** Should the demo app ship a seeded leads-collection with example leads + workflows for the verification bullets, or rely on the tester creating data manually? Lean toward a seed script for reproducibility, but defer the decision until part 18/20/24 land and the demo wiring scope is clearer.
- **Step 8 onMount mechanism.** As noted in Blockers — needs design before the author-supplied `onSubmit` / `onApprove` / `onRequestChanges` verification bullets can pass. Could be a separate small design or could fold into part 4 / part 13 / part 20.

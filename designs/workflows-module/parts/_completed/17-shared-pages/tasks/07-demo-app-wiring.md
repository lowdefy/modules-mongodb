# Task 7: Wire the worked-example onboarding workflow to the shared pages and verify

## Context

The four shared pages exist (tasks 2–5), the manifest registers them (task 6). The last task lights them up in the demo app against the worked-example onboarding workflow and runs the manual verification bullets from the design.

This task is verification + light integration glue — not heavy code. It confirms part 17's contract end-to-end, surfaces any path-stub gaps that need 18/24 to be in place first, and produces a record of which verification bullets pass / fail / are blocked on other parts.

## Task

1. **Confirm prerequisites in `apps/demo/`:**
   - The workflows module entry exists in `apps/demo/lowdefy.yaml`'s `modules:` array.
   - The worked-example onboarding workflow YAML is wired into `vars.workflows_config` for the workflows module entry.
   - **`vars.entities` is declared** on the workflows module entry, with at least one entry per `entity_collection` referenced by the worked-example workflows. Example for the onboarding lead workflow:
     ```yaml
     vars:
       entities:
         leads-collection:
           page_id: lead-view
           id_query_key: _id
           title: Lead
     ```
     Required because part 4's validator (introduced as part 17's cross-part obligation) rejects builds missing entries. If parts 4 and 20 haven't shipped the validator / manifest declaration yet, the var is still required at the app layer for the workflow-overview page's back-link to work at runtime.
   - Parts 18 and 24 — if NOT shipped yet, this task can land everything except live navigation. Note in the PR description which parts are still missing.

2. **Add a demo navigation entry** to the demo app pointing at the workflow-overview page for a known workflow instance:
   - Either via a menu entry in the demo app, or a button on an existing entity-detail page that navigates to `/workflows/workflow-overview?workflow_id=<id>`.
   - And navigation to `/workflows/task-edit?action_id=<id>` for the `schedule-followup` task action in the worked example.

3. **Run the design's verification bullets** manually in the demo app:

   - [ ] `workflows/task-edit?action_id=<schedule-followup-id>` loads with the right action; status selector populated; Save button visible (assuming the user has role access).
   - [ ] Submitting `task-edit` transitions the action; the entity / lead page reflects the new state.
   - [ ] Priority-filtered status selector: from `action-required` shows lower-priority transitions + same-stage option; from `not-required` selector is disabled with "no transitions available" message.
   - [ ] Role gate: log in as a user without the action's role; Save button hidden on `task-edit`, approve/request_changes hidden on `task-review`.
   - [ ] `required_after_close` banner: close the workflow (via cancel-workflow Api); revisit task-edit / task-review; banner appears, write buttons disabled.
   - [ ] `task-view?action_id=<id>` renders header + universal fields + status timeline + comment timeline.
   - [ ] `task-review?action_id=<id>` renders read-only fields + approve / request_changes buttons; clicking approve transitions to `done`; clicking request_changes transitions to `changes-required`.
   - [ ] Stale-URL redirect: load `task-edit?action_id=<done-action-id>` → redirects to `task-view?action_id=...`.
   - [ ] Author-supplied `pages.edit.events.onSubmit` on a task action fires before the API call (add a temporary console.log handler in the worked example to verify).
   - [ ] Task action declaring `pages.edit.formHeader` fails the build (test via temporary YAML edit; revert).
   - [ ] `workflows/workflow-overview?workflow_id=<id>` renders all four actions in order with current status + form_data display.
   - [ ] workflow-overview header renders via part 18's `workflow-header` component (title, lifecycle badge, summary counts, milestone label).
   - [ ] Entity back-link: the button on workflow-overview reads `"Lead <entity_id>"` (or the analogous `"<title> <entity_id>"` for whatever entity-kind the worked-example workflow runs on) and navigates to the configured `page_id` with the workflow's `entity_id` in the URL query key declared by `vars.entities[leads-collection].id_query_key`.
   - [ ] Keyed-action form_data indexing: add a `proof-of-installation`-like keyed action with two instances to the worked example; verify each card renders the right slice.

4. **Document the test record** in `designs/workflows-module/parts/17-shared-pages/verification.md` (create) — pass/fail status for each bullet, with notes on any failures or skipped items (e.g. "Skipped: requires part 18 — workflow-header component path-stub").

## Acceptance Criteria

- Demo navigation reaches `workflow-overview` and `task-edit` for at least one worked-example workflow instance.
- All verification bullets attempted; status (pass / fail / skipped-blocked) recorded for each in `verification.md`.
- Any failures that are part 17's responsibility (not a missing component from 18 / 24) opened as follow-up issues or fixed inline within this task.
- No regression in form-action pages (`-edit` / `-view` / `-review` / `-error`) from part 16 — confirm by smoke-testing the form-action onboarding actions (`qualify`, `send-quote`).

## Files

- `apps/demo/lowdefy.yaml` — **modify** — add nav entries or example button pointing at the new pages.
- `designs/workflows-module/parts/17-shared-pages/verification.md` — **create** — record verification results.

## Notes

- This task is the verification gate. If parts 18 / 24 are missing, several bullets will be blocked — that's OK; record the blocker and move on. Don't block this task waiting for other parts; ship what's verifiable now and document the gaps.

- The worked-example onboarding workflow lives in the demo app's `workflows_config` source. Find it by grepping `apps/demo/` for `schedule-followup` or `onboarding`.

- The `required_after_close` test requires triggering the cancel-workflow Api on the worked-example workflow. Use the existing close-workflow / cancel-workflow Apis from part 19 (`api/cancel-workflow.yaml`, `api/close-workflow.yaml`).

- The "task action declaring `pages.edit.formHeader` fails the build" test depends on part 4's validator. If part 4's task-action validator isn't shipped yet, this bullet is blocked. Mark it skipped.

- a11y + responsive checks (keyboard nav, narrow viewports) per design § Verification — do a quick manual pass; not load-bearing.

- Open follow-ups to the workflows-module epic for anything that surfaces:
  - Component extraction (workflow-closed banner, status selector with filter).
  - Comment-timeline refinement.
  - Restricted-action / completed-workflow tile UX iteration.

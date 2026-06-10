# Task 8: Cluster `field-gallery` — render sweep + field behaviors

## Context

Follows the `form-lifecycle` template (task 3). Two specs share one fixture workflow. This cluster is the **one named exception** to the design's "no surface census" principle: per-field renderability has no other coverage home — a field component no fixture uses has zero coverage — so the render sweep covers the full roster. It is a roster, not a behavior matrix. Mode: **Spine (UI-heavy)**.

The roster is `modules/workflows/components/fields/` — exactly 27 components (verified):

`alert`, `box`, `button`, `button_selector`, `checkbox_selector`, `checkbox_switch`, `controlled_list`, `date_range_selector`, `date_selector`, `enum_selector`, `file_download`, `file_upload`, `html`, `label`, `label_value`, `location`, `multiple_selector`, `number`, `radio_selector`, `section`, `section_title`, `selector`, `text_area`, `text_input`, `tiptap_input`, `title`, `yes_no_selector`

Form-key authoring pattern (`apps/demo/.../onboarding/qualify.yaml`): keys are full state paths with the `form.` prefix; field components bind block id verbatim from the key.

## Task

1. **Fixture workflow** `workflow_config/field-gallery/`: `type: field-gallery`, entity `things-collection`. One form action `gallery` (`kind: form`, starts `action-required`, `access.test: { view: true, edit: true, review: true, error: true }` — review/error verbs so the read-only variants have pages). Its `form:` uses **every one of the 27 components** with minimal valid config each (options for selectors, an enum file if `enum_selector` needs one, etc.). Add `required: true` to one field and a `minItems`-style constraint to the list field for the behaviors spec. `_ref` from `workflows.yaml`.

2. **Spec A — `e2e/workflows/field-render-sweep.spec.js`**: start the workflow, open `/workflows/field-gallery-gallery-edit?action_id=...` **once**, and assert each of the 27 field blocks renders (`ldf.block('form.{key}').expect.visible()` or the closest applicable assertion for non-input components like `section_title`/`html`). Drive the list from a literal array of the 27 keys so a new field component failing to render names itself in the failure. Pure reachability — no interaction beyond what rendering requires.

3. **Spec B — `e2e/workflows/field-behaviors.spec.js`**: one representative per field family — `text_input` (text), `selector` (selector), `date_selector` (date), `file_upload` (file), `controlled_list` (list), `tiptap_input` (rich-text). Cover:
   - **Validation**: `required` blocks submit; `minItems` on the list blocks submit; both pass once satisfied; `progress` saves regardless (validation split already proven in task 3 — here just the field-level wiring).
   - **`form_data` persistence**: fill each representative, `progress`-save, assert the stored `form_data` shape via `mdb`, reload the edit page and assert values re-prime.
   - **Read-only variants**: submit, then open the `-review` page and assert each representative renders its value read-only; use `workflow.setStage` to place the action at the error stage and assert the `-error` page's read-only render too.

## Acceptance Criteria

- Both specs green in the full suite.
- The sweep enumerates all 27 components; adding a 28th component to `modules/workflows/components/fields/` without extending the fixture is the only way it gains no coverage (and the spec's literal list makes the gap visible in review).
- `form_data` round-trip (save → DB shape → re-prime) asserted for all six representatives.
- File upload exercises the real upload path if the harness supports it; if it requires S3 infrastructure the test app doesn't have, render + validation coverage is acceptable — note the gap in the spec with a comment rather than mocking a backdoor.

## Files

- `apps/workflows-test/modules/workflows/workflow_config/field-gallery/field-gallery.yaml` + `gallery.yaml` — create
- `apps/workflows-test/modules/workflows/workflow_config/workflows.yaml` — modify (add `_ref`)
- `apps/workflows-test/e2e/workflows/field-render-sweep.spec.js` — create
- `apps/workflows-test/e2e/workflows/field-behaviors.spec.js` — create

## Notes

- Read each component yaml in `modules/workflows/components/fields/` for its required config before authoring the fixture form — `location`, `file_upload`, and `enum_selector` likely need more than `key` + `title`.
- Keep Spec B to the six representatives. Per-component behavior matrices are exactly what the design forbids; if a field's *logic* looks untested, that's a jest gap (Principle 4), not a Playwright case.

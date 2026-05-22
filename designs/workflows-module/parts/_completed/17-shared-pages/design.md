# Part 17 — Shared pages (task-\* + workflow-overview)

**Source rationale:** [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md). **Layer:** UI delivery. **Size:** M. **Repo:** `modules/workflows/pages/`.

## Goal

Ship the four shared, static pages that aren't generated per-action: three task-action pages (one experience across all task actions) and the workflow detail page. All four are addressed by URL query params (`?action_id=<id>` or `?workflow_id=<id>`).

## In scope

### Task pages

- **`pages/task-edit.yaml`**
  - Status selector populated from `global.action_statuses` (merged with the app-supplied display config at `vars.action_statuses_display` per [ui spec § Status-selector behaviour on `task-edit`](../../../workflows-module-concept/ui/spec.md)), filtered by the priority rule at render time. Filter inputs:
    - **Current stage**: `_request: get_action.status.0.stage` (from the reused `get_action.yaml` request — dot-zero indexing matches the Lowdefy operator dot-notation convention and v0's pattern, per [CLAUDE.md § Operator dot notation and composition](../../../../CLAUDE.md)).
    - **Status enum with priorities**: `_global: action_statuses`.
    - **Self-exception**: same-stage idempotent option allowed for the current action (matches the engine's `currentActionId` self-exception, [engine/spec.md § "Status enum priority rule"](../../../workflows-module-concept/engine/spec.md)).
    - Lower-priority transitions only; `force: true` overrides are not exposed through the UI.
    - **`not-required` terminal case**: when `_request: get_action.status.0.stage` is `not-required` (priority 0, universal terminal), the selector is disabled with a "no transitions available" message. Per engine spec, only per-entry `force: true` moves a `not-required` action — the UI never exposes that.
    - **Initial value**: the selector defaults to the action's current stage (`_request: get_action.status.0.stage`) so a same-stage save (re-submitting without changing the stage) is a one-click action. Step 7 of the `onMount` sequence (`SetState`) primes `_state.status` accordingly.
  - Universal-fields band via [part 24](../24-universal-fields/design.md)'s component (`mode: edit`, `kind: task`) — primary content, with the status selector and comment field below.
  - Comment field (rich text).
  - Save button: template-shipped `submit_edit` block; calls `update-action-{action_type}` with `interaction: submit_edit`, `current_status: <user-selected>` (task is the one interaction where the caller supplies status), `fields:` block, and a top-level `comment` field (resolver-emitted API maps it to `event.metadata.comment` — see [part 13](../13-resolver-apis/design.md) § Comment mapping).
  - **Role gate**: the Save button is additionally gated on `_state.action_allowed === true`, set by step 6 of the `onMount` sequence (`action_role_check`, the shared primitive from [part 18](../18-entity-components/design.md) per [part 16 § Button vocabulary](../16-page-templates/design.md)). Users whose effective roles don't intersect `action.access.roles` see no Save button — matches the engine's server-side gate at submit time and the form-action template behaviour.
  - **`required_after_close` gate**: when the workflow's `status.0.stage` is `completed` or `cancelled` AND the action does not declare `required_after_close: true`, the Save button renders disabled and the page surfaces a banner above the form explaining the workflow is closed. The action remains readable (universal fields, status timeline) but no write is possible. This mirrors the engine's server-side reject ([action-authoring/spec.md § Optional terminal-behaviour field](../../../workflows-module-concept/action-authoring/spec.md)) so the user sees the constraint up-front rather than via a generic post-submit error.

- **`pages/task-view.yaml`**
  - Action header (title from YAML, current status badge).
  - Universal-fields band via [part 24](../24-universal-fields/design.md)'s component (`mode: display`, `kind: task`).
  - Status timeline (from action's `status` history).
  - Comment timeline (events with `metadata.comment` populated for this `action_id`).

- **`pages/task-review.yaml`**
  - Action header + universal-fields band via [part 24](../24-universal-fields/design.md)'s component (`mode: display`, `kind: task`).
  - Template-shipped `approve` / `request_changes` buttons.
  - Optional comment field — page sends as a top-level `comment` field in the payload; resolver-emitted API maps it to `event.metadata.comment`.
  - Calls `update-action-{action_type}` with `interaction: approve` / `request_changes`.
  - **Role gate**: both `approve` and `request_changes` are additionally gated on `_state.action_allowed === true` from step 6 of the `onMount` sequence (`action_role_check`). Users without role access see no review buttons.
  - **`required_after_close` gate**: same rule as `task-edit` — when the workflow is `completed` / `cancelled` and the action does not declare `required_after_close: true`, both `approve` and `request_changes` render disabled and the workflow-closed banner appears above the form.

### Workflow overview page

- **`pages/workflow-overview.yaml`**
  - URL query: `?workflow_id=<id>`.
  - On mount, fires one `CallApi` to `get-workflow-overview` ([part 19](../_completed/19-operational-apis/design.md)). The Api routine joins the workflow + access-filtered + ordered actions in a single aggregation and returns `{ workflow, actions: [] }` (or `{ workflow: null, actions: [] }` when no actions are visible — the page redirects back to its host entity page in that case). The page does not ship its own page-level `Request` blocks for the workflow / actions fetch — the single Api call is the canonical read path.
  - Renders header via `_ref` to [part 18](../18-entity-components/design.md)'s `workflow-header` component, passing the workflow doc returned by the Api. The component carries title, lifecycle stage badge (from `workflow.status.0.stage` + `global.workflow_lifecycle_stages`), summary counts (`workflow.summary.{done, not_required, total}`), and the current-phase milestone label. The collapse / expand toggle hides the action card list below (analogous to how it hides the group sections on the entity page). No `workflow-header` API changes needed for v1 — same data shape, same component.
  - List of action cards wrapped in `layout.card`:
    - Status badge + `status_map.{current_stage}.{app_name}.message` (Nunjucks-templated).
    - Optional link button to action's own page.
    - Card body: empty-state Html block (when no `form_data` slice exists for the action) or a DataView over the slice. The DataView's `formConfig` concatenates `global.action_form_configs.{action_type}.form` and `.form_review` into one ordered array (preserves v0's `_array.concat` pattern for the same DataView). The renderer switches on each node's `component` to pick the read-only renderer; recurse into the nested `form:` array on structural components (`controlled_list`, `section`, `box`, `label`, `file_upload`).
    - **Per-card `form_data` indexing**: the data slot reads `workflow.form_data[action.type]` for non-keyed actions and `workflow.form_data[action.type][action.key]` for keyed actions. The action doc's `key` field is the discriminator — returned by `get-workflow-overview` per [part 19 task 6](../_completed/19-operational-apis/tasks/06-get-workflow-overview-api.md) ("Keyed actions are not collapsed — each action doc surfaces as its own entry in `actions[]`, with `key` populated"). Since each keyed instance surfaces as its own card with its own `action.key`, per-card indexing is a simple lookup with no `_if` branching needed when the YAML uses the standard `_get` chain with `key: action.type` falling through to `key: action.key`.
  - Keyed actions render as N cards within their group slot, kept adjacent by the Api's `(_group_index, sort_order, _id)` sort.
  - Tracker actions link to the child workflow's `workflow-overview` page when configured.
  - **Entity back-link**: a back button (or breadcrumb) deep-links to the host app's entity page. URL is built from the new `entities` module var (see "`entities` module var" below) — `pageId: _module.var: entities[workflow.entity_collection].page_id`, `urlQuery: { <id_query_key>: workflow.entity_id }`. The breadcrumb label is `"<title> <entity_id>"` (e.g. `"Lead 65a1f3..."`), composed from `entities[workflow.entity_collection].title` and `workflow.entity_id` — informative without an entity-doc fetch.

- **`pages/group-overview.yaml`** — shared page focused on a single action group within a workflow. Shipped in [part 25](../../25-group-overview-page/design.md). Part 17 doesn't own the file; this line is a pointer so the shared-pages inventory stays coherent.

### Reused module-shipped requests

The task and overview pages reuse the request files shipped by [part 16](../16-page-templates/design.md) at `modules/workflows/requests/` — no parallel `requests/` files in this part.

- **Task pages** (`task-edit`, `task-view`, `task-review`) fire `requests/get_action.yaml` on mount (matched by `_id: { _url_query: action_id }`), and `task-edit` additionally fires `requests/get_workflow.yaml` to prime form-state defaults from `form_data.{action_type}` (and the keyed-action variant `form_data.{action_type}.{key}`). Task pages do **not** fetch the entity doc — they don't render entity-context fields or back-links to the entity page in v1.
- **Workflow-overview** fires `get-workflow-overview` (single `CallApi`, per the bullet above) and does **not** fetch the entity doc. The entity-page back-link URL is built from the new `entities` module var (see below) rather than from a runtime entity fetch — the workflow doc returned by the Api already carries `entity_id` and `entity_collection`, and the `entities` enum maps `entity_collection` to a `page_id` + `id_query_key` + `title`. The entity doc itself isn't read in v1 (no entity-name-style chrome that would need it); the richer-label path lives in [part 26](../26-entity-data-contract/design.md).

### `entities` module var

The workflows module declares a new required `vars.entities` map at module entry time. The map keys workflow `entity_collection` values to the metadata the module needs to deep-link back to the host app's entity page.

```yaml
modules:
  - id: workflows
    source: ...
    vars:
      workflows_config: { _ref: ... }
      entities:
        leads-collection:
          page_id: lead-view
          id_query_key: _id
          title: Lead
        tickets-collection:
          page_id: ticket-view
          id_query_key: _id
          title: Ticket
```

Fields per entry:

- **`page_id`** — host-app page id rendering the entity. The workflows module deep-links via `Link { params: { pageId: <page_id>, urlQuery: { <id_query_key>: <entity_id> } } }`.
- **`id_query_key`** — the URL query string key the entity page expects for its primary id (commonly `_id`; some apps may use `id` or a domain-specific name).
- **`title`** — singular human-readable entity-kind label for breadcrumbs / chrome (e.g. "Lead", "Ticket", "Device"). Avoids the slug-style `tickets-collection` appearing in UI strings.

**Read mechanism**: `_module.var: entities` from inside module-shipped pages. Module-internal consumers only (workflow-overview's back-link in v1; part 18's `workflow-header` may consume `title` for the entity-kind label).

**Forward compatibility**: [part 26](../26-entity-data-contract/design.md) extends this enum with an optional `get_entity_endpoint` field so apps can register an Api endpoint that returns entity-shaped data for richer breadcrumb labels and to replace part 16's `get_entity.yaml.njk` fetch with a `CallApi` against the app's endpoint. Part 17 ships the enum without that field; part 26 adds it without breaking existing entries.

**Build-time validation** ([part 4](../04-workflow-config-schema/design.md) obligation): every distinct `entity_collection` referenced by any workflow in `workflows_config` must have a matching key in `vars.entities`. Missing entries fail the build with a precise message ("workflow `onboarding` uses `entity_collection: leads-collection`, but `vars.entities['leads-collection']` is not declared"). Defense in depth with [part 20](../20-module-manifest/design.md)'s manifest-level `required: true` on the var.

**Manifest declaration** ([part 20](../20-module-manifest/design.md) obligation): `vars.entities` declared with `type: object`, `required: true`, and the description above. Per-key shape (`page_id`, `id_query_key`, `title`) documented in the manifest description; not statically schema-validated in v1 (Lowdefy var schemas don't validate nested keys), so the part 4 validator handles the runtime completeness check.

### Page event wiring

Same `onMount` / `onSubmit` / `onApprove` / `onRequestChanges` vocabulary as [part 16](../16-page-templates/design.md). Apps customize via `pages.{verb}.events.{handler}` on the task action YAML (declared in [part 4](../04-workflow-config-schema/design.md)).

**What's supported on task actions:**

- **`pages.{verb}.events.{handler}`** — yes. Same vocabulary as form actions. Apps can declare `onMount`, `onSubmit` (task-edit), `onApprove`/`onRequestChanges` (task-review) and the shared task page wires them in at step 8 of the `onMount` sequence (tail step, after all module-shipped wiring).

**What's NOT supported on task actions:**

- **`pages.{verb}.template`** — no per-task page template override. Task pages are shared by design ([ui spec § Static task-action pages](../../../workflows-module-concept/ui/spec.md)) — apps that need different task UX use form actions instead.
- **All other `pages.{verb}.*` chrome slots** (`title`, `requests`, `formHeader`, `formFooter`, `modals`, `maxWidth`, `buttons.submit.{title,modal}`) — also rejected. Allowing per-action chrome overrides on shared pages would create a Frankenpage where different task actions render with different headers, footers, modal configs, and titles — defeats the "one experience per task verb" contract. Authors who need per-action chrome use form actions.

[Part 4](../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig` validator rejects task actions that declare any `pages.{verb}.*` field other than `events.{handler}` with a precise error message pointing at this constraint. (Note for part 4 implementation: the form-action validator accepts the full `pages.{verb}.*` set; the task-action validator runs the same parse with an allowlist of `events.{handler}` only.)

### Stale-URL redirect guards (task pages)

Each task page runs a status-stage guard in `onMount` after `get_action` resolves (step 3 of the `onMount` sequence below). If the action's current stage isn't in the template's allowlist, the page redirects to `task-view?action_id=<id>` (the shared task view — equivalent to part 16's `-view` redirect target). Prevents stale tabs / stale email links from rendering an editable task form against terminal state.

| Page          | Allowed stages                                     | Notes                                                                                       |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `task-edit`   | `[action-required, in-progress, changes-required]` | Same allowlist as part 16's `edit.yaml.njk`. Pre-review writable states.                    |
| `task-view`   | (no guard)                                         | View is always reachable; renders read-only at any stage.                                   |
| `task-review` | `[in-review, error]`                               | Same allowlist as part 16's `review.yaml.njk`. `error` included — task actions can land in `error` when a hook or side-effect throws ([engine/spec.md § Engine-driven mid-submit failure](../../../workflows-module-concept/engine/spec.md)). |

Allowlists are hardcoded at the top of each task page (single constant array), mirroring part 16's pattern. If a new status is added to `global.action_statuses`, the template author decides whether it belongs in any of these allowlists; no automatic propagation.

### `onMount` sequence (task pages)

Task pages run the same eight-step `onMount` sequence committed by [part 16 § "Template `onMount` sequence"](../16-page-templates/design.md), emitted at Nunjucks render time on each of the three task pages. The sequence is duplicated (not extracted into a shared partial) — same pragmatic choice part 16 makes across its four form-action templates. **Must stay in sync with part 16's sequence**; tests on both sides should assert step-by-step parity.

The eight steps, with task-page-specific notes:

1. **`action_id` presence guard** — `Link back: true` if `_url_query.action_id` is null.
2. **`Request: get_action`** — fires `requests/get_action.yaml` (reused from part 16).
3. **Stale-URL redirect guard** — per the task-page allowlist defined in the "Stale-URL redirect guards (task pages)" subsection above.
4. **`Request: get_workflow`** — `task-edit` only; needed for form-state defaults and the `required_after_close` gate. `task-view` and `task-review` skip this step (no form-state priming).
5. **`Request: get_entity`** — skipped on all task pages (v1 doesn't fetch the entity doc on task pages; see "Reused module-shipped requests").
6. **`action_role_check`** — sets `_state.action_allowed`; task pages gate write buttons on it (see the "Role gate" bullets on `task-edit` and `task-review` above).
7. **`SetState`** — primes form state:
   - **`task-edit`**: primes `_state.fields.assignees` / `_state.fields.due_date` / `_state.fields.description` from `get_action`, primes `_state.status` (the status selector's default) to `_request: get_action.status.0.stage` for the same-stage idempotent case.
   - **`task-view` / `task-review`**: no form-state to prime; this step is a no-op slot (kept for sequence parity so adding a future input doesn't shift step numbers).
8. **Author-supplied `pages.{verb}.events.onMount`** — runs last, after all the above are in state.

The form-action overview at [part 16 § "Template `onMount` sequence"](../16-page-templates/design.md) is the canonical reference for the engine-side ordering; this list is the task-page projection of that sequence.

### Layout-module composition

Same as part 16: `layout.page` → `layout.card` → `layout.floating-actions` for buttons.

## Out of scope / deferred

- **Comment-timeline shape refinement.** Concept marks as "refinement based on real-app patterns." Ship the v1 shape (events filtered by `action_ids` and `metadata.comment`).
- **Restricted-action tile on `workflow-overview`** — concept marks as open question; ship sensible default (hide), iterate.
- **Completed-workflow tile UX detail** — same; ship sensible default.
- **Entity-doc fetch + richer back-link labels** → [part 26](../26-entity-data-contract/design.md). v1 ships `"<title> <entity_id>"` as the back-link label without any entity fetch; part 26 adds an optional `get_entity_endpoint` on the `entities` enum so apps can serve a richer label (`display_label` etc.) and so part 16's form-action templates can replace `get_entity.yaml.njk` with `CallApi`.

## Depends on

[Part 4](../04-workflow-config-schema/design.md) (validates the `pages.{verb}.events.{handler}`-only allowlist for task actions; rejects other `pages.{verb}.*` slots; **also validates that every `entity_collection` referenced in `workflows_config` has a matching `vars.entities` entry**), [part 13](../13-resolver-apis/design.md) (task pages call `update-action-{action_type}`), [part 15](../_completed/15-resolver-form-builder/design.md) (`global.action_form_configs`), [part 16](../16-page-templates/design.md) (reuses `requests/get_action.yaml`, `get_workflow.yaml` from part 16's filesystem layout; `get_entity.yaml.njk` is NOT consumed by part 17), [part 18](../18-entity-components/design.md) (`workflow-header` component composed by the overview page), [part 19](../_completed/19-operational-apis/design.md) (`get-workflow-overview` Api), [part 20](../20-module-manifest/design.md) (declares the new `vars.entities` module var with `required: true`), [part 24](../24-universal-fields/design.md) (universal-fields component composed by all three task pages).

## Verification

- Worked-example demo:
  - Lead with onboarding workflow: clicking `schedule-followup` (task action) navigates to `workflows/task-edit?action_id=...` with the right action loaded.
  - Submitting `task-edit` transitions the action; lead page reflects the new state.
  - `workflows/task-edit?action_id=...` priority-filtered status selector: from `action-required` shows lower-priority transitions plus the same-stage idempotent option; from `not-required` the selector is disabled with the "no transitions available" message.
  - `workflows/task-edit?action_id=...` and `task-review` write buttons hide / disable correctly for users without role access (`_state.action_allowed === false`).
  - `workflows/task-edit?action_id=...` and `task-review` show the workflow-closed banner and render their write buttons disabled when the workflow is `completed` / `cancelled` and the action doesn't declare `required_after_close: true`.
  - `workflows/task-view?action_id=...` renders the action header, universal-fields display, status timeline (from action's `status` history), and comment timeline (events with `metadata.comment` populated for this `action_id`).
  - `workflows/task-review?action_id=...` renders the read-only universal fields plus `approve` / `request_changes` buttons; clicking `approve` transitions to `done`, clicking `request_changes` transitions to `changes-required`.
  - Stale-URL redirect: opening `task-edit?action_id=...` against an action in `done` redirects to `task-view?action_id=...`.
  - Task action with an author-supplied `pages.edit.events.onSubmit` fires the handler before the API call; task action declaring any other `pages.edit.*` field (e.g. `formHeader`, `title`) fails the build. Same verb namespace (`edit` / `view` / `review`) as form actions — the `task-` prefix only appears on the module-shipped page filenames, not in author YAML.
  - `workflows/workflow-overview?workflow_id=...` renders all four actions in order with current status + form_data display.
  - Workflow-overview header renders correctly via part 18's `workflow-header` component (title, lifecycle badge, summary counts, milestone label).
  - Workflow-overview correctly indexes `form_data` for keyed actions: a keyed `proof-of-installation` action with `key: device-A` renders the card's DataView against `workflow.form_data["proof-of-installation"]["device-A"]`.
  - Workflow-overview's entity back-link navigates to the right host-app entity page: with `vars.entities = { leads-collection: { page_id: lead-view, id_query_key: _id, title: Lead } }`, the back button on a workflow whose `entity_collection: leads-collection` and `entity_id: <id>` navigates to `/lead-view?_id=<id>`. Breadcrumb / button label reads `"Lead <id>"` — `title` plus the entity_id from the workflow doc.
  - Build-time validator: a workflow YAML declaring `entity_collection: foo-collection` without a matching `vars.entities['foo-collection']` entry fails the build with the precise message documented in part 4.
- a11y + responsive: pages reflow on narrow viewports, keyboard nav works.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md). This part's verification is unit-tests + handler-level integration smoke only.

## Open questions

- **Task pages addressing scheme.** Concept says `?action_id=` only; confirm during implementation.
- **Tracker action linking on overview.** Inline-only in v1 vs. linkable into child workflow. Lean inline; revisit if a real app needs.
- **Extract `_action_page_onmount.yaml.njk` partial.** v1 ships the eight-step `onMount` sequence inline on each of the seven module-shipped templates (part 16's four form-action templates + part 17's three task pages). If drift between form and task surfaces materializes during implementation or in early app usage, extract a shared Nunjucks partial owned by part 16 and `{% include %}` it from all seven templates. Defer until drift risk is measurable, not pre-emptive.

## Contract to neighbours

- **Part 19** ships `get-workflow-overview`; this part consumes it via a single `CallApi` on the overview page's mount. Part 17 does not duplicate the workflow+actions join as a page-level `Request`.
- **Part 18** owns the `workflow-header` component (composed by the overview page) and the `action_role_check` primitive (called by all three task pages at step 6 of the `onMount` sequence to set `_state.action_allowed`). The overview page `_ref`s `workflow-header` rather than reimplementing the title / lifecycle badge / summary counts / milestone label.
- **Part 16** owns the canonical `requests/get_action.yaml`, `requests/get_workflow.yaml`, and `requests/get_entity.yaml.njk` files at `modules/workflows/requests/`. Part 17's task pages `_ref` `get_action.yaml` (all three) and `get_workflow.yaml` (task-edit only); the overview page does NOT consume `get_entity.yaml.njk` (build-time Nunjucks substitution doesn't fit the overview's per-workflow-instance entity_collection). Part 16 is also the canonical reference for the eight-step `onMount` sequence — part 17 duplicates the sequence inline (see open question on extracting a partial).
- **Part 20** declares the `vars.entities` module var with `required: true` in the manifest. The var is consumed by part 17's workflow-overview (back-link URL construction) and potentially by part 18's `workflow-header` (entity-kind title for chrome).
- **Part 15** emits `global.action_form_configs.{action_type}.form` / `.form_review`. The overview page's DataView reads these metadata trees per card.
- **Part 24** ships the universal-fields component composed by all three task pages (`mode: edit` on `task-edit`; `mode: display` on `task-view` / `task-review`).
- **Part 13** emits the `update-action-{action_type}` endpoints task-\* pages call.
- **Part 4** validates the task-action `pages.{verb}.*` allowlist: only `events.{handler}` is allowed. The validator rejects any other `pages.{verb}.*` field on a task action at build time with a message pointing at this part's "Page event wiring" section.
- **Part 22** ships the end-to-end suite that covers the worked-example flows referenced by this part's verification.

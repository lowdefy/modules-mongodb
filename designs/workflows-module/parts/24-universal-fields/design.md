# Part 24 — Universal-fields surface (`assignees`, `due_date`, `description`)

**Source rationale:** [workflows-module-concept/engine/spec.md](../../../workflows-module-concept/engine/spec.md) (reserved action-doc fields), [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md) (display rules per kind/verb). **Layer:** UI + write-path. **Size:** M. **Repo:** `modules/workflows/components/universal-fields/`.

## Goal

Pin the contract for the three action-level fields every form/task action carries — `assignees`, `due_date`, `description` — across the form and task kinds, all template verbs, all read/write surfaces. Ship one reusable Lowdefy component the page templates (part 16) and shared task pages (part 17) compose; lock the interaction / lifecycle / role-gating rules so the consuming parts don't each invent their own.

Tracker actions are excluded from v1 — they have no view surface (no `-view` / `-edit`, only inline rendering in `actions-on-entity` via `status_map.message`), so there's nowhere to render the universal-fields band. The tracker doc still carries the three fields (the engine writes them at `StartWorkflow` time, carried from the parent action), but no UI renders them in v1. See "Open questions" for the deferred discussion.

This part exists because the universal fields touch enough of the module — edit-time inputs, view-time display, post-close edits, event-timeline integrity, role gating, badge formats on entity pages — that pinning them down via a sub-section in part 16 underspecified the cross-cutting questions. Split into its own part so the contract is reviewable in one place.

## In scope

### Component shipped

`modules/workflows/components/universal-fields/universal-fields.yaml` — single Lowdefy component with two render modes (`edit` / `display`). Consuming pages `_ref` it with vars:

```yaml
- _ref:
    path: components/universal-fields/universal-fields.yaml
    vars:
      mode: edit            # 'edit' | 'display'
      kind: form            # 'form' | 'task' — tracker excluded per Goal above
      action_data:          # action doc fields the inputs bind to
        assignees: { _state: fields.assignees }
        due_date:  { _state: fields.due_date }
        description: { _state: fields.description }
```

Block-id conventions match the CLAUDE.md "Input block IDs match data paths" rule: `fields.assignees`, `fields.due_date`, `fields.description`. The component-level inputs bind to `_state.fields.*` so the page-level button can post `fields: { _state: fields }` (per part 16 "Button payload").

Binding convention by mode:

- **`mode: edit`** — callers pass `action_data` bound to `_state.fields.*` (as above). Inputs are primed by the page's `onMount` step that seeds `_state.fields` from the loaded action doc, and the submit button posts the same `_state.fields` subtree.
- **`mode: display`** — callers pass `action_data` bound to `_request: get_action.*`:

  ```yaml
  - _ref:
      path: components/universal-fields/universal-fields.yaml
      vars:
        mode: display
        kind: form
        action_data:
          assignees:   { _request: get_action.assignees }
          due_date:    { _request: get_action.due_date }
          description: { _request: get_action.description }
  ```

  Display mode reads straight from the loaded action doc — there's no `_state.fields` priming on `-view` / `-review` pages.

### Where the component renders

| Surface                                | Mode                                                          | Notes                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Form action `edit` page (part 16)      | `edit` — header band above the form body                      | Same `submit_edit` interaction writes both universal fields and form fields.                                            |
| Form action `view` page (part 16)      | `display`                                                     | Read-only.                                                                                                              |
| Form action `review` page (part 16)    | `display`                                                     | Read-only. Reviewers don't edit universal fields here; if they need to, they round-trip via the `Edit` navigation button. |
| Form action `error` page (part 16)     | `display`                                                     | Read-only. Recovery flow doesn't include metadata edits.                                                                |
| Task action `task-edit` page (part 17) | `edit` — primary content (status selector + comment sit below) | Same `submit_edit` interaction.                                                                                         |
| Task action `task-view` / `task-review` (part 17) | `display`                                          | Read-only.                                                                                                              |

### Interaction model

**Decision: keep universal-field writes on the same `submit_edit` interaction** as form fields, not a separate `update_metadata` interaction.

Reasons:

- One write per user submit — minimizes round-trips and avoids two events on a single user action.
- Form data and universal fields live on different documents (form data on workflow, universal fields on action), but they're a single logical edit from the user's POV — splitting at the user surface is artificial.

Trade-off: the engine-default event timeline row (rendered by `buildDefaultLogEventPayload`'s Nunjucks template) shows the status transition + comment; a same-submit universal-field change isn't called out separately. The action doc carries the new field values regardless — the gap is purely on the timeline's display string, not on the underlying audit data. Apps that need universal-field changes called out today can wire a pre-hook on the affected actions to stamp a custom `event_overrides.display` (the layer-3 path described in [part 9 (hook invocation)](../_completed/09-hook-invocation/design.md)). A future engine-level enhancement could ship a richer default template that surfaces metadata diffs out of the box — out of scope here.

Deferred to v1.x if real apps complain: a `update_metadata` interaction with `update-action-{action_type}` accepting `interaction: update_metadata` + a `fields` payload, no form data, no status change. The engine already has the plumbing — only the page-level affordance is missing.

### Lifecycle rules

Universal fields are editable iff the action's current stage allows writes — same allowlist as the `edit` template's stale-URL guard:

- **Editable**: `action-required`, `in-progress`, `changes-required`.
- **Read-only**: `in-review`, `done`, `not-required`, `error`, `blocked`.

`required_after_close: true` is **about the workflow lifecycle, not the action stage**. The flag lets an action survive `close-workflow` (it is not swept to `not-required`) and lets `SubmitWorkflowAction` accept writes against a `completed` / `cancelled` workflow. The surviving action keeps its current non-terminal stage (`action-required`, `in-progress`, etc.), so the existing editable-stage allowlist already covers the edit page — no URL-guard exception is needed. Once the action's own stage reaches `done` / `not-required`, the universal-fields band is read-only regardless of `required_after_close` (a dedicated post-terminal metadata-edit surface is deferred — see "Out of scope").

`error` status: universal fields are **read-only** on the `-error` page. The recovery flow focuses on resolving the failure context, not bulk-editing metadata. Authors who need universal-field changes mid-error use the `submit_edit` route (the `resolve_error` interaction does not reach the universal-fields band).

### Role gating

**Decision: same `access.roles` as the parent action.**

Authors who want a finer-grained "anyone can reassign, only specific roles can submit" model declare a custom action with a stripped-down form schema. The universal-fields surface doesn't introduce a separate role vocabulary in v1.

The component reads `_state.action_allowed` (populated by `action_role_check` in step 6 of the page's `onMount`) and switches every input to read-only when `false`, regardless of `mode: edit`. This is defense in depth: the page-level button gate prevents submission, but rendering disabled inputs prevents users from typing changes that won't save.

### Required-field signal

Each action declares which universal fields are mandatory on its YAML:

```yaml
type: qualify
kind: form
access: { roles: [sales] }
universal_fields_required:
  assignees: true     # default false
  due_date: false
  description: false
```

`universal_fields_required` is an object with three optional booleans (`assignees`, `due_date`, `description`), all defaulting to `false`. Authoring contract amendment: add this field to [action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md) reserved-field table alongside `required_after_close`. Resolver passthrough (the existing `makeWorkflowsConfig.js` / `makeActionPages.js` allowlists) is updated to carry the new field — same pattern `required_after_close` already follows.

Consuming pages pass the resolved config to the universal-fields component as a new var:

```yaml
- _ref:
    path: components/universal-fields/universal-fields.yaml
    vars:
      mode: edit
      kind: form
      required:
        _var: action_config.universal_fields_required
      action_data: { ... }
```

Inside the component:

- Edit mode — for each of the three inputs, stamp `required: true` when `_var: required.{field} === true`. Input-block validation handles the "Required" message at submit time (Part 16's `^fields\.` `Validate` regex already covers these blocks).
- Display mode — `required` is ignored. The view-side reflects the stored value; the required signal only matters for the writer.

Engine-side enforcement is deferred. The handler does not throw on missing required fields in v1 — input-block validation already catches the user-facing case. If an API consumer hits the per-action endpoint directly with a `null` assignee on a required-assignee action, the write goes through; revisit if real API consumers expose this gap. Tracked as Open question.

### Display rules

- **Empty-state**: when a field is `null` / `[]`, display mode shows a dimmed placeholder (`Not assigned`, `No due date`, `No description`). Edit mode shows the empty input.
- **Date formatting**: `due_date` displays via `_dayjs.format` with locale-aware formatting; component accepts a `date_format` var (default `MMM D, YYYY`).
- **Assignees**: display mode renders one `_ref: { module: user-account, component: user-avatar }` per assignee (picture + name); edit mode uses `_ref: { module: user-account, component: user-selector }` in multi-select mode, bound to `_state.fields.assignees`. Both components are shipped by [part 24a](../24a-user-account-selector-avatar/design.md) — `user-selector` is the migrated copy from user-admin (filtered to `apps.{app_name}.is_user: true` so the dropdown only lists actual app users); `user-avatar` is new.
- **Description**: edit mode renders a `TiptapInput` (rich text — paragraphs, links, basic formatting); display mode renders an `Html` block reading `description.html`. Stored on the action doc as `{ text: string, html: string } | null` — mirrors how the existing `comment` field is already passed through the engine. The `text` shadow stays available for length checks, plain-text search, and required-field validation. No "show more" truncation in v1 — Tiptap content wraps; truncation can be added later if descriptions get unwieldy in practice.

Engine spec amendment: [`workflows-module-concept/engine/spec.md:132`](../../../workflows-module-concept/engine/spec.md) currently lists `description` as `string | null` — update to `{ text: string, html: string } | null` to align with the shipped behaviour (the `comment` field already carries this shape today, even though its JSDoc still says "string"). Carry this amendment under part 24 rather than spinning a separate spec-fix part — it's the same change either way.

### Module-shipped requests added

None. The Selector and avatar both reach into user-account via cross-module component refs (see "Display rules"); no new requests ship from the workflows module for the universal-fields surface.

### Manifest dependency

`modules/workflows/module.lowdefy.yaml` gains `user-account` under `dependencies:` (alongside the existing `layout` and `events`). Required so `_ref: { module: user-account, component: ... }` resolves at build time.

## Out of scope / deferred

- **Dedicated `-metadata` edit surface.** Considered and deferred. Adding a separate page or modal for "edit metadata after close" is purely additive — v1 routes post-close edits through the `edit` page with `required_after_close: true`. Revisit if real apps need it; the new surface would land as part 24.x.
- **Separate `update_metadata` interaction.** Deferred per "Interaction model" above.
- **Per-field role gating.** Deferred per "Role gating" above.
- **Engine-side handler enforcement of `universal_fields_required`.** Deferred per Open questions; v1 relies on input-block validation only.
- **Custom universal-field schemas per app.** v1 fixes the three fields. Apps that need additional action-level metadata add it to the form schema; promoting more fields to the universal band is a v1.x consideration.
- **Authoring overrides for the universal fields' display chrome** (e.g. custom date format per action). Apps style globally via the layout module; per-action customization is not in v1.

## Depends on

- **[Part 5 (start/cancel handlers)](../_completed/05-start-cancel-handlers/design.md)** — the action doc shape these fields live on.
- **[Part 6 (submit-action writes)](../_completed/06-submit-action-writes/design.md)** — handler reads / writes the fields.
- **[Part 18 (entity-components)](../18-entity-components/design.md)** — `action_role_check` populates `_state.action_allowed` that gates the component's edit mode.
- **[Part 24a (user-account selector + avatar)](../24a-user-account-selector-avatar/design.md)** — ships `user-selector` (migrated from user-admin) and the new `user-avatar` component; workflows depends on user-account to consume both.

## Consumers

- **[Part 16 (page-templates)](../16-page-templates/design.md)** — form-action edit/view/review/error templates compose this component for the universal-fields band.
- **[Part 17 (shared-pages)](../17-shared-pages/design.md)** — task pages compose this component as primary content (task-edit) or display (task-view, task-review).

## Verification

- Unit / build-time:
  - Component renders with `mode: edit` and inputs auto-bind to `_state.fields.*`.
  - `mode: display` renders read-only with placeholders for null/empty values.
- Integration (covered by demo app):
  - Form action's edit page submits both form fields and universal fields in one `submit_edit` payload; action doc shows the update.
  - Task action's edit page renders universal fields as primary content with the status selector below.
  - `required_after_close: true` keeps the band editable after terminal status.
  - `_state.action_allowed === false` switches all inputs to read-only.
- End-to-end coverage lands in [part 22](../22-workflows-e2e-suite/design.md).

## Open questions

- **Tracker action authoring of universal fields.** Tracker actions don't have an edit page; how do their universal fields get set initially and edited later? Candidates: (a) on the parent form-action's edit page that spawned the tracker, (b) inline in `actions-on-entity` via a click-to-edit affordance, (c) a small modal launched from the tracker badge. v1 default: tracker universal fields are set on `StartWorkflow` if the parent action carries them through, and immutable otherwise. Revisit if apps need post-start tracker reassignments.
- **Engine-side enforcement of `universal_fields_required`.** v1 relies on input-block validation (Part 16's `^fields\.` `Validate` regex). The submit handler does not check the flag — an API consumer hitting `update-action-{type}` directly with a missing required field will succeed. Add a handler-side check (and a matching error model) if a real API consumer surfaces the gap.
- **`description` length and truncation affordance.** v1 ships full-height TiptapInput / Html rendering — long descriptions wrap, no truncate-with-expand. If real apps ship book-length descriptions and complain about page length, add a `line-clamp` + "show more" toggle in display mode (likely via an `Html` + `_state.description_expanded` flag, or a small custom block). Not promoting to a stricter affordance until somebody asks.
- **Universal-field writes on form-kind actions — same endpoint as `submit_edit`, or split?** The current decision (under "Interaction model" above) is to keep universal-field writes on the same `submit_edit` interaction. That decision still holds for task-kind actions, where the universal fields are primary content. For form-kind actions, where the universal fields are a header band above a separate form body, it's worth considering whether the metadata write should split off into its own endpoint / interaction — for cleaner audit, finer-grained permission gating, or to let metadata edits land without re-running form validation. To be discussed separately. **If this resolves to a split for form-kind, finding #8 in [review-1](../24-universal-fields/review/review-1.md) needs to come back to "Resolved" — `kind: form` vs `kind: task` would then drive a real behavioural difference inside the component (which endpoint the submit-adjacent affordances target), and the var earns its keep.**

## Contract to neighbours

- **Parts 16 / 17** consume this component via `_ref`. They don't author universal-field inputs inline. Part 18 doesn't consume it in v1 — tracker rendering stays `status_map.message`-only (see Goal).
- **Part 6 (handler)** reads `fields.{assignees, due_date, description}` from the payload and writes them to the action doc — already shipped per the reserved-field list in engine spec.

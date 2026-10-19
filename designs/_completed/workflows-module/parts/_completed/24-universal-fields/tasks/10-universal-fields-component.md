# Task 10: The `universal-fields` component

> **Rev 2:** drops the `action_type` var; the Update endpoint is built at **runtime** via `_string.concat` (per-workflow id); the Update button renders for **both** kinds in edit mode (no check special-case); display binds from primed `_state.*` (single-object `get_workflow_action` envelope — no `.0.`); block ids are namespaced by `state_path` via `_string.concat`.

## Context

`modules/workflows/components/universal-fields/universal-fields.yaml` is currently a render-nothing stub (Part 20a) that the form templates (`templates/{edit,view,review,error}.yaml.njk`) and the shared check surface (`components/check-action-surface.yaml`, Part 40) already `_ref`. This task ships the real component. It is a plain `.yaml` consumed with **operator-valued vars** (`action_data` leaves are `_state` operators), so block-id namespacing uses `_string.concat` operators, **not** njk.

Everything it composes already exists:

- Endpoint `{workflow_type}-update-fields` (task 8, per-workflow) running the `UpdateActionFields` handler (task 5).
- `action_config.universal_fields` normalized to an array (task 7) — consumers pass it as `show`.
- `user-multi-selector` with an `id` + `title` var, `user-avatar` (`vars: { user: <doc with operator leaves> }`), and `assignee_docs` on the `get_workflow_action` envelope (task 9 — a **single object**, so consumers bind `_state: action.assignee_docs` / `current_action.assignee_docs` after priming; no `.0.`).
- `allowed` as a per-verb map `{ view, edit, review, error }` on the `GetWorkflowAction` envelope (form templates prime `_state.action.allowed`, the check surface `current_action.allowed`). Edit affordances gate on `allowed.edit`.

Behaviour matrix (design):

| `kind`  | `mode`    | Renders                                                  | Write path                                                                                                |
| ------- | --------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `form`  | `edit`    | Sidebar card: declared inputs + own **Update** button    | Button → `{workflow_type}-update-fields` (independent of submit)                                          |
| `form`  | `display` | Sidebar card, read-only                                  | —                                                                                                         |
| `check` | `edit`    | Primary content: declared inputs + own **Update** button | Update button → `{workflow_type}-update-fields`; **and** the surface's `submit`/`progress` carry `fields` |
| `check` | `display` | Primary content, read-only                               | —                                                                                                         |

## Task

Replace the stub with the real component. Vars:

- `mode` — `'edit' | 'display'` (required).
- `kind` — `'form' | 'check'` (required; tracker excluded; drives the sidebar-card vs plain-Box chrome).
- `state_path` — state namespace for the inputs (default `fields`). Block ids become `{state_path}.{field}` via `_string.concat` (precedent: `components/fields/controlled_list.yaml:28` builds an id with `_string.concat: [{ _var: key }, '_label']`).
- `workflow_type` — used to build the Update endpoint id. A **literal** string from form njk templates (`{{ workflow_type }}`) or a **state operator** from the check surface (`{ _state: current_action.workflow_type }`); both resolve through the same runtime `_string.concat`.
- `action_id` — operator leaf the Update payload reads (`{ _state: action._id }` form / `{ _state: current_action._id }` check). Passed by the consumer — the action root differs by kind, so it is not derived from `state_path`.
- `allowed_edit` — operator leaf for the edit gate (`{ _state: action.allowed.edit }` / `{ _state: current_action.allowed.edit }`).
- `show` — array of field names to render; default `[assignees, due_date, description]` via `_var: { key: show, default: [...] }`. Per-field presence gated at build time via `_build.array.includes`.
- `action_data` — map of operator leaves: `assignees`, `due_date`, `description`, and (display) `assignee_docs`.
- `on_complete` — actions appended after the Update CallAPI (default `[]`), so the consumer supplies the refetch/refresh (form sidebar refetches `get_workflow_action`; the check surface passes its own `on_complete`). Mirrors the check surface's signal-button pattern.
- `date_format` — display date format, default `MMM D, YYYY`.

Structure:

1. **Chrome by kind** (build-time branch): `kind: form` wraps in a `Card` (sidebar card — title e.g. `Details`); `kind: check` renders a plain `Box`. Use the parent `layout.gap` for spacing.
2. **Edit inputs** (`mode: edit`), each gated on `show` membership (`_build.array.includes`), ids built from `state_path`:
   - `assignees` → `_ref: { module: user-account, component: user-multi-selector, vars: { id: { _string.concat: [{ _var: state_path }, '.assignees'] }, title: Assignees } }`.
   - `due_date` → `DateSelector`, `id: { _string.concat: [{ _var: state_path }, '.due_date'] }`, title `Due date`.
   - `description` → `TiptapInput`, `id: { _string.concat: [{ _var: state_path }, '.description'] }`, title `Description` (TiptapInput stores `{ text, html }`).
   - Disable inputs when `allowed_edit` is false: `properties.disabled: { _eq: [{ _var: allowed_edit }, false] }` (defense in depth — the handler's verb gate is authoritative).
   - State priming is the **container's** job (form `onMount` SetStates `fields.*`; the check surface seeds `current_action.fields.*`) — the component only binds.
3. **Update button** (`mode: edit`, **both kinds**), snake_case id:

   ```yaml
   - id: button_update_fields
     type: Button
     properties: { title: Update, type: primary }
     visible:
       _eq:
         - _var: allowed_edit
         - true
     events:
       onClick:
         _build.array.concat:
           - - id: validate_fields
               type: Validate
               params:
                 regex:
                   - _string.concat: ["^", { _var: state_path }, '\.'] # ^fields\. or ^current_action\.fields\.
             - id: update_fields
               type: CallAPI
               params:
                 endpointId:
                   _string.concat:
                     - _module.id: true
                     - /
                     - _var: workflow_type
                     - -update-fields
                 payload:
                   action_id: { _var: action_id }
                   fields: { _state: ... } # the {state_path} subtree — see note
                   comment: null # no comment input in v1 (form); check surface has its own
           - _var: { key: on_complete, default: [] }
   ```

   The `fields` payload posts the `state_path` subtree. Since `_state` needs the resolved path string, build it as `{ _state: { _var: state_path } }` (operator value), or have the consumer pass the subtree as a var if `_state`-of-`_var` doesn't resolve — verify at build (`pnpm ldf:b`).

4. **Display blocks** (`mode: display`), each gated on `show`, dimmed empty-state placeholders:
   - `assignees` → one avatar + name per entry of `action_data.assignee_docs`, composing `_ref: { module: user-account, component: user-avatar, vars: { user: ... } }` per item (`.claude/guides/lists.md`). Empty/`null` → dimmed `Not assigned`.
   - `due_date` → `_dayjs.format` with `date_format`. `null` → dimmed `No due date`.
   - `description` → `Html` reading `action_data.description.html`. `null` → dimmed `No description`. No truncation in v1.
5. **`show: []`** renders nothing (for `kind: form` gate the Card itself on `show` non-emptiness; templates additionally omit the whole sidebar column — task 11).

Replace the stub's header comment with a real doc-comment describing the var contract.

## Acceptance Criteria

- `apps/demo` builds. The check surface (which passes `kind: check`, `state_path: current_action.fields`, `mode`, `action_data`, and — after task 11 — `show` / `workflow_type` / `action_id` / `allowed_edit`) renders the three fields in both modes with the Update button in edit mode.
- `kind: form, mode: edit`: sidebar card with the three inputs + Update button; clicking Update with a changed assignee writes the doc, runs `on_complete` (refetch), and does not touch `form.*` state or the action's stage.
- `kind: check, mode: edit`: inputs + Update button render; `submit`/`progress` still write fields (surface, unchanged).
- `mode: display`: read-only values with placeholders for null/empty.
- `allowed_edit === false`: button hidden, inputs disabled.
- `show: [assignees]` renders only the assignee field; `show: []` renders nothing.

## Files

- `modules/workflows/components/universal-fields/universal-fields.yaml` — rewrite (replace stub) — the full component.

## Notes

- **No `action_type` var** — the endpoint is per-workflow (task 8); only `workflow_type` is needed, and it's built at runtime via `_string.concat: [{ _module.id }, '/', <workflow_type>, '-update-fields']`, mirroring the check surface's `-submit` construction (`check-action-surface.yaml:338-342`). Do **not** use `_module.endpointId` (it needs a build-time literal; the check surface can't supply one).
- **Update button renders for both kinds** (design "no check special-case") — the earlier draft's "check: no own button" is superseded.
- **No comment input in v1** on the form sidebar (design open question, settled): the payload's `comment` stays so a future input is a one-line add. The check surface already has its own comment input feeding `submit`.
- `due_date` block: `DateSelector` (match `components/fields/date_selector.yaml`).
- Keep all ids snake_case except the data-path-bound input ids (`{state_path}.*`), per CLAUDE.md.
- `_build.array.includes` exists for `show` gating (Lowdefy source `operators-js/src/operators/shared/array.js:60`, named args `on`/`value`; `_build.` evaluates shared operators at build time).
- The `_string.concat`-in-`id` pattern is verified in-tree (`controlled_list.yaml:28`).

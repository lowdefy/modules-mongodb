# Task 10: The `universal-fields` component

## Context

`modules/workflows/components/universal-fields/universal-fields.yaml` is currently a render-nothing stub (Part 20a) that the form templates (`templates/{edit,view,review,error}.yaml.njk`) and the shared simple pages (`pages/simple-{edit,view,review}.yaml`) already `_ref` with vars `mode` / `kind` / `action_data`. This task ships the real component. Existing call sites must keep building (they pass no `show` / `workflow_type` / `action_type` yet — task 11 upgrades the form templates; the simple pages intentionally stay on the default-all-three behaviour).

Everything it composes already exists:

- Endpoint `{workflow_type}-{action_type}-update-fields` (task 8) running the `UpdateActionFields` handler (task 5).
- `action_config.universal_fields` normalized to an array (task 7) — the form templates will pass it as `show`.
- `user-multi-selector` with an `id` var + `title` var, `user-avatar` (`vars: { user: <doc with operator leaves> }`), and the `assignee_docs` leaf on the `get_action` response (task 9; the aggregation returns an array — consumers bind `get_action.0.assignee_docs`, review-3 #5).
- `_state.action_allowed` — a per-verb map `{ view, edit, review, error }` written by `components/action_role_check.yaml` on form pages (Part 18); the edit affordances gate on `action_allowed.edit` (note: the design snippet sketches a bare boolean — the shipped shape is the map).

Behaviour matrix (design):

| `kind`   | `mode`    | Renders                                                | Write path                                           |
| -------- | --------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `form`   | `edit`    | Sidebar card: declared inputs + own **Update** button   | Button → `{workflow_type}-{action_type}-update-fields` |
| `form`   | `display` | Sidebar card, read-only                                 | —                                                    |
| `simple` | `edit`    | Primary content: declared inputs, **no** own button     | Page's `submit` button carries `fields` (unchanged)  |
| `simple` | `display` | Primary content, read-only                              | —                                                    |

## Task

Replace the stub with the real component. Vars (all build-time literals except `action_data` / `show` leaves, which may be operators):

- `mode` — `'edit' | 'display'` (required).
- `kind` — `'form' | 'simple'` (required; tracker excluded).
- `workflow_type`, `action_type` — required for `kind: form` + `mode: edit` only; together they build the endpoint id.
- `show` — array of field names to render; default `[assignees, due_date, description]` via `_var: { key: show, default: [...] }`. The v1 consumers pass build-time literals (or omit it), so per-field presence is gated at build time (`_build.*` operators — see `.claude/guides/operators.md`).
- `action_data` — map of operator leaves the display mode reads: `assignees`, `due_date`, `description`, and (display) `assignee_docs`.
- `date_format` — display date format, default `MMM D, YYYY`.

Structure:

1. **Chrome by kind** (build-time branch): `kind: form` wraps in a `Card` (the sidebar card — title e.g. `Details`); `kind: simple` renders a plain `Box` (the page provides chrome). Use the parent `layout.gap` for spacing per house rules.
2. **Edit inputs** (`mode: edit`), each gated on `show` membership, ids following the "input block IDs match data paths" rule:
   - `assignees` → `_ref: { module: user-account, component: user-multi-selector, vars: { id: fields.assignees, title: Assignees } }`.
   - `due_date` → a `DateSelector` block, `id: fields.due_date`, title `Due date`.
   - `description` → a `TiptapInput` block, `id: fields.description`, title `Description` (same direct-block precedent as the templates' `comment` input; TiptapInput stores `{ text, html }`).
   - For `kind: form`, disable the inputs when the user lacks edit access: `properties.disabled: { _eq: [{ _state: action_allowed.edit }, false] }` (defense in depth — the handler's verb gate is authoritative). Simple pages manage their own gating; don't wire `action_allowed` for `kind: simple`.
   - State priming is the **page's** job (templates' `onMount` already SetStates `fields.*` from the loaded action) — the component only binds.
3. **Update button** (`kind: form` + `mode: edit` only), snake_case id per house rules, in the card footer:

   ```yaml
   - id: button_update_fields
     type: Button
     properties: { title: Update, type: primary }
     visible:
       _eq:
         - _state: action_allowed.edit
         - true
     events:
       onClick:
         - id: validate_fields
           type: Validate
           params: { regex: ['^fields\.'] }
         - id: update_fields
           type: CallApi
           params:
             endpointId:
               _module.endpointId:
                 _build.string.concat:
                   [{ _var: workflow_type }, '-', { _var: action_type }, '-update-fields']
             payload:
               action_id: { _state: action._id }
               fields: { _state: fields }
               comment: { _state: fields_comment }   # no comment input in v1 — resolves undefined
         - id: refetch_action
           type: Request
           params: get_action
   ```

   (Validate scoping per `.claude/guides/../skills` form-validation idiom — only the `fields.*` inputs, never the form body. The refetch keeps the page's displayed action doc in sync after the write; `get_action` is registered on every consuming page.)

4. **Display blocks** (`mode: display`), each gated on `show`, with dimmed empty-state placeholders:
   - `assignees` → one avatar + name per entry of `action_data.assignee_docs`, composing `_ref: { module: user-account, component: user-avatar, vars: { user: ... } }` per item (operator leaves; see `.claude/guides/lists.md` for array rendering patterns). Empty/`null` → dimmed `Not assigned`.
   - `due_date` → formatted via `_dayjs.format` with the `date_format` var. `null` → dimmed `No due date`.
   - `description` → an `Html` block reading `action_data.description.html`. `null` → dimmed `No description`. No truncation in v1.
5. **`show: []`** renders nothing (an empty card must not appear — for `kind: form` gate the Card itself on `show` non-emptiness; templates additionally omit the whole sidebar column, task 11).

Update the stub's header comment into real doc-comment describing the var contract.

## Acceptance Criteria

- `apps/demo` builds with the existing (un-upgraded) call sites: simple pages render all three fields in both modes; form templates still build (they pass `mode`/`kind`/`action_data` only — `show` defaults, and the Update button branch requires `workflow_type`/`action_type` which they don't pass yet, so confirm the build doesn't dereference those vars outside the form+edit branch... the `_build` branching must keep unused vars unevaluated).
- `kind: form, mode: edit` (exercised via task 11 or a scratch page): sidebar card with the three inputs + Update button; clicking Update with a changed assignee writes the doc, refetches, and does not touch `form.*` state or the action's stage.
- `kind: simple, mode: edit`: inputs render, no button.
- `mode: display`: read-only values with placeholders for null/empty.
- `_state.action_allowed.edit === false`: button hidden, inputs disabled (form kind).
- `show: [assignees]` renders only the assignee field; `show: []` renders nothing.

## Files

- `modules/workflows/components/universal-fields/universal-fields.yaml` — rewrite (replace stub) — the full component.

## Notes

- **No comment input in v1** (design open question, settled default): the operation accepts `comment` for callers that want it; the sidebar surfaces no field. The payload line stays so a future input is a one-line addition.
- Block type for `due_date`: check the demo/templates for the date block actually used in this repo (`DateSelector` from the AntD blocks); match what `components/fields/date_selector.yaml` wraps.
- Keep all ids snake_case except the data-path-bound input ids (`fields.*`), per CLAUDE.md.
- `_build.array.includes` is verified to exist for the `show` gating: `includes` is a shared array operator (Lowdefy source `operators-js/src/operators/shared/array.js:60`, named args `on` / `value`), and the `_build.` prefix evaluates shared operators at build time. Use it; no fallback needed.

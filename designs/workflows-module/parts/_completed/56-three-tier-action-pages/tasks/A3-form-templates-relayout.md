# Task A3: Re-layout the form templates (view / edit / review / error)

## Context

Addendum DA1/DA2/DA3/DA4. Reshape the four form templates to the revised shell
(A1) and the universal-fields fragments (A2). The shipped templates
(`modules/workflows/templates/{view,edit,review,error}.yaml.njk`) currently:

- pass a `universal_fields` slot to the shell (`mode: display`, gated on
  `action_config.universal_fields`);
- pass `details_slot: entity_view_slot`;
- render the action bar as a **separate full-width page sibling** via
  `layout/floating-actions` (with `formFooter`-style buttons + the per-template verbs
  like Edit / Request Changes / Save / Submit);
- already wire the layout `page` header vars (`title`, `type`, `description:
_state.action.message`, `status`, `status_enum`, `breadcrumbs`).

Use `view.yaml.njk` as the reference for the shared structure (the others differ only
in their action buttons and guards).

## Task

For each of `view`, `edit`, `review`, `error`:

**1. Header chips + edit modal (DA1).**

- Pass a `page_actions` var to the layout `page` `_ref`, composed from
  `universal-fields-chips.yaml` (A2) with `action_data` sourced from
  `_state.action.*` (`assignees`, `assignee_docs`, `due_date`), `show:
action_config.universal_fields`, and a namespaced `modal_id`.
- Confirm `layout/page` forwards `page_actions` into its `title-block` `_ref` (the var
  map is explicit — the same gap Task 1 fixed for `description`); add the forward if
  missing.
- Mount `universal-fields-modal.yaml` (A2) as a page block, with `mode: edit`,
  `state_path: fields`, `workflow_type`, `action_id: _state.action._id`,
  `allowed_edit` per the template's existing edit-gate, and the same `modal_id`.

**2. Description callout (DA2).**

- Prepend `universal-fields-callout.yaml` (A2) to the shell's `middle` block array
  (above `form_card`), reading `action_data.description: _state.action.description`.
  It self-hides when the description is null.

**3. Action bar into the shell (DA3) — extras left, verbs right.**

- Stop rendering `floating-actions` as a page sibling. Pass the buttons into the
  shell's flat `actions` slot instead (the bar now lives in the middle column).
- **Recompose the flat array so extras sit on the left, signal verbs on the right:**
  `_build.array.concat: [ { _var: { key: page_config.buttons.extra, default: [] } },
<grow spacer>, …signal buttons… ]`, where `<grow spacer>` is a content-less `Box`
  with `layout: { flex: 1 1 0 }` (id e.g. `action_bar_spacer`). The spacer absorbs the
  free space, pushing extras to the far left and verbs to the far right — neutralising
  the bar's `justify: end`. This **reorders** Part 36's current composition (extras
  were appended after the signals); the change is template-side only.
- Do **not** add a slot to `floating-actions.yaml` or change it — keep one flat
  `actions:` array (Part 36 precedent). The signal-button definitions and their
  visibility/disabled/onClick logic are unchanged; only their array position + the
  spacer are new.

**4. RHS (DA4).**

- Stop passing `universal_fields` to the shell. Keep passing `details_slot:
entity_view_slot` (the shell now renders it as a stacked Details section, no template
  change beyond removing the `universal_fields` var).

Keep all existing requests, onMount sequencing, `_state.entity_id` normalization,
guards (edit's stale-URL guard, etc.), and the Request-Changes modal unchanged.

## Acceptance Criteria

- Each form page renders assignees + due chips and a `✎` in the title bar; `✎` opens
  the edit modal; Update still calls `{workflow_type}-update-fields`.
- The description callout renders above the form body when set, is absent when null.
- The action bar renders as a floating card **inside the middle column** with the
  workflow extras on the far left and the signal verbs on the far right (grow spacer
  between); no full-width action sibling remains; `floating-actions.yaml` is unchanged.
- The RHS shows entity Details (when `entity_view` declared) stacked above History; no
  `universal_fields` slot is passed.
- No `Tabs` and no RHS universal-fields card remain on form pages.
- `pnpm ldf:b` compiles; the demo `onboarding` form pages render the new layout.

## Files

- `modules/workflows/templates/view.yaml.njk` — modify.
- `modules/workflows/templates/edit.yaml.njk` — modify.
- `modules/workflows/templates/review.yaml.njk` — modify.
- `modules/workflows/templates/error.yaml.njk` — modify.
- `modules/layout/components/page.yaml` — modify only if `page_actions` is not already
  forwarded into `title-block`.

## Notes

- The header `description` var (the action `message`) is unchanged — it is **not** the
  universal-fields description (that is the callout). Keep both.
- Button visibility/disabled logic per template is unchanged; only its host moves
  (page sibling → shell `actions` slot).
- `block ids` must stay namespaced per page (the templates already do this).

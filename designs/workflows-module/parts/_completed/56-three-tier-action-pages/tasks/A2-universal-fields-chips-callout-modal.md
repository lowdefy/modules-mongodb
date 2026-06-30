# Task A2: Universal-fields chips, description callout, and edit modal

## Context

Addendum DA1/DA2. The universal fields (assignees / due_date / description) move out
of the RHS. Display splits by value shape; edit unifies in a modal. The
`{workflow_type}-update-fields` operation is **unchanged** — only its host and the
display composition change.

This task resolves the primary design's open question ("tiny display fragments vs
inline in templates") in favour of **small reusable composition fragments**, so all
five action templates (4 form + check) compose them uniformly rather than each
re-authoring the markup (one-correct-way; avoids 5-way drift).

As-built reuse:

- `modules/workflows/components/universal-fields/universal-fields.yaml` (Part 24)
  already has a `mode: edit` group (the assignees multi-selector, `DateSelector`,
  `TiptapInput`, and the standalone **Update** button calling
  `{workflow_type}-update-fields`) and a `mode: display` group. The **edit group is
  reused verbatim** as the modal body. The display group is no longer used on the
  workspace pages (its placement is superseded) but the component stays intact (it is
  still a shared component; the in-context `check-action-surface` modal is separate
  and untouched).

## Task

Create three small composition fragments under
`modules/workflows/components/universal-fields/`:

**1. Chips fragment (`universal-fields-chips.yaml`)** — for the title bar's
`page_actions`. Renders, from `action_data` (operator leaves: `assignees`,
`assignee_docs`, `due_date`):

- assignees as overlapping avatars (reuse `user-account` `user-avatar`, as the
  display group does), shown only when there are assignees;
- due date as a compact date pill (formatted with `_dayjs.format`, `MMM D, YYYY`),
  shown only when set;
- a trailing **edit (`✎`) icon button** that opens the edit modal (CallMethod `open`
  on the modal block id — id passed via a `modal_id` var so the caller namespaces it).
- Respect the same `show` array gate as the component (omit a chip when its field is
  not in `show`).

**2. Callout fragment (`universal-fields-callout.yaml`)** — for the middle-column top
(DA2). Renders the description as a tinted callout (a "Description" label + the
description `html`), **visible only when the description html is non-null**. Reads
`action_data.description` (the `{ text, html }` shape Part 24 stores). Read-only.

**3. Edit-modal wrapper (`universal-fields-modal.yaml`)** — a `Modal` whose body is
`universal-fields.yaml` with `mode: edit` (passed through `state_path`, `workflow_type`,
`action_id`, `allowed_edit`, `show`, `on_complete`). The modal block id comes from a
`modal_id` var so it matches the chips fragment's `open` target. The existing Update
button (inside the edit body) closes the modal via `on_complete` (append a CallMethod
`close`).

All three take operator-valued vars (so block ids compose via `_string.concat` where
needed, like the existing component).

## Acceptance Criteria

- `universal-fields-chips.yaml` renders avatars + due pill + `✎`; each element is
  gated (no assignees → no avatars; no due → no pill; field not in `show` → omitted);
  `✎` opens the modal whose id is `modal_id`.
- `universal-fields-callout.yaml` renders the description html in a labelled callout,
  and is absent when the description is null.
- `universal-fields-modal.yaml` opens with the universal fields in edit mode; Update
  calls `{workflow_type}-update-fields` (unchanged) and closes the modal on success.
- All three compile via `pnpm ldf:b` when `_ref`'d from a probe page.

## Files

- `modules/workflows/components/universal-fields/universal-fields-chips.yaml` — create.
- `modules/workflows/components/universal-fields/universal-fields-callout.yaml` — create.
- `modules/workflows/components/universal-fields/universal-fields-modal.yaml` — create.
- `modules/workflows/components/universal-fields/universal-fields.yaml` — modify (only
  if `on_complete` needs a documented hook for the modal-close append; otherwise leave
  the edit/display groups intact).

## Notes

- Do not change the `{workflow_type}-update-fields` endpoint or its payload (Part 24).
- The component's `mode: display` group is now unused on workspace pages — leave it;
  removing it is out of scope (and the component is shared).
- Avatar/date rendering should match the existing display group's idioms so the chips
  read consistently with the rest of the app.

# Task 5: Module — shrink the universal-fields components to `assignees` + `due_date`

## Context

With `description` removed from the universal-fields machinery (it becomes the authored config field rendered by `action-description.yaml`), the universal-fields components must drop the `description` input and display branch and default to the two surviving fields.

Three components under `modules/workflows/components/universal-fields/`:

- **`universal-fields.yaml`** — the shared surface with an **edit group** (assignees user-multi-selector, due_date DateSelector, **description TiptapInput**) and a **display group** (assignees avatars, due_date, **description Html**). Both groups gate each field behind `_build.array.includes` on the `show` var, whose default is `[assignees, due_date, description]`. The `description` TiptapInput (edit, lines ~113–136) writes `{state_path}.description`; the description display branch (lines ~277–319) renders `action_data.description.html`. The component's top-level `visible` also defaults `show` to all three (lines ~50–52).
- **`universal-fields-modal.yaml`** — the title-bar ✎ modal hosting the edit group; its `show` default is `[assignees, due_date, description]` (line ~50).
- **`universal-fields-chips.yaml`** — already renders only assignees + due (description was never a chip); two `show` defaults are `[assignees, due_date, description]` (lines ~34, ~68), and a comment (line ~91) references adding a description via the ✎ button.

## Task

**`universal-fields.yaml`:**

1. Remove the **description TiptapInput** block from the edit group (the `_build.if` whose `value: description` adds the `TiptapInput` titled "Description").
2. Remove the **description display branch** from the display group (the `_build.if` adding `universal_fields_description_label` / `universal_fields_description_value` / `universal_fields_description_empty`).
3. Change every `show` default from `[assignees, due_date, description]` to `[assignees, due_date]` — in the top-level `visible` (`_build.array.length` test) and in each remaining `_build.array.includes` default.
4. Update the header comment to describe two fields (drop the description-callout split prose, which referred to `universal-fields-callout.yaml`); drop `description` from the `action_data` var description.

**`universal-fields-modal.yaml`:**

5. Change the `show` default from `[assignees, due_date, description]` to `[assignees, due_date]`; update the comment ("default all three" → two).

**`universal-fields-chips.yaml`:**

6. Change both `show` defaults from `[assignees, due_date, description]` to `[assignees, due_date]`.
7. Update the ✎-button comment (line ~91) that references adding a description — reword so it no longer implies description is an editable universal field (the ✎ now edits assignees / due_date only).

## Acceptance Criteria

- `universal-fields.yaml` has no description `TiptapInput` (edit) and no description display branch; all `show` defaults are `[assignees, due_date]`.
- `universal-fields-modal.yaml` and `universal-fields-chips.yaml` default `show` to `[assignees, due_date]`.
- No `_var: ... .description` references remain in any of the three components.
- Comments no longer describe `description` as a universal field or reference `universal-fields-callout.yaml`.
- `cd apps/demo && pnpm ldf:b` compiles.

## Files

- `modules/workflows/components/universal-fields/universal-fields.yaml` — modify — remove description input + display branch; `show` defaults → two; comments.
- `modules/workflows/components/universal-fields/universal-fields-modal.yaml` — modify — `show` default → two; comment.
- `modules/workflows/components/universal-fields/universal-fields-chips.yaml` — modify — `show` defaults → two; ✎ comment.

## Notes

- This task is independent of Tasks 6/7 ordering: a `description` var still passed into `universal-fields.yaml` by a not-yet-updated consumer is simply ignored (no matching block), and a removed branch renders nothing. But the consumers (check-action-surface) are updated in Task 6 to stop passing it.

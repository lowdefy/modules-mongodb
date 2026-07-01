# Task 1: Resolver — wire the authored `description` config field + shrink universal fields to two

## Context

Part 64 reworks the action `description`. The old `description` was an end-user-editable universal field (`{ text, html }` on the action doc). It is being deleted; in its place a **workflow-author-authored** `description` — a markdown string in the action YAML, rendered read-only to whoever works the action — is being revived. That authored field already appears in the authoring-spec examples but no resolver ever read it, so it never reached the runtime config.

`modules/workflows/resolvers/makeWorkflowsConfig.js` builds the runtime workflows config consumed by the engine plugin. Its `ACTION_FIELDS` allowlist picks which raw-YAML action fields are carried onto each `actionConfig`. `description` is **not** in that list today, so `actionConfig.description` is undefined at runtime. GetWorkflowAction (Task 2) needs it there.

The same file defines `UNIVERSAL_FIELDS = ["assignees", "due_date", "description"]` (used only by `validateUniversalFields`, the `universal_fields` UI-presence validator). `modules/workflows/resolvers/makeActionPages.js` defines `UNIVERSAL_FIELDS_DEFAULT = ["assignees", "due_date", "description"]` (the default presence array baked onto emitted form pages). Both must shrink to the two surviving fields.

## Task

**`modules/workflows/resolvers/makeWorkflowsConfig.js`:**

1. Add `"description"` to the `ACTION_FIELDS` array (so `actionConfig.description` is carried into the runtime config — exactly as `required_after_close` already is). Add a short comment noting it is the authored body string read at runtime by GetWorkflowAction.
2. Change `UNIVERSAL_FIELDS` from `["assignees", "due_date", "description"]` to `["assignees", "due_date"]`. Update the comment above it (currently "the three universal action fields") to "the two universal action fields". This automatically fixes `validateUniversalFields`'s legal-set message (`assignees, due_date`) since it interpolates `UNIVERSAL_FIELDS.join(", ")`.
3. Add validation that the authored `description`, **when present**, is a string. Add a small validator (e.g. `validateActionDescription`) called from `validateAction`, in the same style as the existing `"title" in action && typeof action.title !== "string"` check:
   ```js
   if ("description" in action && typeof action.description !== "string") {
     fail(
       workflow.type,
       `${where} description must be a string when present (got: ${JSON.stringify(action.description)}).`,
     );
   }
   ```
   (`where` is already `action "${action.type}"` inside `validateAction`.) An omitted/absent `description` is legal (optional field).

**`modules/workflows/resolvers/makeActionPages.js`:**

4. Change `UNIVERSAL_FIELDS_DEFAULT` from `["assignees", "due_date", "description"]` to `["assignees", "due_date"]`. Update its comment (currently "the all-three default") to reflect two fields. Do **not** add `description` to `ACTION_FIELDS_FOR_TEMPLATE` — the design (Files-changed note) is explicit that the per-action template config does not need `description`: the check page reads it from the runtime envelope and form pages don't template it in.

## Acceptance Criteria

- `ACTION_FIELDS` in `makeWorkflowsConfig.js` includes `"description"`.
- `UNIVERSAL_FIELDS` in `makeWorkflowsConfig.js` is `["assignees", "due_date"]`.
- A workflow whose action declares `description: 123` (non-string) fails the build with a clear message; a `description:` markdown string passes; an action with no `description` passes.
- `validateUniversalFields` now rejects `universal_fields: [description]` (since `description` is no longer a member) and its error message lists only `assignees, due_date`.
- `UNIVERSAL_FIELDS_DEFAULT` in `makeActionPages.js` is `["assignees", "due_date"]`; `ACTION_FIELDS_FOR_TEMPLATE` is unchanged.
- `cd apps/demo && pnpm ldf:b` compiles (the demo workflow fixtures still build).

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `description` to `ACTION_FIELDS`; shrink `UNIVERSAL_FIELDS` to two; add string validation for authored `description`.
- `modules/workflows/resolvers/makeActionPages.js` — modify — shrink `UNIVERSAL_FIELDS_DEFAULT` to two.

## Notes

- `validateUniversalFields` keys its legal-value set off `UNIVERSAL_FIELDS`, so shrinking the constant is sufficient — do not hardcode a separate two-field list there.
- This task is the foundation for Task 2: GetWorkflowAction reads `actionConfig.description`, which only exists once `ACTION_FIELDS` carries it.

# Task 12: Concept-spec amendments

## Context

The workflows-module concept specs under `designs/workflows-module-concept/` are the durable authoring/engine contracts. Part 24 changes three things they document: the authoring vocabulary gains `universal_fields`, the `description` field's stored shape changes, and the `WorkflowAPI` connection gains a request type. The design carries these as explicit amendments under Part 24.

Current spec state (verified):

- `action-authoring/spec.md` — "Universal action fields" section (line ~169) documents the three fields and states "Updates flow through the per-action endpoint's `fields:` payload block… Atomic with the status transition (same Mongo `$set`)." — now true only for `kind: simple`. `universal_fields_required` appears nowhere (the review-proposed flag was never added — nothing to remove, just confirm).
- `engine/spec.md:132` — action-doc table lists `description` as `string | null`.
- `engine/spec.md` — "Connection structure" file tree (~line 14), "Capabilities" handler bullets (~line 194), and the universal-fields capability bullet (~line 197: "flow through `SubmitWorkflowAction` payload's `actions[].fields`. Merged… atomically with the status transition") all predate the operation split.

## Task

1. **`designs/workflows-module-concept/action-authoring/spec.md`**:
   - In the "Universal action fields" section, add the `universal_fields` authoring field to the reserved/declared-field documentation: optional list drawn from `[assignees, due_date, description]`; omitted = all three shown, optional; `false` / `[]` = surface hidden; purely a UI presence declaration (the doc always carries all three physically).
   - Rewrite the write-path narrative to the kind-split contract: **simple** — fields are the submission content, written via the submit endpoint's `fields:` payload, atomic with the transition; **form** — fields are written by the dedicated `{workflow_type}-{action_type}-update-fields` operation (no signal, no transition, `edit`-verb gated, editable in any stage including after close); **tracker** — fields carried on the doc, no UI surface in v1.
   - Confirm `universal_fields_required` is absent (do not add).
2. **`designs/workflows-module-concept/engine/spec.md`**:
   - Line ~132: `description` type → `{ text: string, html: string } | null` (mirrors the `comment` shape; the `text` shadow serves plain-text search/length checks).
   - Connection structure tree: add `UpdateActionFields/UpdateActionFields.js` alongside the other handler directories.
   - Capabilities: add an **`UpdateActionFields`** bullet documenting the operation — writes the three universal fields on one action; re-renders the status-map cell against the planned doc; emits an `action-fields-updated` event, with the optional `comment` routed through the planner's `comment` param — rendering owned by Part 33 (`display.{app_name}.description`), **not** event metadata; writes no workflow doc (no CAS — per-action concurrency is last-write-wins); access gate = `access.{app}.edit`; no stage/lifecycle restriction (`required_after_close` does not apply); returns `{ action_id, event_id }`.
   - Amend the universal-fields capability bullet (~197) to the kind-based contract: the `SubmitWorkflowAction` fields merge applies to `kind: simple` only; `kind: form` universal fields are owned exclusively by `UpdateActionFields`.
3. Sweep both specs for other now-stale universal-fields statements (e.g. anything implying form-kind metadata edits require a submit) and align them; keep edits surgical.

## Acceptance Criteria

- Both specs read consistently with the shipped behaviour of tasks 5–8 (endpoint id, verb gate, lifecycle freedom, event type, `description` shape).
- `universal_fields` is documented exactly once as an authoring field, with the default/false/subset forms.
- No reference to `universal_fields_required` exists anywhere in the concept docs.

## Files

- `designs/workflows-module-concept/action-authoring/spec.md` — modify — `universal_fields` + kind-split write-path narrative.
- `designs/workflows-module-concept/engine/spec.md` — modify — `description` shape, handler tree, capabilities bullets.

## Notes

- Use the final shipped endpoint id `{workflow_type}-{action_type}-update-fields` (the workflow-type prefix is a deviation from the design's first draft, already folded into Part 24's design.md).
- These are concept docs, not module READMEs — consumer-facing module docs are out of scope here (no `modules/workflows/README.md` vars changed in this part; `universal_fields` is workflow-YAML authoring surface, not a module var).

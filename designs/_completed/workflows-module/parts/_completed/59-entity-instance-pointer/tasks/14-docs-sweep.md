# Task 14: Docs — nest the entity shape and dot the documented index

## Context

`docs/workflows/` is the source of truth for consumer-observable behaviour and documents the engine's persisted shapes, the entity query, and the `workflows` index. Part 59 nests the entity pointer, so the docs that show the flat `{ entity_collection, entity_id }` document shape or query must move to `entity: { connection_id, id }` (with `ref_key` on the workflow doc). The `entity_id` link sentinel keyword stays flat per "Where uniform stops" — call this out where the docs show it.

## Task

### `docs/workflows/reference/indexes.md`

- The `workflows` index heading and body: `{ entity_collection: 1, entity_id: 1 }` → `{ "entity.connection_id": 1, "entity.id": 1 }` (~lines 29, 35). Note dotted sub-fields index identically — the equality-prefix match is unchanged.
- Update the query-site table row that shows `$match: { entity_collection, entity_id }` to the dotted `{ "entity.connection_id", "entity.id" }` match.

### `docs/workflows/how-to/write-a-hook.md`

The three `_payload: context.workflow.entity_id` reads → `context.workflow.entity.id`.

### `docs/workflows/how-to/track-a-child-workflow.md`

- Start-caller payload showing flat `entity_id` / `entity_collection` → `entity: { id }` (connection id is config-sourced, dropped from the payload).
- `child_entity_id` / `child_entity_collection` field references → `child_entity: { connection_id, id }`.
- Update prerequisite prose to the nested shape.
- **Keep** the `entity_id: true` link sentinel flat (and note why, matching the design's "Where uniform stops").

### Concept / reference sweep

Grep the remaining workflows docs and update any that show the document shape or the entity query:

```bash
grep -rn "entity_collection\|entity_id\|entity_ref_key\|parent_entity\|child_entity" docs/workflows
```

Likely touch points: `concepts/mental-model.md`, `concepts/events.md`, `concepts/action-kinds.md`, `reference/exports.md`, `reference/authoring-grammar.md`, `index.md`. For each, distinguish:

- **document shape / query** → nest to `entity: { connection_id, id }` (+ `ref_key` on workflow).
- **`entity_id: true` link sentinel** and **`?entity_id=…` URL param** → stay flat.

Do **not** hand-edit `reference/vars.md` (generated from `module.lowdefy.yaml` by Part 57 / `pnpm docs:gen`).

## Acceptance Criteria

- `indexes.md` shows the dotted `{ "entity.connection_id": 1, "entity.id": 1 }` index and the dotted query.
- `write-a-hook.md` and `track-a-child-workflow.md` show the nested document/payload shapes; the `entity_id` sentinel stays flat with a note.
- No flat `entity_collection` / `entity_id` document-shape or query references remain in `docs/workflows` **except** the documented `entity_id` link sentinel and `?entity_id=…` URL param.
- `pnpm docs:gen` runs clean and `pnpm docs:check` passes (front-matter valid, `llms.txt` / `vars.md` not drifted).

## Files

- `docs/workflows/reference/indexes.md` — modify — dotted index + query-site table.
- `docs/workflows/how-to/write-a-hook.md` — modify — `context.workflow.entity.id`.
- `docs/workflows/how-to/track-a-child-workflow.md` — modify — start payload, `child_entity` nested, prose (sentinel stays flat).
- `docs/workflows/concepts/*.md`, `docs/workflows/reference/*.md`, `docs/workflows/index.md` — modify — nest document-shape / query references the grep surfaces.

## Notes

Depends on the finalized shape from Tasks 3/4/5. Per CLAUDE.md, `docs/` is the source of truth for behaviour — keep the wording behaviour-accurate (nested shape end to end), and preserve the two deliberately-flat authoring tokens. `/r:design-docs` is the dedicated follow-up if a broader docs pass is wanted; this task covers the runtime/document-shape sweep the design's "Files changed" lists.

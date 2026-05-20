# Task 1: Strip `entity_type` from concept docs

## Context

`designs/workflows-module-concept/` is the source of truth for the workflows-module's grammar, doc shape, payload contracts, and worked examples. Today it documents a two-scalar entity identity (`entity_type` + `entity_collection`). Part 21 collapses that to one (`entity_collection`). Until the concept docs reflect the new shape, future readers will re-introduce `entity_type` in code or in derived per-part designs.

The non-review files that mention `entity_type` today (per `grep -rln "entity_type" designs/workflows-module-concept/`, excluding `review*` files):

- `spec.md`
- `design.md`
- `engine/spec.md`
- `engine/design.md`
- `action-authoring/spec.md`
- `action-authoring/design.md`
- `action-groups/spec.md`
- `action-groups/design.md`
- `ui/spec.md`
- `ui/design.md`
- `module-surface/spec.md`
- `module-surface/design.md`

Files under `review/` and `*/review/` subdirectories are frozen artifacts of past decisions — **do not edit them**.

## Task

For each non-review file in the list above:

1. Drop `entity_type` from any payload contract (e.g. `start-workflow` required-fields list, `get-entity-workflows` payload shape).
2. Drop `entity_type` from any document-shape table or JSDoc-style field list (workflow doc, action doc).
3. Update worked examples and YAML snippets — remove `entity_type: <value>` lines; ensure `entity_collection: <connection-id>` is present where the example needs to identify an entity.
4. The parent/child link shape has no `parent_entity_type` or `child_entity_type` fields today — nothing to drop on those names. Keep `parent_entity_id`, `parent_entity_collection`, `child_entity_id`, `child_entity_collection` as-is.

Two specific call-outs that are easy to miss inside the broader sweep:

- **Reserved-keys list** in `engine/spec.md` and `engine/design.md` (the set of field names `references.{key}` payloads cannot override) — strike `entity_type`. Removing the field means it's no longer engine-managed and apps must be free to use it as a `references` key.
- **Index recommendations** in `engine/spec.md` — today reads `(entity_type, entity_id)` for `workflows` and `actions`; rewrite to `(entity_collection, entity_id)`. A stale index recommendation creates a non-functional index (it'd index a non-existent field), which is a worse failure mode than a stale worked-example.

Lookup queries described in prose (e.g. "`get-entity-workflows` looks up by `entity_type` + `entity_id`") become "looks up by `entity_collection` + `entity_id`."

## Acceptance Criteria

- `grep -rln "entity_type" designs/workflows-module-concept/` returns only review-file paths (under `review/` and `*/review/` subdirs).
- Reserved-keys list in `engine/spec.md` and `engine/design.md` no longer mentions `entity_type`.
- Index recommendation in `engine/spec.md` reads `(entity_collection, entity_id)` for both `workflows` and `actions`.
- Worked examples in `spec.md`, `design.md`, `action-authoring/spec.md`, `action-authoring/design.md` show `entity_collection: <connection-id>` (e.g. `leads-collection`, `tickets-collection`) and no `entity_type: <value>` lines.
- No edits to any file matching `*/review/*` or `review-*.md`.

## Files

- `designs/workflows-module-concept/spec.md` — modify — strip `entity_type` from payload + doc-shape mentions and the worked example.
- `designs/workflows-module-concept/design.md` — modify — same; includes the longer worked example.
- `designs/workflows-module-concept/engine/spec.md` — modify — schema table, payload contracts, reserved-keys list, index recommendations, worked example.
- `designs/workflows-module-concept/engine/design.md` — modify — schema discussion (Decision 1 "Entity-agnostic field shape"), `createAction.js` pseudo-code, reserved-keys list, Decision 3 "Parent ↔ child link shape", worked example.
- `designs/workflows-module-concept/action-authoring/spec.md` — modify — workflow YAML grammar, validation list, worked example.
- `designs/workflows-module-concept/action-authoring/design.md` — modify — workflow YAML example, "How parent and child get linked at runtime" prose, schema reference.
- `designs/workflows-module-concept/action-groups/spec.md` — modify — workflow doc-shape mention, worked example.
- `designs/workflows-module-concept/action-groups/design.md` — modify — any doc-shape or worked-example mentions.
- `designs/workflows-module-concept/ui/spec.md` — modify — template vars pass-through (`entity_type` flow into templates), `get_workflow_entity` description, `get-entity-workflows` call shape.
- `designs/workflows-module-concept/ui/design.md` — modify — "shape choices" entry on template vars, `get_workflow_entity` source list, `get-entity-workflows` call shape.
- `designs/workflows-module-concept/module-surface/spec.md` — modify — `start-workflow` payload contract.
- `designs/workflows-module-concept/module-surface/design.md` — modify — `start-workflow` payload schema (Decision 3).

## Notes

The concept-folder `review/` and `*/review/` directories are full of resolved findings about the original `entity_type`-based shape. Editing review files retroactively rewrites the history of how the design got here. Don't.

A reader sweeping for `entity_type` mentions should also check for prose patterns like "the `(entity_type, entity_id)` index" and "looks up by `entity_type`" — those are easy to miss when scanning for the literal token alone.

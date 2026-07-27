# Task 7: Manifest description + regenerated `vars.md` + hand-authored docs

## Context

`docs/` is the source of truth for consumer-observable authoring behavior, and the manifest is the
source of truth for the var schema. Part 26 removes `entity.name_field` and adds `entity.data`, so
the manifest description, the generated `vars.md`, and the two hand-authored pages that describe
`name_field` must be updated.

Generated-file rule: `docs/workflows/reference/vars.md` is generated from
`modules/workflows/module.lowdefy.yaml` by `scripts/gen-var-docs.mjs` — edit the manifest, then run
`pnpm docs:gen`. Do **not** hand-edit `vars.md`. `pnpm docs:check` runs in CI and fails on drift.

The current manifest `workflows_config` description has a `name_field` bullet
(`module.lowdefy.yaml:72`). The hand-authored pages are:

- `docs/workflows/reference/authoring-grammar.md:32` — the `entity:` block lists
  `name_field: <dot-path> # optional — entity-doc path to the instance name; adds "· {name}" ...`.
- `docs/workflows/concepts/action-pages.md:55` — `name_field: company_name # breadcrumb shows ...`
  in the `entity_view` example, and `:78` — the Breadcrumbs paragraph describing `entity.name_field`.

## Task

1. **`modules/workflows/module.lowdefy.yaml`** — in the `workflows_config` var description's
   `entity:` block bullets:
   - **Remove** the `name_field` bullet.
   - **Add** an `entity.data` bullet: optional; an inline `{ routine: [...] }` (same envelope as
     hooks); the routine receives `{ entity_id }` and returns an object whose reserved `name` key is
     the instance display name; all other keys are host-owned and available on the action response's
     `entity` object and via the `entity_view` slot; the module generates the engine-only endpoint
     from it.

2. **Regenerate** `docs/workflows/reference/vars.md`: run `pnpm docs:gen` from the repo root.
   Commit the regenerated file. Verify with `pnpm docs:check`.

3. **`docs/workflows/reference/authoring-grammar.md`** (`:32`) — in the `entity:` block:
   - **Drop** the `name_field` line.
   - **Add** an `entity.data` line: optional inline `{ routine: [...] }` like hooks; the routine
     receives `{ entity_id }` and returns an object whose reserved `name` key is the breadcrumb
     instance name.

4. **`docs/workflows/concepts/action-pages.md`**:
   - **Drop** `name_field` from the `entity_view` example (`:55`); note that slot blocks read
     `get_workflow_action.entity.<field>` (an **object** — no `.0`) rather than a baked entity
     request.
   - **Rewrite** the Breadcrumbs paragraph (`:78`) so the instance name comes from the `entity.data`
     routine's reserved `name` key (surfaced as `entity_link.name`) instead of `entity.name_field`.

## Acceptance Criteria

- The manifest `workflows_config` description has no `name_field` bullet and a new `entity.data`
  bullet.
- `docs/workflows/reference/vars.md` is regenerated from the manifest (not hand-edited) and
  `pnpm docs:check` passes (no drift).
- `authoring-grammar.md` and `action-pages.md` no longer mention `name_field`; they describe
  `entity.data` and the `entity_link.name` / `get_workflow_action.entity.<field>` sources.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify — swap the `name_field` bullet for an
  `entity.data` bullet in the `workflows_config` description.
- `docs/workflows/reference/vars.md` — regenerate via `pnpm docs:gen` (do not hand-edit).
- `docs/workflows/reference/authoring-grammar.md` — modify — drop `name_field`, add `entity.data`.
- `docs/workflows/concepts/action-pages.md` — modify — drop `name_field` from the example, update
  the slot-read note and the Breadcrumbs paragraph.

## Notes

- Keep the manifest description phrasing parallel to the existing hook/`on_complete` bullets so the
  "same envelope as hooks" framing is consistent.
- `pnpm docs:check` also lints front-matter — leave the front-matter blocks intact.

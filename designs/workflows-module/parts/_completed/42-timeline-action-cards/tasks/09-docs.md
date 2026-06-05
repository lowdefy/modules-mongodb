# Task 9: Document the always-on lookup convention and the exported fragment

## Context

Part 42 makes two things true that consumers need documented:

1. **The events-module timeline now structurally embeds the
   `actions`-collection + app-keyed-status-map convention** — it runs the action
   `$lookup` on every fetch (D2). This is a monorepo-wide convention (how
   `get-entity-workflows` and the v0 timeline both read live action display), not
   a third-party concern, but it must be documented as a shared convention so an
   app author understands why the events timeline references the `actions`
   collection and the per-app status map.

2. **The workflows module re-exports the lookup/de-dup fragment** as a
   `timeline-action-lookup` component (Task 5), so app developers building custom
   history pipelines (category-chip filtering, pagination — the full v0
   `get_ticket_history` shape, which stay app-authored) can `_ref` it instead of
   re-pasting the de-dup pipeline.

By now the implementation has landed: the shared fragment (Task 5), the events
wiring (Task 7), and the shared enum move (Task 1).

This repo's documentation layout is fixed (see `CLAUDE.md` → Documentation):
per-module READMEs link to anchors in `docs/idioms.md` rather than repeating
explanations. Relevant existing anchors include `#event-display` and `#slots`.

## Task

1. **`docs/idioms.md`** — document the live-action-card lookup as a shared
   convention (a new subsection, e.g. under or alongside `#event-display`):
   - The events timeline runs `timeline_action_lookup.yaml` unconditionally; it
     `$lookup`s the `actions` collection and reads the per-app status-map cell
     (`action.<app_name>.message`, `action.<app_name>.links`).
   - It is safe with no `actions` collection / no workflows (empty arrays, no
     cards).
   - The single rendered link is resolved server-side, access-aware
     (`resolve_action_link.yaml`, priority `edit > review > error > view` over
     non-`null` ∩ visible cells) — identical across the timeline card, the entity
     widget, the workflow overview, and the group overview.
   - Status display comes from the shared base enum
     `modules/shared/enums/action_statuses.yaml` ⊕ each module's
     `action_statuses_display` override; an app keeps the events and workflows
     overrides in sync by pointing both module entries at one app-local file.

2. **`modules/events/README.md`** — in the per-module reference (Notes and/or the
   `events-timeline` component / Vars sections):
   - Note the always-on action lookup and link it to the idioms anchor.
   - Document the new `action_statuses_display` var (object, default `{}`) — match
     the manifest description added in Task 7; manifest is the source of truth.

3. **Document the exported fragment** (in `modules/workflows/README.md` Exports /
   Components, and/or idioms) — `timeline-action-lookup`:
   - How to `_ref` it: `_ref: { module: workflows, component: timeline-action-lookup, vars: { app_name: <app> } }`.
   - **It is a multi-stage fragment — splice it with `_build.array.concat`**, not a
     bare `- _ref:` (which would nest). Show the custom-pipeline shape:

     ```yaml
     pipeline:
       _build.array.concat:
         - - $match: { ... }        # entity + category-chip filtering, app-authored
         - _ref:
             module: workflows
             component: timeline-action-lookup
             vars: { app_name: my-app }
         - - $facet: { ... }        # pagination, app-authored
     ```
   - Note category-chip filtering and pagination stay app-authored (non-goals).

## Acceptance Criteria

- `docs/idioms.md` describes the always-on lookup convention, the server-side
  access-aware link resolution, and the shared-enum-⊕-override status display,
  with a stable anchor the module READMEs can link to.
- `modules/events/README.md` documents the always-on lookup and the
  `action_statuses_display` var (consistent with the manifest).
- `modules/workflows/README.md` documents the `timeline-action-lookup` export with
  the `_build.array.concat` splice pattern and the app-authored non-goals.
- No documentation references the removed `modules/workflows/enums/action_statuses.yaml`
  path; all point at `modules/shared/enums/action_statuses.yaml`.

## Files

- `docs/idioms.md` — modify — add the shared lookup-convention subsection + anchor.
- `modules/events/README.md` — modify — always-on lookup note + `action_statuses_display` var.
- `modules/workflows/README.md` — modify — `timeline-action-lookup` export + splice pattern.

## Notes

- Manifest is the source of truth for var schema — the README restates the
  `action_statuses_display` description in narrative form but must not diverge from
  the manifest text added in Task 7.
- Emphasise the `_build.array.concat` splice — it's the single most common way a
  consumer would get the fragment wrong (a bare `- _ref:` nests instead of
  flattening).

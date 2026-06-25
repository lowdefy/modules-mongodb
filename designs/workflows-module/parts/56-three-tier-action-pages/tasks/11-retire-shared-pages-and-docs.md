# Task 11: Retire the shared check pages; update manifest, README, docs, and stale comments

## Context

With the per-workflow `{workflow_type}-check` page emitted (Task 10) and all
engine links retargeted (Task 2), the three shared check pages are dead:

- `modules/workflows/pages/workflow-action-view.yaml`
- `modules/workflows/pages/workflow-action-edit.yaml`
- `modules/workflows/pages/workflow-action-review.yaml`

They are listed in the module manifest's `pages:` block (`module.lowdefy.yaml`
~`:195–197`) and referenced by README/docs and several "canonical page" /
duplicate-`get_workflow_action` constraint comments that are now stale. The new
`{workflow_type}-check` page is itself a URL-bound `get_workflow_action` page, so
the "never drop the modal on a page that already defines `get_workflow_action`"
constraint moves to it.

## Task

1. **Delete the three retired page files** and remove their `_ref` entries from
   `modules/workflows/module.lowdefy.yaml` `pages:` (~`:195–197`). Leave
   `workflow-overview` and `workflow-group-overview` in place.

2. **module.lowdefy.yaml** — also:
   - Document `entity_view` in the `workflows_config` var description (build-time,
     read-only UI; `{ slot }` block ref; not in the materialized engine config).
   - Document the optional `entity.name_field` on the workflow-config `entity:`
     block (D10, dot-path → breadcrumb instance name).
   - Re-point the export-description constraint that names the retired
     `workflow-action-*` pages (the `check-action-modal` export note ~`:137–141`
     "never drop it on a page that already defines a `get_workflow_action`
     request (the workflow-action-* pages)") to the new `{workflow_type}-check`
     page.

3. **Re-point stale "canonical page" / duplicate-request comments** to the new
   page:
   - `modules/workflows/components/check-action-modal.yaml` (~`:6–7,22–25`) — the
     "canonical workflow-action-* pages" and the "NEVER drop this on a page that
     defines get_workflow_action — the workflow-action-* pages" notes.
   - `modules/workflows/components/check-action-surface.yaml` (~`:4`) — the "three
     shared pages … all `_ref` this file" note (now: the modal body composes the
     leaves; the workspace check page recomposes them — Tasks 5/8).

4. **README + docs** — `modules/workflows/README.md` and the workflows docs
   (`docs/workflows/...`, e.g. `docs/idioms.md` / the relevant concept/reference
   pages):
   - Document `entity_view` and the three-tier workspace layout.
   - Re-point the README Exports table rows for the three retired pages and the
     "check actions use the shared `workflow-action-*` pages" line
     (README ~`:300–302,308,317`).
   - Per repo docs rules, `docs/` is the source of truth for consumer-observable
     behaviour — update it to describe the workspace and the new check page.

5. Regenerate generated docs if any var descriptions changed:
   `pnpm docs:gen` (then `pnpm docs:check` to confirm no drift).

## Acceptance Criteria

- The three `workflow-action-*` page files are deleted and absent from the
  manifest `pages:`.
- No source comment or doc still names `workflow-action-{view,edit,review}` as a
  canonical/live page; the duplicate-`get_workflow_action` constraint references
  `{workflow_type}-check`.
- `entity_view` and `entity.name_field` are documented in the manifest and docs.
- `pnpm ldf:b` compiles cleanly with the pages removed.
- `pnpm docs:check` passes (no generated-doc drift; front-matter valid).

## Files

- `modules/workflows/pages/workflow-action-view.yaml` — delete.
- `modules/workflows/pages/workflow-action-edit.yaml` — delete.
- `modules/workflows/pages/workflow-action-review.yaml` — delete.
- `modules/workflows/module.lowdefy.yaml` — modify — drop retired pages; document `entity_view` + `entity.name_field`; re-point export-description constraint.
- `modules/workflows/components/check-action-modal.yaml` — modify — re-point canonical/duplicate-request comments.
- `modules/workflows/components/check-action-surface.yaml` — modify — re-point the "three shared pages" header note.
- `modules/workflows/README.md` — modify — re-point Exports rows + the check-pages line; document the workspace.
- `docs/workflows/**` (+ `docs/idioms.md` if applicable) — modify — document `entity_view` + the three-tier workspace.
- `docs/workflows/reference/vars.md`, `docs/llms.txt` — regenerate via `pnpm docs:gen`.

## Notes

- Sequence after Task 10 so the replacement page exists before the shared pages
  are removed. (Removing the page files does not break the build of other pages —
  the e2e specs reference the ids as runtime URL strings, retargeted in Task 12.)
- Do not move the design folder into `_completed/` — that is an explicit
  user-only action.
- A separate `/r:design-docs` run can generate a fuller docs task; this task
  covers the doc edits the design's "Files changed" explicitly calls out.

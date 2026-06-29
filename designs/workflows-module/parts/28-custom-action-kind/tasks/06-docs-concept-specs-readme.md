# Task 6: Document the custom kind (concept specs + consumer docs)

## Context

The custom kind needs documenting in the workflows concept specs (the
design-tree source of truth for rationale) and in the consumer docs. The
distinguishing facts:

- `custom` is a `check`-clone whose **working surface is app-owned**: the author
  writes a `status_map.{stage}.{slug}.link` cell (and optional `view_link:`)
  pointing at app pages; the engine routes those into the per-verb `links` map
  (working link → the stage's active working verb slot; `view_link` or the shared
  `workflow-action-view` page → the `view` slot).
- It rides the same per-workflow `{type}-submit` / `{type}-update-fields`
  endpoints and the same nullary signals as check; the FSM resolves via the
  `custom: form` alias.
- It emits **no** per-action module pages; navigation is via the author `link:`
  cells, with the shared `workflow-action-view` page as the observer fallback.
- The `link.pageId` is a free-form app page id — **not** build-validated against
  the host app's page tree (a typo surfaces as a click-time 404, like any
  free-form Lowdefy page reference).

## Task

Update the concept specs (in `designs/workflows-module-concept/`):

1. **`action-authoring/spec.md`** — add `custom` to the kind list/table and the
   `kind`-mutual-exclusion line (`kind: custom` rejects both `form:` and
   `tracker:`, like check); add a short "Custom action" subsection covering check
   semantics + author-owned links; note `custom: form` FSM aliasing. Also fold
   `custom` into the "unknown action kind" / kind-driver notes where check is
   listed (page generation: none; submit API: same `{type}-submit` as check).

2. **`submit-pipeline/spec.md`** — note that `custom` rides the per-workflow
   `{type}-submit` endpoint with the same nullary signals as check, and that its
   `link` cells are author-authored.

3. **`ui/spec.md`** — add `custom` to the page-generation note: "none — app
   supplies pages; navigation via author `link:` cells (observer falls back to the
   shared `workflow-action-view` page)".

Document for consumers:

4. **Custom-actions consumer doc.** The design's Files table names
   `modules/workflows/README.md`, but per CLAUDE.md the source-side README is a
   stub that points into `docs/` and must not carry content. Put the consumer
   "Custom actions" content in **`docs/workflows/`** instead — a new how-to/concept
   page (e.g. `docs/workflows/how-to/custom-actions.md`) following the docs
   front-matter schema — covering: the app-side page + submit-call shape (the app
   page reads `?action_id=<id>`, does its domain write, then calls
   `_module.endpointId: { id: {type}-submit, module: workflows }` with
   `action_id` + a nullary `signal` + optional `fields`/`comment`), the
   `status_map.{stage}.{slug}.link` / `view_link` convention, the `action_id` /
   `entity_id` sentinels, and the atomicity note (move the domain write into a
   `hooks.submit.pre` routine if it must be atomic-ish with the status commit).
   Leave the README stub as-is. Run `pnpm docs:gen` if the new page affects
   `llms.txt` / front-matter linting, and ensure `pnpm docs:check` passes.

## Acceptance Criteria

- `action-authoring/spec.md`, `submit-pipeline/spec.md`, `ui/spec.md` each mention
  `custom` per the above.
- A consumer "Custom actions" doc exists under `docs/workflows/` with valid
  front-matter and the app-side page + submit-call shape and the cell convention.
- `pnpm docs:check` passes (front-matter valid, `llms.txt` not stale).
- The `modules/workflows/README.md` stub is unchanged.

## Files

- `designs/workflows-module-concept/action-authoring/spec.md` — modify — add `custom` to kinds + a Custom-action subsection + FSM aliasing note.
- `designs/workflows-module-concept/submit-pipeline/spec.md` — modify — note custom on the per-workflow submit endpoint.
- `designs/workflows-module-concept/ui/spec.md` — modify — add custom to page-generation note.
- `docs/workflows/how-to/custom-actions.md` — create — consumer how-to for custom actions (or place under `concepts/` if that fits the docs tree better).

## Notes

The design.md Files table lists `modules/workflows/README.md`; this task
intentionally redirects that content to `docs/workflows/` to satisfy the CLAUDE.md
"READMEs are stubs" rule. Flag this deviation to the design if the team prefers the
README; otherwise the docs/ placement is the correct home.

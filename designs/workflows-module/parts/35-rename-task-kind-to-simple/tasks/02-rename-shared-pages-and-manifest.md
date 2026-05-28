# Task 2: Rename Shared Page Files, Update Manifest, README, and Universal-Fields Header

## Context

The workflows module ships three shared pages that render the no-input workflow action: `task-edit.yaml`, `task-view.yaml`, `task-review.yaml` under `modules/workflows/pages/`. They are being renamed to `simple-edit.yaml`, `simple-view.yaml`, `simple-review.yaml` as part of the `kind: task` → `kind: simple` vocabulary swap.

Each of these files contains an inner page `id:` (set inside the page's `_ref: layout/page` vars block) that mirrors the filename — that must flip too. Each also has a header comment describing the file (e.g. "Shared task-action edit page") that mentions `task` — flip to `simple`.

The module manifest at `modules/workflows/module.lowdefy.yaml` references the three page files via `_ref:` entries inside a `pages: _build.array.concat:` block (around lines 128–134, three contiguous entries). Those `_ref:` paths must flip to the new filenames.

The `universal-fields.yaml` component has a header comment naming the three page files — flip those mentions. The module README has a shared-pages table (3 rows) plus prose mentioning `task` in the `kind: form` emission note and the `update-action-{action_type}` endpoint description — flip those too.

After this task, the build's manifest knows about pages with IDs `simple-edit`, `simple-view`, `simple-review`. The demo's `workflow_config` references (Task 3) can then resolve them.

## Task

### Page files

For each of the three page files:

1. **`modules/workflows/pages/task-edit.yaml`** → rename to `modules/workflows/pages/simple-edit.yaml`.
   - Inside the file, find the inner `id: task-edit` (set in the `vars:` block of the `_ref: layout/page` reference) and flip to `id: simple-edit`.
   - Update the header comment: e.g. "Shared task-action edit page" → "Shared simple-action edit page". Match whatever the current comment text is — flip just the `task` substring.

2. **`modules/workflows/pages/task-view.yaml`** → rename to `modules/workflows/pages/simple-view.yaml`.
   - Inner `id: task-view` → `id: simple-view`.
   - Update header comment as above.

3. **`modules/workflows/pages/task-review.yaml`** → rename to `modules/workflows/pages/simple-review.yaml`.
   - Inner `id: task-review` → `id: simple-review`.
   - Update header comment as above.

Use `git mv` for the rename so git tracks it as a rename rather than delete + add.

### Manifest

4. **`modules/workflows/module.lowdefy.yaml`** — Update the three contiguous `pages: _ref:` entries (around lines 128–134, inside the `pages: _build.array.concat:` block) to reference the renamed files:
   - `_ref: pages/task-edit.yaml` → `_ref: pages/simple-edit.yaml`
   - `_ref: pages/task-view.yaml` → `_ref: pages/simple-view.yaml`
   - `_ref: pages/task-review.yaml` → `_ref: pages/simple-review.yaml`

   Read the file first to confirm the exact line numbers and surrounding structure.

### Universal-fields header

5. **`modules/workflows/components/universal-fields/universal-fields.yaml`** — The header comment names the three shared pages (e.g., "Used by task-edit / task-view / task-review"). Flip to `simple-edit / simple-view / simple-review`.

### README

6. **`modules/workflows/README.md`** — Three regions reference `task`:
   - The shared-pages table (3 rows). Flip page name, page ID, and any prose in the description column that mentions `task`.
   - The `kind: form` page-emission note (prose explaining that `form` kinds emit the form page while `task` actions use the shared `task-*` pages) — flip `task` references to `simple`.
   - The `update-action-{action_type}` endpoint description — flip `task` references to `simple`.

   Read the README first to locate the exact sections; the design notes there are 3 rows in the shared-pages table plus 2 other mentions, ~5 sites total.

## Acceptance Criteria

- The three page files exist at their new paths (`modules/workflows/pages/simple-edit.yaml`, `simple-view.yaml`, `simple-review.yaml`) and no longer exist at their old paths.
- Inside each renamed page file, the inner `id:` and the header comment match the new name.
- `module.lowdefy.yaml` references the three renamed files; no `_ref: pages/task-*.yaml` remains.
- `universal-fields.yaml` header comment names the new file names.
- The README's shared-pages table and surrounding prose name the new IDs.
- A search for `task-edit`, `task-view`, `task-review` returns no hits in `modules/workflows/` (excluding any `.lowdefy/` build-cache output, which regenerates on build).
- The build does not need to be run for this task — Task 3 verifies the build end-to-end after the demo `workflow_config` is also flipped.

## Files

- `modules/workflows/pages/task-edit.yaml` → `modules/workflows/pages/simple-edit.yaml` — rename via `git mv` — flip inner `id:` and header comment.
- `modules/workflows/pages/task-view.yaml` → `modules/workflows/pages/simple-view.yaml` — rename via `git mv` — flip inner `id:` and header comment.
- `modules/workflows/pages/task-review.yaml` → `modules/workflows/pages/simple-review.yaml` — rename via `git mv` — flip inner `id:` and header comment.
- `modules/workflows/module.lowdefy.yaml` — modify — flip three `_ref:` page paths inside the `pages: _build.array.concat:` block.
- `modules/workflows/components/universal-fields/universal-fields.yaml` — modify — flip page names in header comment.
- `modules/workflows/README.md` — modify — flip shared-pages table rows, the `kind: form` emission note, and the `update-action-{action_type}` description.

## Notes

- The renames are mechanical text swaps. Do not change page structure, layout block IDs (block IDs are not URL-facing and not scoped by entry ID), or any other content inside the page YAML beyond the inner `id:` and the header comment.
- After this task, intermediate-state behaviour: validator still rejects `kind: simple` (Task 1 not yet done in a parallel landing), so the demo build will fail until Task 1 also lands. That's expected — Tasks 1–3 ship together.
- The `.lowdefy/server/build/pages/workflows/` build-cache contains stale `task-edit.json` etc. — leave those alone; the next `pnpm build` (run as part of Task 3 verification) replaces them.

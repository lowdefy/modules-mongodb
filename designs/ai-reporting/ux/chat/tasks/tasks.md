# Implementation Tasks — Reporting chat surface: teaching both jobs, and the panel as artefact store

## Overview

These tasks implement `designs/ai-reporting/ux/chat/design.md`: the chat page reworked so the report
path is a thing you can click, the results panel is always present and explains its own shape,
tabular answers join charts and downloads as panel artefacts, the conversations rail becomes usable
at more than a handful of conversations, and both paths that write rows into the conversation
document are bounded. It rests on one block change — a `setInput` method on `AgentChat` — without
which the empty state cannot teach anything.

## Global Constraints

Copied from `design.md` and the parent `designs/ai-reporting/ux/design.md`. Every task inherits them.

- **Persisted field names are `snake_case`**; `created` / `updated` / `deleted` are change stamps of
  shape `{ timestamp, user: { name, id } }`, composed from
  `modules/ai-reporting/defaults/change_stamp.yaml`.
- **Five names stay camelCase because they are not this module's to choose:** `conversationId`,
  `messages`, `steps`, `toolResults` and `dataParts` — the `AgentChat` block's property and the
  agent framework's `onFinish` payload keys. The field `dataParts` persists to is `data_parts`.
- **The identity key is `_user: id`.** Conversation scope is `owner.user_id`, always derived from
  `_user`, **never** from the payload — these endpoints are HTTP-callable and the writes are
  upserts.
- **The soft-delete read predicate is `deleted.timestamp: { $exists: false }`.** `deleted` is
  initialised `null` on insert. **Nothing hard-deletes** — no purge endpoint, no archive state.
- **No writer may name the same path in `$set` and `$setOnInsert`** — MongoDB code 40,
  `Updating the path 'owner' would create a conflict at 'owner'`, thrown on **every** call, not only
  on inserts. Nested overlaps conflict too. The invariant is the union across the two writers, not a
  shared list.
- **`_payload` of an absent key resolves to `null`**, not `undefined`, so every optional payload key
  needs an explicit `_if_none` guard. Destructuring-style defaults do not apply.
- **The query engine, the catalog, the allowlists and the read-only principal are untouched.**
  Nothing here widens what can be queried.
- **No var derives from the catalog.** The catalog's per-collection `description` is prompt material
  for the agent, not user-facing copy.
- **Every var carries full `description` / `type` / `default` in `modules/ai-reporting/module.lowdefy.yaml`**,
  then `pnpm docs:gen`. Never hand-edit `docs/ai-reporting/reference/vars.md` or `docs/llms.txt`.
- **The manifest lists every endpoint explicitly** — an unreferenced API file is never loaded.
- **API endpoint ids are kebab-case; step, block, request and action ids are snake_case;** page ids
  are kebab-case.
- **`AgGridBalham` for every table**, never another AG Grid theme.
- **Block, request and operator knowledge comes from the `lowdefy-docs` MCP tools**
  (`lowdefy_get_schema`, `lowdefy_get_examples`, `lowdefy_search_docs`), not from guessing property
  names.
- **The numbers, verbatim:** a 200 KB request-set result budget on the agent's read path; 200 rows
  retained per table part; `$slice: -50` on the parts array; the rail's window is 200
  conversations; `MAX_DATA_PARTS_SPECS` is 8 **per kind per turn** (charts, tables, downloads
  independently); the expanded layout is 232px / fluid / 348px with a ~62ch measure on the middle
  column.
- **Plugin changes need `pnpm --filter @lowdefy/modules-mongodb-plugins build`** before
  `pnpm ldf:b` sees them — the demo consumes the package's `dist`.
- **`pnpm ldf:b` from `apps/demo` is the only automatable gate.** Exercising the surface needs a live
  server, real secrets and a reachable MongoDB — a human step. **Never start a server in the
  foreground:** `lowdefy dev` / `pnpm ldf` / `lowdefy start` never exit.
- **No changeset.** The module is still being built out; do not add one and do not raise it as owed.

## Tasks

| #   | File                              | Summary                                                                                               | Depends On |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-validate-table-spec.md`       | `validateTableSpec` + the shared `validateFormat`, registered on `_analytics`                         | —          |
| 2   | `02-chart-part-projection.md`     | `buildEChartsOption` projects `dataset.source` to `[x, …y]`                                           | —          |
| 3   | `03-build-data-parts-tables.md`   | The spec on every part, a tables branch and budget, the 200-row cap with `row_count`                  | 1, 2       |
| 4   | `04-agent-read-budget.md`         | `request.maxResultBytes` on `AnalyticsPipeline`; `query-data-tool` with the 200 KB budget + `display` | —          |
| 5   | `05-render-table-endpoint.md`     | `render-table`, mirroring `render-chart` — validate before ack, return the spec not the rows          | 1, 4       |
| 6   | `06-emit-and-read-table-parts.md` | A second `:for`, minted `id` / `created`, `$slice: -50`; the read-back branch                         | 3, 5       |
| 7   | `07-conversation-insert-shape.md` | The per-writer `$setOnInsert` union — the live defect the rail already shows                          | —          |
| 8   | `08-rail-server-side.md`          | `list-conversations` soft-delete filter and cap 200; new `delete-conversation`                        | 5, 7       |
| 9   | `09-agent-tools-and-prompt.md`    | `render_table` wired, `query_data` repointed, the mermaid-sketch rule                                 | 4, 5       |
| 10  | `10-set-input-patch.md`           | The `setInput` method on `AgentChat` — controlled `Sender`, three edits                               | —          |
| 11  | `11-welcome-vars.md`              | The `welcome` namespace var, six leaves, and `pnpm docs:gen`                                          | 8          |
| 12  | `12-chat-shell-and-collapse.md`   | Three columns at the new widths, both collapses, the panel visible when empty, the scope control      | —          |
| 13  | `13-chat-rail.md`                 | Rail search, recency grouping, the per-item menu → rename and delete                                  | 8, 12      |
| 14  | `14-chat-table-results.md`        | The `tables` state array in all four places, the `onDataPart` branch, the table cards                 | 6, 13      |
| 15  | `15-chat-empty-state.md`          | The block's `welcome` unset; two tracks of starters filling the composer                              | 10, 11, 14 |
| 16  | `16-demo-consumers.md`            | Partial `welcome` override; seeded conversations across three groups and one over-cap table           | 11, 15     |
| 17  | `17-docs-and-exercise.md`         | The docs surfaces table, the build and test gates, and the first task that runs the surface           | 16         |

## Ordering Rationale

**Tasks 1, 2, 4, 7, 10 and 12 are the leaves and can all start at once.** Each touches a file no
other early task touches: a new validator, one option builder, the connection request plus a new
endpoint, the two conversation writers, the block patch, and the page's shell.

**The plugin comes before the routines that call it, and 2 before 3 for a test-file reason.**
Task 2's projection changes what `buildDataParts` emits, and `buildDataParts.test.js` is the only
place `dataset.source` is asserted — so task 2 owns those three assertions and leaves the suite
green, rather than task 3 inheriting a broken test file it did not cause. Task 3 then adds the
tables branch on top of a projection that already works.

**Task 4 is one task, not two, even though it spans a plugin file and an endpoint.** The
`request.maxResultBytes` key exists solely to serve `query-data-tool`; landing the plugin half alone
adds a property nothing sets, and the endpoint half alone cannot bound anything. They are one
change.

**Tasks 4 → 5 → 8 → 11 are chained for one mechanical reason: they all add an entry to
`modules/ai-reporting/module.lowdefy.yaml`.** There is no logic dependency between the rail's delete
endpoint and the `welcome` var. A manifest `_ref` must name a file that exists, so a parallel batch
would either conflict on that one file or break the build between tasks. The chain happens to run in
the natural order anyway — the agent's read path, the table tool, the rail's server side, then the
copy.

**Task 6 is the seam and needs both halves of the table part.** It reads `render_table`'s ack shape
(task 5) out of `toolResults` and calls `buildDataParts`' widened signature (task 3). It also mints
`id` and `created` in the routine rather than in the plugin, because `buildDataParts` is pure with a
unit test file beside it and a uuid or a clock read there would make its tests unpinnable.

**Task 7 sits off every chain.** The `$setOnInsert` split is a bug fix in two files nothing else
touches, and it is deliberately not merged with task 8: one is a correction, the other is new
capability, and mixing them would put a fix nobody can review separately inside a feature commit.
Task 8 depends on it only because `deleted` must be initialised before a read filters on it.

**Tasks 12 → 13 → 14 → 15 are strictly serial because they are one file.** `chat.yaml` is 385 lines
growing to roughly double that, and the four tasks work different regions of it — the shell, the
rail, the panel's table section, the empty state. They could not run in parallel without conflicting,
so the order is chosen so each one's other dependency has already landed: the rail needs task 8's
endpoints, the table cards need task 6's part shape, and the empty state needs both the block patch
(10) and the var (11), which are the longest-lead items on the whole board.

**Tasks 16 and 17 are the closing pair.** The demo's partial `welcome` entry is what build-verifies
per-leaf default resolution, and its seeded conversations are what make the rail's three group
headings and the panel's truncation copy visible at all — so they come after the surfaces that
consume them. Task 17 is the only task that runs the app: the docs, the build and test gates, then
ten numbered steps through the surface end to end. Nothing else on either path opens the page.

## Scope

**Source:** `designs/ai-reporting/ux/chat/design.md`
**Context read:** `designs/ai-reporting/ux/design.md` (the parent's data model, cross-cutting
invariants and endpoint inventory) and `designs/ai-reporting/ux/ownership/tasks/tasks.md` (the sibling
decomposition's global constraints, for consistency). Verified against source: every file the design
names — `modules/ai-reporting/pages/chat.yaml`, the eight conversation and query endpoints, the agent
manifest, `module.lowdefy.yaml`, the five `analytics/` modules the design touches,
`AnalyticsPipeline.js`, the installed `@lowdefy/blocks-antd-x` `AgentChat` and `AgentConversations`
dists, `patches/@lowdefy__blocks-antd-x.patch`, the `_date` and `_media` operator sources, and the
demo's module entry, vars and seed endpoints.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`.

## One design claim the code does not support

Not a task, and not changed here — recorded for `/r2:critique`.

The design says the `buildEChartsOption` projection "reaches the report render path too: an
unfiltered section's baked source narrows the same way, equally losslessly, and a report payload
shrinks with it." It does not. `compileReport.js:518-524` calls `buildEChartsOption` with
`rows: []` and then assigns `option.dataset.source = dataBinding(section, rows)`
**unconditionally** — and `dataBinding` (`compileReport.js:140-145`) returns the raw rows for an
unfiltered section, a deferred `__state` read for a filtered one. So the projection is invisible to
the report path in both directions: it cannot narrow a live report, which is the design's safety
argument and holds even more strongly than stated, but it also does not shrink a report payload.
Task 2 is written to the code, so nothing downstream depends on the claim.

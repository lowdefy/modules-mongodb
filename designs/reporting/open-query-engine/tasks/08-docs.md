# Task 8: Docs — Open Engine Concept, Security Model, Catalog Reference

## Context

Consumer-facing docs live in `docs/reporting/` (currently `index.md`, `how-to/complex-data.md`, `reference/vars.md`). The open engine changes consumer-observable behavior everywhere: how the agent queries, what the catalog is, how charts/reports declare presentation, and what an operator must provision. Docs are the source of truth for authoring behavior, so they must describe the engine as built by tasks 3–6 (verify against the code, not just the design). Every file needs the repo's front-matter block (`title`, `module: reporting`, `type`, optional `concepts`).

## Task

**New concept page** (`docs/reporting/concepts/open-query-engine.md` — creates the `concepts/` dir):

- The pipeline model: the agent authors `{ collection, pipeline }`; validation against a default-deny allowlist of stages/expression operators/query operators; what's allowed vs deferred (from the task-1 sets, not the design tables — code is truth); resource caps and the always-appended row limit; `maxTimeMS`/`allowDiskUse`.
- The two-layer security model: validator (JS/eval, DoS, confidentiality — the sole `$where`/`$function` defense) + read-only principal (writes, privileged commands); why neither alone suffices.
- The grain/fan-out risk: aggregates are not guaranteed double-count-free; prompting steers the agent; views remain an optional pre-baked-grain convenience.

**Catalog reference** (`docs/reporting/reference/catalog.md` or fold into the concept page if short — prefer a separate reference page):

- The catalog shape: collection entries with `roles`, `description`, `fields` (type/description/enum `values`/display hints), `relationships`.
- **Empty-roles semantics stated plainly:** absent/empty `roles` = any authenticated user; role-gating is opt-in per collection; declaring a collection is the act of exposure; the engine enforces the union of roles across all touched collections.
- Display hints are prompt material the agent copies into presentation contracts — not enforcement.
- **The bootstrap workflow** (task 10's script): AI-generated draft, human-curated trusted artifact; the draft emits every collection entry commented out so it fails closed — uncommenting is the curator's declaration decision; `roles` are never AI-drafted; re-runs diff against the curated file as schema-drift detection.
- The view-leak caveat: a cataloged view's own definition can reach undeclared collections — auditing view definitions is an operator responsibility.

**Update `docs/reporting/how-to/complex-data.md`:** views are now an optional convenience (pre-baked grain, field hiding via projection), not the required mechanism for joins/arrays — the agent `$lookup`s directly via catalog relationships.

**Update `docs/reporting/index.md` and any chart/report authoring reference:** the presentation contract (chart `x`/`y`, KPI `valueKey`, table `columns` with per-column `format` descriptors; contract verified against actual rows, empty results render empty), and the filter-binding limitation (bound filter fields must exist on base-collection documents, not post-`$group`/`$lookup` aliases).

Run `pnpm docs:gen` (regenerates `llms.txt` and lints front-matter) and commit the output. `pnpm docs:check` must pass.

## Acceptance Criteria

- All new/updated pages carry valid front-matter; `pnpm docs:check` passes.
- The concept page's allowed/deferred stage lists match `stageAllowlist.js` exactly (docs are behavior truth — verify against code).
- Catalog reference states the empty-roles semantics and the fail-closed bootstrap draft.
- `how-to/complex-data.md` no longer presents views as required.
- No client names anywhere (repo rule).

## Files

- `docs/reporting/concepts/open-query-engine.md` — create
- `docs/reporting/reference/catalog.md` — create
- `docs/reporting/how-to/complex-data.md` — modify
- `docs/reporting/index.md` — modify — link the new pages, update the module summary
- `docs/llms.txt` — regenerate via `pnpm docs:gen`

## Notes

The read-only-principal provisioning steps live in task 9's deployment docs — link to them from the security-model section rather than duplicating.

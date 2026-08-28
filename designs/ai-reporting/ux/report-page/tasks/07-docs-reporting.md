# Task 7: Update reporting docs for the new compiled shape

## Context

`docs/` is the source of truth for consumer-observable behaviour. This design changes what the
report page renders and how the compiled `Dynamic` output is shaped, so two docs pages need
updating (design's Files changed, `docs/ai-reporting/`):

- `docs/ai-reporting/index.md` — the surfaces table (the report page's row: it now shows provenance,
  per-section export, owner recoveries, the withheld distinction, and co-located filters).
- `docs/ai-reporting/concepts/implementation-walkthrough.md` — the compiled shape: the provenance
  header block, per-section CSV actions, co-located filters (no more single top row), the
  withheld Alert variant, and the newly emitted `Link` action (+ its `types.actions` declaration).

## Task

1. Update the surfaces table row for the report page in `docs/ai-reporting/index.md` to reflect the
   new capabilities (provenance line, per-section CSV, owner-only Continue-in-chat + broken-section
   recoveries, withheld-vs-broken Alert, filter co-location). Keep it a one-line-per-surface
   summary consistent with the table's existing style.
2. Update `docs/ai-reporting/concepts/implementation-walkthrough.md` where it describes the compiled
   report shape: the header now carries a provenance block; query-backed sections carry a CSV
   download; filters render inline above their first bound section rather than in a top row; a
   role-denied section renders a withheld Alert distinct from a broken one; the `Dynamic` types
   list now declares `Link`.
3. Follow the docs front-matter schema (every file opens with the YAML block — `title`, `module: reporting`, `type`). Do not hand-edit generated files (`reference/vars.md`, `llms.txt`).
4. Run `pnpm docs:gen` then `pnpm docs:check` — both must be clean (front-matter valid, no drift).

## Acceptance Criteria

- The index surfaces table and the implementation-walkthrough describe the shipped behaviour
  (provenance, per-section CSV, recoveries, withheld distinction, co-located filters, `Link`).
- `pnpm docs:check` passes.

## Files

- `docs/ai-reporting/index.md` — modify: report-page surfaces row.
- `docs/ai-reporting/concepts/implementation-walkthrough.md` — modify: compiled-shape description.

## Notes

- Behaviour described here must match what Tasks 3–6 actually emit — write this after the compiler
  chain is done (dep 6), reading the compiled artefacts if unsure.
- Rationale (why co-location over the cheaper candidates, why withheld carries no recoveries) lives
  in the design, not docs — docs describe the behaviour, not the decision history.

# Task 17: Docs, and the first task that actually runs the surface

## Context

Everything is built. Nothing on either path has opened the chat page and used it end to end, and
the docs still describe a panel of charts and downloads.

`docs/` is the source of truth for consumer-observable authoring behaviour. `docs/ai-reporting/index.md`
carries a "Surfaces exported as pages" table whose `chat` row reads "Conversational — `AgentChat`
with an adjacent charts/downloads panel", and a connections table below it. `vars.md` is generated
and was regenerated in task 11 — do not hand-edit it.

## Task

**Docs.**

- `docs/ai-reporting/index.md` — update the `chat` row of the surfaces table: the panel now holds
  charts, **tables** and exports, and the surface carries a two-track empty state taught by the
  `welcome` var. Keep it to the table row and whatever one sentence nearby goes stale with it.
- Check `docs/ai-reporting/reference/presentation-contract.md` for whether the table contract's
  description is still accurate now that a non-report caller (`render_table`) uses `columns` —
  correct it if it claims the contract is report-only, and leave it alone if it does not.
- Run `pnpm docs:gen` from the repo root and confirm `pnpm docs:check` passes. If `vars.md` changes
  here, task 11 left drift — commit the regeneration.

**No changeset.** The reporting module is still being built out; a changelog assembled from
intermediate states documents reversions that never shipped. Do not add one and do not raise it as
owed.

**The build gate.**

```bash
pnpm --filter @lowdefy/modules-mongodb-plugins build   # the plugin's dist, or the demo builds stale code
npx jest src/analytics src/connections                 # from plugins/modules-mongodb-plugins
pnpm ldf:b                                             # from apps/demo
```

Then inspect the generated artefacts under `apps/demo/.lowdefy/server/build/` — the chat page's
JSON and the API artefacts for `query-data-tool`, `render-table`, `delete-conversation` and
`emit-data-parts`.

Run the repo's full test suite (`CI=true pnpm test` from the root) **with the sandbox disabled** —
sandboxed it fails around nineteen MongoDB suites spuriously, which is the environment and not the
code.

**Exercise the surface.** This needs a running dev server with real secrets and a reachable
MongoDB — a human step, not an autonomous gate. Never start a server in the foreground:
`lowdefy dev` / `pnpm ldf` / `lowdefy start` never exit. Background it and poll
`/api/auth/session`.

Then, against the running app, with the seeds from task 16 run:

1. **First run.** Open `/reporting/chat` on a fresh conversation. Both tracks render; the data-scope
   line is there; the panel is visible and explains itself before anything has happened.
2. **Fill, don't send.** Click a starter from each track. The text lands in the composer and stays
   there until sent.
3. **Ask a question.** The trace line reads as a summary — `842 rows · 0.4s`, not a key list — and
   expanding it shows the pipeline. That is `query-data-tool`'s `display` string arriving.
4. **A table.** Ask for a tabular answer. A `render_table` call, a table card in the panel with the
   declared columns in order, and the seeded over-cap conversation showing _first 200 of N rows_.
5. **A sketch.** Ask for a single-series breakdown of at most six categories — an inline mermaid
   sketch renders in the bubble. Ask for a twelve-month multi-series trend — a panel chart, no
   sketch.
6. **A chart's provenance.** A chart card carries its _as of_ date; reopening the conversation shows
   the numbers from that turn, not today's.
7. **The rail.** Three group headings in recency order; search filters by title and says so when it
   finds nothing; rename sticks across a reload; deleting the active conversation drops you into a
   fresh one and deleting another leaves the transcript alone.
8. **The collapses.** Both panels collapse to strips and expand back; the panel's strip shows
   counts; the state follows you to the reports list and back and resets on reload; a narrow
   viewport starts collapsed.
9. **The budget.** Ask the assistant for something that would return raw wide documents. It gets
   the engine's message — _"Narrow the query — project fewer fields, or aggregate instead of
   returning raw documents"_ — and recovers inside the turn. Note whether the 200 KB line felt like
   it was in the right place; it is one constant in one file and raising it is not a design change.
10. **The insert-shape fix.** Start a new chat and watch the rail: the conversation appears at the
    **top** while the first turn is still streaming, not the bottom.

## Acceptance Criteria

- `pnpm docs:check` passes.
- `pnpm ldf:b` from `apps/demo` builds clean.
- `npx jest src/analytics src/connections` passes in the plugin package.
- The full suite passes with the sandbox off, or every failure is one of the known MongoDB-suite
  environment failures — say which, do not report a clean run over failures you did not read.
- Every numbered step above is walked, with what was observed reported per step. A step that could
  not be run (no `AI_GATEWAY_API_KEY`, no database) is reported as **not run**, not as passing.

## Files

- `docs/ai-reporting/index.md` — modify — the surfaces table
- `docs/ai-reporting/reference/presentation-contract.md` — modify, if it claims the table contract is
  report-only
- `docs/llms.txt` — regenerate, if `pnpm docs:gen` changes it

## Notes

This is the only task on either path that opens the app and uses it. The build check is a
precondition for getting there, not the point of the task — a build confirms the config compiles
and proves nothing about a routine executing.

If step 9's failure feels wrong — a query a user would call reasonable getting rejected — that is a
finding for `/r2:critique`, not a number to change here.

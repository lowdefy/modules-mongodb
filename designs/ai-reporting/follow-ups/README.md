# Reporting follow-ups (backlog)

Ideas captured for the reporting module after the open-engine work, not yet
scheduled or fully designed. Each has a **draft** `design.md` — a starting
sketch and a set of open questions, not a settled plan. Treat them as the input
to a proper `/r2:discover` pass, not as ready-to-build specs.

Captured 2026-08-18, off `feat/reporting-open-engine`.

1. **[Report visual polish](./report-visual-polish/design.md)** — make the
   rendered reports look good. Produce wireframes of strong report layouts, then
   run a design pass with Fable using the lowdefy-docs MCP + the wireframes to
   propose concrete ways to improve what the module renders.
2. **[Report-data MCP](./report-data-mcp/design.md)** — an MCP server that lets a
   user reference a saved report and pull its resolved data into their own agent,
   to build a presentation or anything else from it.
3. **[Report interpretation section](./report-interpretation/design.md)** — an
   on-demand, AI-generated "what this report is telling you" section the user can
   refresh against the latest data, reflecting the report's currently-applied
   filters so it describes the filtered slice, not the whole dataset.

These do not contradict "build for concrete needs" — they are recorded as a
backlog to pull from when a concrete need surfaces, not committed work.

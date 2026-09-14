# Task 5: Documentation — the save-as-report how-to

## Context

`docs/` is the source of truth for consumer-observable authoring behaviour. The reporting docs
live under `docs/ai-reporting/` with `index.md`, `concepts/`, `how-to/`, and `reference/`. This task
documents the new tick-and-save flow so an app author (and their users, via the author) knows the
route exists and how it behaves.

The flow this task documents (built in tasks 1–4): tick result cards in the chat panel → **Save
as report** → a confirm sheet (name, reorder/remove sections) → saved report, with a link back to
the source conversation.

## Task

Add a how-to page **`docs/ai-reporting/how-to/save-as-report.md`** covering:

- **What it is** — turning the charts/tables/downloads a conversation produced into a saved,
  navigable report by ticking them and confirming a pre-filled sheet. Contrast briefly with the
  agent's `generate_report` route (the guided primary route that also composes KPI and markdown
  sections; tick-and-save is the "keep the discrete results I'm looking at" route).
- **How to use it** — tick cards, press Save as report, edit the name, reorder with ↑/↓ or remove
  rows, save; the report opens and links back to the conversation.
- **What it can and cannot assemble** — chart, table and download sections only. KPI and markdown
  sections come from the `generate_report` route (no panel card renders them to tick); filters are
  not yet authorable from the sheet (filterless-first — the filter picker is forthcoming). State
  these as current behaviour, not as a roadmap.
- **The conversation link** — reports created this way link back to their source chat;
  reports created by the agent tool do not (the continue-in-chat affordance is simply absent
  there, not broken).

Follow the docs front-matter schema (required `title`, `module: ai-reporting`, `type: how-to`, and
`concepts:` where useful) and `docs/CONTRIBUTING.md`. Link the new page from
`docs/ai-reporting/index.md` where the module's how-tos are listed.

Do **not** hand-edit generated files (`docs/ai-reporting/reference/vars.md`, `docs/llms.txt`). If any
manifest var changed (none is expected in this feature), run `pnpm docs:gen` instead.

## Acceptance Criteria

- `docs/ai-reporting/how-to/save-as-report.md` exists with valid front-matter and covers: what the
  route is, how to use it, the chart/table/download-only scope (with KPI/markdown/filters called
  out as out-of-route), and the conversation-link behaviour.
- It is linked from `docs/ai-reporting/index.md`.
- `pnpm docs:check` passes (front-matter valid, no generated-file drift).

## Files

- `docs/ai-reporting/how-to/save-as-report.md` — create — the how-to.
- `docs/ai-reporting/index.md` — modify — link the new how-to.

## Notes

- Describe **current** behaviour. Where the design defers something (filters, KPI/markdown on this
  route), say it is not available from the sheet today and where it does come from — don't
  document it as if it works.
- Keep it a goal-oriented how-to, not a rationale essay — the design carries the "why".

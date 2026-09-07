# Task 3: Document the filter step and confirm the demo path

## Context

The save-as-report how-to is `docs/ai-reporting/how-to/save-as-report.md`. It currently carries a
placeholder note (around line 38) saying filters are **not** authorable from the sheet:

> **Filters are not authorable from the sheet today.** The sheet reserves a filters region, but
> the filter picker is forthcoming — for now, tick-and-save creates reports with no
> user-authored filters. …

Tasks 1 and 2 shipped the picker and the server-side derivation, so that note is now stale and
must be replaced with the real authoring step. `docs/` is the source of truth for
consumer-observable behaviour (`CLAUDE.md`), so this documents what now ships, not a roadmap.

This is a docs-only task plus a demo confirmation — no module code changes.

## Task

### 1. Replace the placeholder note with the filter-authoring step

In `docs/ai-reporting/how-to/save-as-report.md`, replace the "not authorable today" note with a
short section describing how a user adds a filter in the sheet:

- The sheet's filters region lets you **add** a filter from a catalog field (add-only — the
  agent authors filters on its own route; this sheet only adds/edits/removes its own).
- Which fields are offered: fields with a fixed set of values (enum), fields that look up a
  related record (relationship — you also pick which label column to show), and date fields
  (a date range). Free-text fields are not offered.
- The control follows the field: a date field gives a date range; other fields a multi-select.
- An `any`/`all` toggle appears for list-valued (array) fields.
- Options are **not** previewed while authoring; they resolve when the report opens (so a
  mis-picked label column shows up on first render, not in the sheet).

Keep it goal-oriented and short, matching the file's existing voice. Preserve the front-matter.

### 2. Note the excluded numeric-field gap (design decision 2)

Add a brief note, where a reader would look for it, that **numeric-range filters are not
available**: report-filters has no `numberrange` control, so a "value over X" filter cannot be
authored from the sheet yet. State it as a current limitation so a user isn't left hunting for a
numeric filter that can't exist. Do not describe it as planned work.

### 3. Confirm the demo exercises the looked-up path

No new demo config is needed — the demo already mounts the reporting chat page and its catalog
(`apps/demo/modules/ai-reporting/catalog.yaml`) already seeds a `demo_activities.company_ids` →
`demo_companies` relationship with `name` as a label field. Confirm this by build and record the
dev-test:

- `pnpm ldf:b` from `apps/demo` compiles with the picker present (already covered by task 2).
- The full derive → save → resolve-on-open path (author a company filter on a `demo_activities`
  section through the sheet, save, open the report, confirm the filter control renders with
  looked-up options) needs a dev server with Mongo + AI — record it as a dev-test step, not a
  build-gate item.

### 4. Regenerate generated docs

Run `pnpm docs:gen` and commit any changes to `docs/llms.txt` (front-matter/index). `vars.md` is
unaffected (no manifest var change). Confirm `pnpm docs:check` passes.

## Acceptance Criteria

- `docs/ai-reporting/how-to/save-as-report.md` no longer claims filters are un-authorable; it
  describes the add-only picker, the field-eligibility rules, control-follows-type, the any/all
  toggle, and blind-emit (options resolve at open).
- The numeric-field limitation is documented as a current gap.
- `pnpm docs:check` passes (front-matter valid, `llms.txt` up to date).

## Files

- `docs/ai-reporting/how-to/save-as-report.md` — modify — replace the stale filters note with the
  authoring step; add the numeric-gap note.
- `docs/llms.txt` — modify (generated) — regenerate via `pnpm docs:gen` if changed.

## Notes

- Do not hand-edit `docs/llms.txt` — it is generated. Run `pnpm docs:gen`.
- Front-matter schema is enforced by `docs:check`; keep the existing `title`/`module`/`type`
  block intact.

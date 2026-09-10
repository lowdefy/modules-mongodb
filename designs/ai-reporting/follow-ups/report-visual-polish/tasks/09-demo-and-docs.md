# Task 9: Demo report exercising every rule, docs, acceptance sweep

## Context

Repo rule: every new consumer-facing capability ships with a real demo
consumer. The seeded example report
(`apps/demo/api/reporting-seed-example-report.yaml`) is the reference report
the demo and parts of the e2e suite render; the design's step 6 asks for a
report that hits **every** derivation rule. Docs follow the implementation —
this is the one task allowed to touch `docs/`.

## Interfaces

- **Consumes:** everything tasks 1–8 shipped; the derivation rules and
  conventions as implemented (read `compileReport.js`, not the design, where
  they disagree — and flag any disagreement rather than papering over it).

## Task

1. **Extend the seeded example report** so one coherent report (backed by the
   existing demo seed data — extend `reporting-seed-orders.yaml` only if a
   rule genuinely can't fire on current data) exercises:
   - a KPI run of 4 (the 4-up row) — and, if the narrative bears it, a run of
     5 (the 3 + 2 balance);
   - two **adjacent narrow charts** (pair → two span-12 boxes);
   - a **wide temporal chart** (span 24);
   - a chart with **> 8 categories** and one with **> 4 series** (stacked
     status data);
   - a **pie with > 7 slices** (cap → 6 + neutral Other) sharing at least one
     slice name with another section's series (colour identity on screen);
   - a **6-column table** (flex fill) and a 2-column table (no blank gutter);
   - a **download run** of ≥ 2 (one Downloads card);
   - **markdown between two narrow charts** (run separation — they must not
     pair);
   - filters sharing one bound set (one scope line) and, if the seed already
     has a differing filter, keep it (per-control note).
2. **Update the e2e suites** for the extended seed where they assert against
   it; add assertions pinning the headline rules (pairing, the Downloads card,
   the capped pie) so regressions fail in CI, not at review.
3. **Docs** (`docs/ai-reporting/**`): update whatever pages describe
   consumer-observable rendering — derived layout (order as the intent
   channel, pairing), the filter scope line and Reset, the Downloads card, the
   capped pie. No manifest var changed, so `vars.md` should be untouched — run
   `pnpm docs:gen` and `pnpm docs:check` to prove it. Front-matter per
   `docs/CONTRIBUTING.md`.
4. **Acceptance-bar sweep** — close out `design.md`'s bar and put the evidence
   in the PR description:
   - (1) palette validator output, both modes — from task 2; re-run if the
     surface changed.
   - (2) stock-hex tests — task 2; (8) drift test — task 5: point at the
     suites.
   - (7) `pnpm ldf:b` clean and the demo report resolves.
   - Full `pnpm e2e` (background it; it exits on its own) — green.
   - (3)–(6) are `/r:dev-test` + screenshot judgments at PR review: scroll
     height under ~4000px (from 7810px) with no section smaller than its data
     needs; zero label/title collisions and zero clipped or under-filled
     table columns; colour identity visible (same name, same hue; Other
     neutral); side-by-side against `wireframes.html`, section by section.
     **List these explicitly in the PR description as reviewer steps** — they
     are the acceptance bar, not optional polish.

## Acceptance Criteria

- The compiled demo report exercises every row of the derivation table
  (assert the interesting ones in e2e, per 2).
- `pnpm ldf:b` clean; full `pnpm e2e` green; `pnpm docs:check` clean.
- PR description carries the validator output and the reviewer's
  `/r:dev-test` checklist for items (3)–(6).

## Files

- `apps/demo/api/reporting-seed-example-report.yaml` — modify
- `apps/demo/api/reporting-seed-orders.yaml` — modify only if a rule can't fire on existing data
- `apps/demo/e2e/ai-reporting/*.spec.js` — extend
- `docs/ai-reporting/**` — modify per docs impact
- `docs/llms.txt` — regenerate via `pnpm docs:gen` if docs changed

## Notes

- **No changeset** — the module is still being built out.
- **No client names** anywhere in the seed or docs; the corpus stays generic.
- Don't mark the design `_completed/` — that move is the user's call, never
  yours.

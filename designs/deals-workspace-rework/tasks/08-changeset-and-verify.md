# Task 8: Add the changeset and verify the release

## Context

Tasks 1–7 have landed all the code. This task records the release and verifies it as far as can be
done autonomously.

One change in this set is **breaking for consumers**: task 1 re-keyed `get_selected_deal`'s workflow
form-data alias from `workflows.{action_type}.{field}` to
`workflows.{workflow_type}.{action_type}.{field}`. A host app reading the old shape gets null and
falls back silently — no error — so the changeset must tell consumers exactly what to change.

This repo uses changesets (`.changeset/`). Its convention for a breaking config change is a **minor**
release carrying an explicit `**Breaking (config):**` note in the changeset body — that is how the
deals module's previous breaking var change was shipped, and consumers adopted it from the note.

## Task

**1. Write a changeset** under `.changeset/`, following the existing files' format. It covers the
`deals` module and the `activities` module (task 7's docblock). Minor for `deals`.

The body must include:

- A `**Breaking (config):**` paragraph for the form-data re-key, giving the before and after read
  shapes and stating that all of the deal's workflows are now exposed rather than one. Say plainly
  that a stale read resolves to null without erroring, so consumers should grep their config for
  `workflows.` reads on the deal view rather than relying on a build failure.
- The info-grid slot position change — host tiles now render **before** the built-in People and Files
  tiles instead of after. Not breaking (no var renamed, no host config change needed), but visible, so
  consumers should know their tile order shifts.
- The layout and presentation changes, briefly: open items stacked rather than columned, related deals
  bounded to one horizontally-scrolling row of fixed-width cards, workspace columns evened to 12/12, a
  new-deal button and collapse toggle on the deals list panel, card volumes at 2 decimal places.
- For `activities`: a docblock correction only, no behaviour change.

**2. Run the build check.** `pnpm ldf:b` from `apps/demo` (or
`pnpm --filter @lowdefy/modules-demo ldf:b` from the root). Use the plain variant — never `ldf:b:i`,
which needs Infisical and fails in the sandbox. Build failures here are real config errors; fix them.

**3. Run the docs gate.** `pnpm docs:check` must pass. If it fails, task 3's `pnpm docs:gen` run was
missed or a manifest description changed afterwards — regenerate and commit rather than hand-editing
`docs/deals/reference/vars.md`.

**4. Inspect the built artifacts** for the two changes that a compile cannot confirm:

- The deals view page's built pipeline for `get_selected_deal` contains the `$arrayToObject` stage and
  no `workflow_type` equality in the workflows `$lookup`, and the related-deals lookup limits to 10.
- The built `view.yaml` page shows `pipeline_col` and `detail_col` at span 12, and the card meta-line
  template using `toFixed(2)` rather than the `round` filter.

Built output is under `apps/demo/.lowdefy/server/build/pages/**`.

**5. Write the human verification checklist** into the PR or hand it to whoever runs the app. A build
check is **not** a smoke test in this repo — running `apps/demo` needs real secrets and a reachable
MongoDB, so none of the following can be verified autonomously:

- The info grid renders host tiles before People and Files — the demo now injects a `qualification`
  tile for exactly this, so it is checkable there.
- Open items read as one stacked block, Actions above Tasks, with no double border.
- The related-deals strip is one row, scrolls horizontally past ~3 cards, and its names ellipsise on
  one line.
- The left panel's new-deal button navigates to the create page; the chevron collapses to a full-height
  36px rail and expands back with search, selection and pagination intact.
- The pipeline card's header holds its height when the workflows are expanded.
- Below 768px, collapsing now leaves the same 36px rail beside a narrow workspace, not the full-width
  header strip an earlier draft described — confirm that reads acceptably and that the workspace is
  reachable without scrolling a full screen.
- Deal-card volumes show two decimals.
- On a deal carrying two workflows, values sourced from **both** workflows render — this is the one
  that catches a bad re-key, and it needs a host app with a split pipeline.

## Acceptance Criteria

- A changeset exists under `.changeset/` naming `deals` (minor) and `activities`, containing an
  explicit `**Breaking (config):**` note with the before and after read shapes.
- `pnpm ldf:b` from `apps/demo` passes.
- `pnpm docs:check` passes.
- The four artifact inspections in step 4 confirm what they claim.
- The human verification checklist is recorded where whoever runs the app will see it.

## Files

- `.changeset/{descriptive-name}.md` — create — minor release note for `deals` and `activities`, with the breaking-config note.

## Notes

- **Do not name the consuming app** in the changeset, the commits, or anything else tracked in git.
  Refer to "the host app" or "consumers". This is a repo-wide rule.
- **Do not start a dev server or e2e run to verify.** Both are long-running processes that never exit;
  a foreground call looks like a hang. The `apps/workflows-test` harness can run autonomously, but it
  exercises the `workflows` module and has no deals scenarios — it is not a route to verifying this
  work.
- The design leaves "one release or two" open — whether to ship the form-data re-key ahead of the
  rest, since it is the only change gating the host app's own follow-on work. One changeset covering
  everything assumes a single release; if the decision changes, split it.
- Two items are deliberately *not* in this release: the unresolved `deal-status-chip` export defect
  (the manifest declares an export with no top-level `components:` list to resolve it), and the host
  app's own migration. Don't fold either in.

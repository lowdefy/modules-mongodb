# Task 7: Close the two deal-view reuse gaps

## Context

Workstream B4. The deal view embeds the workflows `actions-on-entity` component (`pages/view.yaml:522`) but misses two shared workflows surfaces it should use:

1. It does **not** drop the shared `check-action-modal`, so a `check`-kind action full-page-navigates to the action's own page instead of opening in-context (per `check-action-click.yaml:8-16`).
2. It **hand-rolls** its workflow refetch (`pages/view.yaml:304-320`) instead of using the exported `entity-workflows-refetch` component.

Both are consume-the-existing-export fixes, no new module code.

## Task

On the deals **deal view**:
- `_ref` the workflows `check-action-modal` component, supplying an `on_complete` refetch list — mirror `apps/demo/modules/companies/vars.yaml:86-100`.
- Replace the hand-rolled refetch sequence (`view.yaml:304-320`) with the exported `entity-workflows-refetch` component.

## Acceptance Criteria

- A `check`-kind workflow action on a deal opens the in-context `check-action-modal` rather than navigating to a full page.
- The deal view's workflow refetch goes through `entity-workflows-refetch`; the hand-rolled sequence is gone.
- `CI=true pnpm ldf:b` green; changeset for deals (patch/minor); `docs:check` green.

## Files

- `modules/deals/pages/view.yaml` — modify — add `check-action-modal` drop; swap refetch for `entity-workflows-refetch`.
- `.changeset/*.md` — create.

## Notes

Functionally independent of tasks 4–6, but edits the same `view.yaml`; run last among the B tasks to avoid churn. No changes to the workflows module — these components already exist and are exported.

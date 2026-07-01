# Task 9: Workflows `how-to/` (Phase 3c)

## Context

The `how-to/` pages are task-oriented — "to do X: …" — and complete the workflows exemplar alongside `index.md`/`reference/` (Task 7) and `concepts/` (Task 8). Their source material is the **demo workflow configs** in `apps/demo/modules/workflows/workflow_config/` (onboarding, company-setup), which exercise the real authoring patterns. How-to pages link out to `concepts/` for the "why" and to `reference/` for lookup, rather than re-explaining.

## Task

Author six `how-to/*.md` files, each `type: how-to`, `module: workflows`, derived from the demo configs:

- `how-to/add-a-review-step.md`
- `how-to/conditional-actions.md`
- `how-to/multi-app-access.md`
- `how-to/track-a-child-workflow.md`
- `how-to/instanced-actions.md`
- `how-to/write-a-hook.md`

Each follows a task recipe shape: a one-line goal, prerequisites, numbered steps with concrete YAML snippets lifted/adapted from the demo configs, and links to the relevant `concepts/` and `reference/` pages. Verify each pattern against the actual demo config — these must be real, working authoring steps, not invented ones.

Cross-cutting: `conditional-actions.md` should steer authors away from the conditional-action `blocked_by` anti-pattern (link `concepts/groups-and-blocking.md`); `track-a-child-workflow.md` should cover tracker `start_link` wiring; `instanced-actions.md` should cover instanced-action form-data paths. These hotspots are explained in concepts (Task 8) — the how-to shows the concrete steps.

## Acceptance Criteria

- Six `docs/workflows/how-to/*.md` files exist with `type: how-to` front-matter.
- Each page is a concrete task recipe with YAML snippets grounded in `apps/demo/modules/workflows/workflow_config/` (onboarding, company-setup) — verified against the actual config, not invented.
- How-to pages link to the relevant `concepts/` and `reference/` pages instead of re-explaining concepts.
- `track-a-child-workflow.md` covers tracker `start_link`; `instanced-actions.md` covers instanced form-data paths; `conditional-actions.md` references the `blocked_by` anti-pattern.
- All internal links resolve; `pnpm docs:check` passes.

## Files

- `docs/workflows/how-to/add-a-review-step.md` — create.
- `docs/workflows/how-to/conditional-actions.md` — create.
- `docs/workflows/how-to/multi-app-access.md` — create.
- `docs/workflows/how-to/track-a-child-workflow.md` — create.
- `docs/workflows/how-to/instanced-actions.md` — create.
- `docs/workflows/how-to/write-a-hook.md` — create.

## Notes

- Ground every snippet in the demo configs — read `apps/demo/modules/workflows/workflow_config/` before writing. If a how-to topic has no demo example, base it on the authoring grammar (`reference/authoring-grammar.md`) and the manifest, and note any assumption rather than inventing config.
- No tutorials — these are reference-style task recipes ("to do X"), not a guided "build your first workflow from zero" walkthrough (explicitly out of scope).

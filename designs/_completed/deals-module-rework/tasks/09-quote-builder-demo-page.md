# Task 9: Build the lightweight deal-scoped quote-builder demo page

## Context

Workstream C. The onboarding workflow's `send-quote` action (task 8) is a **custom-page** action — it links out to an app-owned `quote-builder` page rather than a generated form, demonstrating that workflow actions can hand off to bespoke app pages. The original `quote-builder` was lead-scoped and was deleted with the leads example, so the demo needs a new deal-scoped one. Keep it lightweight — the point is to showcase the custom-page-action capability, not to build a full quote builder.

## Task

Create a lightweight, deal-scoped `quote-builder` page in the demo that the `send-quote` action links to: capture a quote line / value and submit for review (feeding the workflow's reviewer/approve flow). Wire it to the deal in context (deal id from URL query) and back to the workflow action on submit. Register the page in the demo (`apps/demo/lowdefy.yaml` / demo pages) under the id `send-quote` links to in task 8.

## Acceptance Criteria

- A deal-scoped `quote-builder` page exists and is registered in the demo.
- From a deal's `send-quote` action, the page opens, captures a quote value, and submits back into the workflow's review flow.
- `CI=true pnpm ldf:b` green.

## Files

- `apps/demo/pages/deals/quote-builder/*` (or the demo's page convention) — create — lightweight quote-builder page.
- `apps/demo/lowdefy.yaml` — modify — register the page (if pages are registered there).

## Notes

Depends on task 8 for the action↔page id contract. Keep scope minimal — a single value + submit; not a full line-item builder.

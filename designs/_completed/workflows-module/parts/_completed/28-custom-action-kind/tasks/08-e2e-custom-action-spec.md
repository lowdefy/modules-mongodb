# Task 8: E2e spec — custom-action click-through + observer fallback

## Context

(Depends on task 7 — the `custom-action` config + app page + wiring — and on
tasks 1 & 4 for the runtime: FSM alias + link routing.)

E2e specs live in `apps/workflows-test/e2e/workflows/`. They use the shared
fixtures (`../fixtures.js`): `ldf` (navigation, block interaction, user sessions),
`mdb` (Mongo seed/read, wiped between tests), and the `workflow` driver
(`workflow.start`, `workflow.assertStatus`). See
`apps/workflows-test/e2e/workflows/check-blocked-by.spec.js` for the canonical
shape: create a user, seed a `things` doc, `workflow.start(...)`, read actions out
of the `actions` collection by type, drive the UI, assert committed status.

The **load-bearing assertion** for this part (catches the design's #1/#2 defect
class) is the **click-through**: the rendered action card's link carries the
concrete action `_id` (NOT the literal `true` sentinel) and navigates to the
app-owned page. The card lives on the entity surface (`/thing-view?_id=...`),
which renders `actions-on-entity`; for a custom (non-check) action the baked-in
`check-action-click` handler navigates via the server-resolved `action.link`.

## Task

Create `apps/workflows-test/e2e/workflows/custom-action.spec.js`:

1. **Setup**: create a user with the role(s) the custom action's `access.edit`
   requires; seed a `things` doc; `workflow.start({ workflow_type: "custom-action",
entity_id, entity_collection: "things-collection" })`. Read the custom action
   out of the `actions` collection to get its concrete `_id`.

2. **Click-through (load-bearing)**: go to `/thing-view?_id=<thingId>`, find the
   custom action's card, and click it. Assert the resulting URL is the app-owned
   working page with `action_id=<the concrete _id>` — explicitly assert the query
   carries the real UUID, **not** the string `true`. (Either assert on the
   navigated URL, or assert the rendered card link's `href`/urlQuery before
   clicking — the point is the sentinel was substituted to the concrete `_id`.)
   Optionally drive the page's submit button and `workflow.assertStatus(...)` to
   confirm the app page → `custom-action-submit` round-trip advances the FSM.

3. **Observer fallback**: as a **view-only** user (a user whose roles satisfy
   `view` but not `edit`/`review` for the custom action's slug), confirm the card's
   link resolves to the shared `{workflow_type}-action` page (the
   `collapseLink` `view`-slot fallback), **not** the app working page. The
   `custom-action` workflow's shared page id is `custom-action-action`, so assert
   the navigated URL contains `custom-action-action` with `action_id=<_id>`.

Add a top-of-file comment (matching the suite style) stating the cluster's purpose
and that the click-through is the assertion guarding the #1/#2 defect class.

## Acceptance Criteria

- `custom-action.spec.js` exists and runs under the `workflows-test` e2e harness.
- The click-through assertion proves the card link carries the concrete action
  `_id` (not `true`) and navigates to the app-owned page.
- The observer-fallback assertion proves a view-only user lands on
  `custom-action-action` (the shared `{workflow_type}-action` page), not the
  working page.
- The spec passes against the implemented branch (tasks 1–4 + 7).

## Files

- `apps/workflows-test/e2e/workflows/custom-action.spec.js` — create — the e2e spec.

## Notes

E2e execution needs real secrets and a reachable MongoDB (not an autonomous build
gate) — running the spec is a `/r:dev-test`-style step, not part of CI's build
check. The build-compile gate is task 7's `pnpm ldf:b`.

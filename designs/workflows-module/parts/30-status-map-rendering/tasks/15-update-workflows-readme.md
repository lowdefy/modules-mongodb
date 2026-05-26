# Task 15: Document `metadata` and `action_display` in the workflows README

## Context

Two new caller-facing payload fields land with this part: `metadata` (accumulated key-value bag, merged across transitions, reachable in templates) and `action_display` (per-transition override of the per-app cell, scoped to one transition, not persisted to config). They are accepted by both the Start API and every `update-action-{action_type}` Api.

`modules/workflows/README.md` documents the consumer-facing API surface. It needs entries for both fields under the Start / Submit payload documentation.

Key wording requirements (per design D8):
- `action_display` is the per-call override path for the **action**'s per-app cell.
- Shape: `{ [slug]: cellShapeForKind }` — `{ message?: string }` for built-in kinds, `{ message?: string, link?: { pageId, urlQuery, input? } }` for custom kind.
- Scoped to one transition; not persisted to the action config.
- **Must call out the distinction** from `event_overrides.{interaction}.display` (which targets the **event** doc, has `{ title, detail?, icon? }` per slug, and is documented in Part 9 / Part 32) so readers don't conflate the two.
- `metadata` accumulates across transitions: `{ ...previous, ...new }` is written to `action.metadata` and is reachable in templates as `{{ metadata.* }}` (action-display render context) and `{{ action.metadata.* }}` (event-display render context).

## Task

1. **`modules/workflows/README.md`** — under the section that documents Start / Submit payloads, add entries for `metadata` and `action_display`. Use the wording requirements above. Cross-link to:
   - `docs/idioms.md#event-display` for the event-display idiom (so readers know `event_overrides.{interaction}.display` lives there).
   - The `app_name` var documentation in the same README (so readers see the unified role of `app_name`).

2. If the README has a Worked Example section, optionally add a small example showing:
   ```js
   submit({
     metadata: { physical_id: "D-42" },
     action_display: {
       demo: { message: "Custom handling for {{ physical_id }}" },
     },
   });
   ```
   with a one-sentence note that the override is rendered against the same context as the cell.

## Acceptance Criteria

- README documents `metadata` and `action_display` under the appropriate Start / Submit payload section.
- The distinction from `event_overrides.{interaction}.display` is called out explicitly.
- Cross-links to `docs/idioms.md#event-display` and the `app_name` var doc resolve.
- Markdown lints / link-checkers (if any are part of the repo's build) pass.

## Files

- `modules/workflows/README.md` — modify.

# Task 8: Reject an authored event `display` `description` at build

## Context

The `display.{app}.description` slot is **comment-only** (design D4): the runtime comment is its only writer. Authors override per-app **title** (D7); they must not author a static `description`. The runtime backstop is task 2 (the merge strips any non-comment `description`), but the "one correct way" enforcement is at **build time** — an authored `description` should fail the build with a clear message, not be silently ignored.

Event-map validation already lives in `modules/workflows/resolvers/makeWorkflowsConfig.js` (Part 48):

- **`validateEvent(workflow, action)`** (`:161`) — validates the keys of a per-action `event` map (`action.event[signal]`) against the known signals, but does **not** descend into the `display` shape.
- The **workflow-level lifecycle event map** validator (Part 48 D8, `:522`) — validates lifecycle signal keys (`started`/`cancelled`/`closed`) the same way.

Neither currently inspects `display.{app}.{title,description}`, so an authored `description` passes the build today and would only be caught by the runtime strip.

## Task

Amend `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. In `validateEvent` (per-action), for each signal's `display` map, walk each app bucket and `fail(workflow.type, …)` if a `description` key is present. Message names the offending location and points to the fix — e.g. `action "{type}" event "{signal}" display "{app}" has a "description" — event descriptions are owned by the action comment and cannot be authored; set only "title" here.`
2. Apply the same check in the workflow-level lifecycle event-map validator (`:522`) — lifecycle events carry no comment, so a static `description` there is dead config; reject it with the lifecycle-flavoured message.
3. Only `description` is rejected; `title` (and any other currently-allowed display keys) pass unchanged. Use the existing `fail()` helper (`:113`) so the error matches the resolver's format.

Amend `modules/workflows/resolvers/makeWorkflowsConfig.test.js`:

4. A workflow whose `action.event[signal].display.{app}` carries a `description` → build **throws** with the description message.
5. A workflow-level lifecycle `event[signal].display.{app}` carrying a `description` → build **throws**.
6. A `display.{app}` carrying only `title` → build **passes** (regression guard that title overrides still work).

## Acceptance Criteria

- An authored event/lifecycle `display.{app}.description` fails `makeWorkflowsConfig` with a clear, located message; a `title`-only override passes.
- `pnpm test makeWorkflowsConfig` passes from the repo root.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — reject `description` under any event/lifecycle `display.{app}`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — three cases above.

## Notes

- Back-compat: per the design no shipped config sets a static `description` (it was an optional, unexercised key in the Part 48 schema), so this reject surfaces any stray use loudly at build rather than silently changing rendering. If a real app *did* set one, the build error is the correct signal to remove it — the comment now owns that slot.
- Pairs with task 2's runtime strip (pre-hook returns are code, not build-validated, so the strip remains the backstop for those). Independent of tasks 1, 4–7; relates to task 2 (same decision, D4).

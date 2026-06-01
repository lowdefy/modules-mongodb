# Task 2: Generic `onActionClick` event on the `ActionSteps` block (D5)

## Context

The `actions-on-entity` component renders an entity's workflow actions via the `ActionSteps` block (`plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js`). Today each action row is a **hard `Link`** to `action.link.pageId` / `action.link.urlQuery` (`ActionSteps.js:162–171`) — clicking always navigates to the action page. There is no click event.

Part 40 adds an **in-context modal** so a user can open a simple action without a full page navigation. The decoupling rule (design D5): the block stays **generic** — it fires an `onActionClick(action)` event carrying the clicked action object and knows nothing about workflow surfaces. The host app page (e.g. `actions-on-entity`, Task 6) wires that event to open the modal. When the event is **not** wired, the block keeps its current behaviour and **navigates** — so notifications, overviews, and deep-links are unaffected and the change is backward-compatible.

The sibling `EventsTimeline` block already demonstrates the pattern (`EventsTimeline.js:399–417`): on click it calls `methods.triggerEvent({ name: "onActionClick", event: ... })`, and `meta.js` declares the event. Mirror that here, but the **event payload carries the full action object** (`action`), per D5 ("The event is generic — carries the action object").

`ActionSteps` has **no test file yet** — create `ActionSteps.test.js`.

## Task

1. **Fire the event when wired.** In `ActionSteps.js`, when `onActionClick` is wired (detectable via the block's `events`/`methods` — follow the `EventsTimeline` `methods.triggerEvent` pattern), make each action row call `methods.triggerEvent({ name: "onActionClick", event: action })` on click **instead of** navigating, where `action` is the clicked action object.
2. **Navigate when not wired.** When `onActionClick` is **not** wired, keep the current default: render/behave as a `Link` to the action's link. (Per-verb link selection — choosing `action.links.{verb}` by the user's verbs — is [Part 34 D7]; this task preserves whatever link the block already reads. Do not implement verb selection here. See Notes.)
3. **Declare the event** in `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/meta.js` under an `events:` map, e.g. `onActionClick: 'Triggered with the clicked action object when wired; the block fires it instead of navigating.'` (match the description shape used in `EventsTimeline/meta.js` and `FileManager/meta.js`).
4. **Tests** — create `ActionSteps.test.js` covering both modes:
   - event wired → clicking a row calls `triggerEvent` with the action object and does **not** navigate;
   - event not wired → clicking navigates via the action link (no event fired).

## Acceptance Criteria

- With `onActionClick` wired, clicking an action row fires `onActionClick` with the clicked `action` object as event data and does not navigate.
- With `onActionClick` not wired, clicking an action row navigates via the action link exactly as before (backward-compatible).
- `meta.js` declares the `onActionClick` event.
- `ActionSteps.test.js` exists and covers both modes; the plugin test suite passes.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js` — modify — fire `onActionClick(action)` when wired; navigate otherwise.
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/meta.js` — modify — declare the `onActionClick` event.
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.test.js` — create — cover both modes.

## Notes

- **Per-verb link is Part 34's scope, not this task's.** The design's default-navigation branch ultimately uses the user-selected per-verb link `action.links.{verb}` ([Part 34 D7]). The block currently reads a single `action.link`. Keep using whatever link field the block reads today for the navigate branch; if Part 34 has already migrated the block to `action.links.{verb}` selection, preserve that. Either way this task only adds the **event-vs-navigate** branch.
- The `EventsTimeline.onActionClick` event and the timeline action-items wiring belong to **Part 41**, not here. This task defines only the `ActionSteps` event; the modal component it ultimately opens is defined in Task 5 and wired in Task 6.

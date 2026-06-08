# Task 2: `ActionSteps` block — generic `onActionClick` event (D5)

## Context

Part 40 (D5) lets live working surfaces open a check action **in place** via a modal instead of navigating. The mechanism is a **generic** event on the `ActionSteps` block: when a host wires `onActionClick`, the block fires it with the clicked action object **instead of** navigating; when not wired, the block navigates exactly as it does today. The block gains **no** workflow-surface knowledge — the event carries the action object and nothing else, keeping `ActionSteps`/workflows decoupled (the host app composes the modal + the wiring in `actions-on-entity`, Task 6).

This is a self-contained plugin change. Nothing in the module depends on it until the `actions-on-entity` wiring (Task 6).

### Relevant current state

- **`plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js`** — each action row renders as a `<Link>` (lines 162–184) to `action.link.pageId` / `action.link.urlQuery` / `action.link.input`, `disabled` when `action.link` is absent/disabled, with `renderHtml` of `action.message` (including the `not-required` strikethrough) and a status-coloured `<Badge>`. `methods` is already destructured. The read-side link resolution (collapsing the engine's per-verb `links` map to the singular `action.link`) is server-side and unchanged ([Part 42 D5](../../_completed/42-timeline-action-cards/design.md)).
- **`plugins/.../blocks/ActionSteps/meta.js`** — block meta with `cssKeys`; no `events` declared yet.
- **Event-firing reference:** the sibling **`EventsTimeline`** block already fires an `onActionClick`-style event via `methods.triggerEvent` and declares it in its `meta.js`. Mirror that pattern — but here the event payload carries the **full action object** (`event: action`).

## Task

In `ActionSteps.js`, change the per-action rendering so that **when `onActionClick` is wired** the action is a clickable element that fires `methods.triggerEvent({ name: 'onActionClick', event: action })` and does **not** navigate; **when not wired** it renders the current `<Link>` (default, unchanged).

1. **Fire when wired.** Detect whether `onActionClick` is registered using the same convention `EventsTimeline` uses (`methods.triggerEvent` / event-registration check). When wired, render the action label as a clickable element (keep the `<Badge>`, status colour, and `renderHtml` of `action.message` incl. the `not-required` strikethrough) whose click calls `triggerEvent` with the clicked `action`. Do not navigate.
2. **Navigate when not wired.** Leave the existing `<Link>` path exactly as-is — `pageId`/`urlQuery`/`input`/`newTab`/`disabled` unchanged — so notifications, overviews, and deep-links are preserved (backward compatible).
3. The group-title `<Link>` (lines 114–129) is **unchanged** — only per-action rows gain the event.
4. **Declare the event** in `meta.js` under an `events:` map: `onActionClick` — fires with the clicked action object instead of navigating when wired (match the description shape used in `EventsTimeline/meta.js`).
5. **Tests** in `ActionSteps.test.js` covering both modes: event wired → click calls `triggerEvent` with the action object and does not navigate; not wired → click navigates via the action link and fires no event.

## Acceptance Criteria

- With `onActionClick` wired, clicking an action fires `onActionClick` with the full action object as event data; no navigation occurs.
- Without `onActionClick` wired, clicking navigates via `action.link` exactly as today (existing behaviour preserved).
- `meta.js` declares the `onActionClick` event.
- `ActionSteps.test.js` covers both modes; the plugin test suite passes.
- The block has no workflow-surface knowledge — it only emits the generic action object.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js` — modify — conditional event-vs-navigate on the per-action row.
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/meta.js` — modify — declare `onActionClick`.
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.test.js` — create/modify — cover both modes.

## Notes

- Per-verb link selection (`action.links.{verb}` → the singular `action.link`) is resolved **server-side** ([Part 42 D5](../../_completed/42-timeline-action-cards/design.md), shipped) — do not implement verb selection in the block. This task only adds the event-vs-navigate branch on top of the link the block already reads.
- Build the plugin per the package build step so the demo/module pick up the change; `dist/` copies are generated — don't hand-edit them.
- The `EventsTimeline.onActionClick` event + the timeline action-item wiring shipped with [Part 42](../../_completed/42-timeline-action-cards/design.md); this task defines only the `ActionSteps` event.

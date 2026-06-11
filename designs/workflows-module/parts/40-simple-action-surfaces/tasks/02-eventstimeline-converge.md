# Task 2: EventsTimeline — converge `onActionClick` onto the ActionSteps contract

## Context

Part 42 shipped timeline action cards in
`plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js`.
The `EventAction` renderer (`:356–423`) currently:

- fires `onActionClick` with `{ pageId: link.pageId, urlQuery: link.urlQuery }`
  (`:403–408`) — the resolved link, **not** the action object;
- has **no navigate default** — when the event is unwired,
  `methods.triggerEvent` is a no-op and the card's "Go" link does nothing;
- only renders the click affordance when `link && link.pageId` (`:399`), so
  linkless cards already show no link.

Interestingly, `meta.js` already declares the **converged** payload
(`event: { action, event }`), so the meta and the JS currently disagree.

Part 40 (design § Event-timeline action items) converges the block onto the
identical contract task 1 gives `ActionSteps` — nothing consumes the timeline's
action click yet (workflows aren't live), so this is a clean change, not a
migration:

- `onActionClick` fires the **action object** (`{ _id, kind, status, link,
  message, … }` — supplied per card by the `GetEventsTimeline` engine method,
  which projects `_id` and `kind` expressly for this);
- when **unwired**, the block **navigates via `action.link`** by default
  (same as `ActionSteps`);
- linkless cards suppress the click in both modes.

After this task the same host kind-branch wiring (design D5) drives both
blocks identically.

## Task

1. **`EventsTimeline.js`**
   - Thread the `events` prop (the Lowdefy client passes registered events as
     `events={block.eval.events ?? {}}`) and the `components` prop (which
     carries the Lowdefy `Link` component) down to `EventAction` — `components`
     already reaches `EventTimelineItem` (`:469`).
   - In `EventAction`:
     - **Wired** (`events.onActionClick` defined): keep an `<a>`-style click
       target, but fire
       `methods.triggerEvent({ name: 'onActionClick', event: { action } })`
       with the full action object instead of `{ pageId, urlQuery }`.
     - **Unwired**: render the affordance as the Lowdefy `Link` component
       navigating to `action.link.pageId` / `action.link.urlQuery` (replacing
       the current fire-only `<a>`).
     - **Linkless** (`!action.link || !action.link.pageId`): render no click
       affordance in either mode (current behaviour at `:399` — keep it).

2. **`meta.js`** — the declared payload already says
   `event: { action, event }`. Converge it exactly onto the ActionSteps
   contract: fire and declare `{ action }` only (drop the parent-`event` key
   from the declaration so the two blocks' contracts read identically), and
   note the unwired navigate-default in the event description.

3. **`README.md`** (block README) — update the `onActionClick` section: action
   object payload, navigate-by-default when unwired, linkless suppression.

4. **`EventsTimeline.test.js`** (new — no test file exists despite the design
   table saying "update") — using the jsdom/JSX test setup from task 1:
   - wired: clicking an action card fires `onActionClick` with the action
     object;
   - unwired: the card renders the `Link` component with
     `action.link.pageId`/`urlQuery`;
   - linkless: no click affordance rendered.
   Scope the tests to the action-card behaviour (render a minimal event with
   `actions` + `actionStatusConfig`); the rest of the timeline rendering is
   out of scope.

## Acceptance Criteria

- `onActionClick` fires `{ action }` where `action` is the card's action
  object — `_event.action.kind` / `_event.action._id` /
  `_event.action.link` are readable by host wiring.
- With the event unwired, clicking the card's affordance navigates via the
  Lowdefy `Link` to the server-resolved `action.link`.
- Linkless cards render no affordance and fire nothing.
- `meta.js` and the block README describe the converged contract.
- `pnpm test` passes from the repo root; `pnpm build` in the plugin package
  succeeds.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js` — modify — converge `EventAction` (fire action object; navigate default; linkless suppression)
- `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/meta.js` — modify — payload `{ action }`, description notes the navigate default
- `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/README.md` — modify — document the converged contract
- `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.test.js` — create — wired / unwired / linkless coverage

## Notes

- **Coordinate with Part 46 task 11** (`part-46-tasks-11-12` worktree): that
  task migrates the module-side events-timeline *surface* onto
  `GetEventsTimeline` and may touch this block's consumers. Land/rebase in
  order; this task's block-side change is independent of the data migration.
- Depends on task 1 only for the shared jest JSX/jsdom enablement.
- The "Go" label / styling of the affordance can stay; only the payload and
  the unwired behaviour change.

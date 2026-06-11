# Task 1: ActionSteps — generic `onActionClick(action)` event

## Context

`plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js` renders
workflow action groups as antd `Steps`. Each action row is currently a hard
`Link` to the server-resolved `action.link` (`ActionSteps.js:162–183`), with
linkless rows rendered disabled (`linkDisabled` at `:145–146`, `disabled` prop
at `:170`). The block fires no events today and `meta.js` declares none.

Part 40 D5 adds a **generic** `onActionClick(action)` event so a host page can
open a check action in an in-context modal instead of navigating:

- **When the host wires `onActionClick`**, the block fires the event with the
  clicked **action object** (`{ _id, kind, status, link, message, … }` — the
  raw item from `properties.items[].actions[]`, whose shape is produced by the
  `GetEntityWorkflows` engine method) **instead of** navigating.
- **When not wired**, behaviour is unchanged: the row is a `Link` to
  `action.link.pageId` / `action.link.urlQuery`. This default keeps
  notifications, overviews, and deep-links working with zero host changes.
- **Linkless rows stay inert in both modes** — the existing disabled-row
  behaviour is kept, and the event never fires for them, so a host's `Link`
  fallback branch never sees a null link.

Wiring detection: the Lowdefy client passes registered events to block
components as the `events` prop (`events={block.eval.events ?? {}}` — see
`lowdefy/packages/client/src/block/List.js:81`). A host-wired event appears as
a key on that object, so `events.onActionClick !== undefined` distinguishes
wired from unwired. Events fire via the existing
`methods.triggerEvent({ name, event })`.

The block remains workflow-agnostic: it fires the action object it was given
and knows nothing about modals or check actions.

## Task

1. **`ActionSteps.js`**
   - Add `events = {}` to the destructured block props (alongside `methods`,
     `properties`, …).
   - In the per-action row rendering (`:144–188`): when
     `events.onActionClick` is defined **and** the row is not link-disabled,
     render the action text as a click target (e.g. an `<a>`/clickable span
     with the same classNames/styles as the current `Link`) whose `onClick`
     calls
     `methods.triggerEvent({ name: 'onActionClick', event: { action } })`
     (prevent default; do not navigate). When `events.onActionClick` is
     undefined, keep the current `Link` rendering exactly as-is. When the row
     is link-disabled (`action?.link?.disabled || !action?.link`), keep the
     current disabled rendering and never fire the event.
   - Group-title links (`:114–129`) are untouched — the event is per-action,
     not per-group.

2. **`meta.js`** — declare the event:

   ```js
   events: {
     onActionClick: {
       description:
         'Fires with the clicked action object instead of navigating. When not wired, the block navigates via the server-resolved action.link.',
       event: {
         action: 'The action object that was clicked ({ _id, kind, status, link, message, … }).',
       },
     },
   },
   ```

3. **`README.md`** (block README) — document the event, the fire-instead-of-
   navigate semantics, the unwired navigate default, and linkless-row
   suppression.

4. **`ActionSteps.test.js`** (new) — React component tests covering:
   - wired: clicking an action row calls `methods.triggerEvent` with
     `{ name: 'onActionClick', event: { action: <the clicked action object> } }`
     and renders no navigating `Link` for that row;
   - unwired: the row renders the `Link` component with the action's
     `pageId`/`urlQuery` (navigate default preserved);
   - linkless row: rendered disabled, click fires nothing in both modes.

5. **Test infrastructure (one-time, shared with task 2).** The repo's jest
   config (`jest.config.js`, root) uses `testEnvironment: "node"` and an swc
   transform without JSX, and no block-component test exists yet anywhere
   under `src/blocks/`. Enable component testing minimally:
   - add `jsx: true` to the swc parser config (and a
     `transform: { react: { runtime: 'automatic' } }` jsc transform) in
     `jest.config.js` — harmless for the existing non-JSX connection tests;
   - use a `/** @jest-environment jsdom */` docblock in the block test files
     (keeps the global default `node` for connection tests); add
     `jest-environment-jsdom` and `@testing-library/react` (+ `react` /
     `react-dom` if not already resolvable in the workspace) as root
     devDependencies.
   - Mock the heavy collaborators where needed: the `Link` and `Icon`
     components arrive via the `components` prop (inject simple stubs), and
     `withTheme` / `withBlockDefaults` wrappers can be exercised as-is or the
     unwrapped component exported for tests — prefer testing through the
     default export with stub props if it renders under jsdom.

## Acceptance Criteria

- With `events.onActionClick` present, clicking a linked action row triggers
  the event with the full action object and does not render a `Link` for that
  row; with it absent, the row renders the `Link` exactly as before (verified
  by the new tests).
- Linkless rows never fire the event and keep the disabled styling.
- `meta.js` declares `onActionClick`; the block README documents it.
- `pnpm test` passes from the repo root — new block tests run green alongside
  the existing connection tests (which must be unaffected by the jest config
  change).
- `pnpm build` in `plugins/modules-mongodb-plugins` succeeds.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js` — modify — `events` prop, conditional fire-vs-navigate per action row, linkless suppression
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/meta.js` — modify — declare `onActionClick`
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md` — modify — document the event + default
- `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.test.js` — create — wired / unwired / linkless coverage
- `jest.config.js` — modify — enable JSX in the swc transform (one-time block-test enablement)
- `package.json` (root) — modify — add jsdom/testing-library devDependencies if missing

## Notes

- The fired `action` object must be passed through verbatim — hosts read
  `_event.action.kind`, `_event.action._id`, and `_event.action.link` in the
  kind-branch wiring (design D5), and `GetEntityWorkflows` already projects
  `{ _id, kind, type, status, allowed, message, link }` per action card.
- Keep the visual rendering of the wired click target identical to the link
  styling (same `classNames.link` / secondary-text treatment) — only the
  click behaviour differs.

# Task 6: Reconcile `EventsTimeline.js` `EventAction` colour keys to the enum

## Context

The `EventsTimeline` block already ships the `EventAction` component that draws
the live action card (an Antd `Card` styled per status, a status badge with the
action `message`, and a `link` → action page). But it reads a **parallel,
timeline-only** colour schema (`card_color` / `border_color` / `color`) that does
**not** match the shared `action_statuses.yaml` enum, which carries
`color` (light fill) / `borderColor` / `titleColor` / `title` / `priority`.

Part 42 D3 makes the shared enum the single source of status display across the
workflow pages and the timeline. Rather than maintain a second colour schema,
**reconcile the block to the enum**. Mapping:

| `EventAction` usage     | Reads today    | Reads after         |
| ----------------------- | -------------- | ------------------- |
| Card background         | `card_color`   | `color`             |
| Card border             | `border_color` | `borderColor`       |
| Status badge dot / text | `color`        | `titleColor`        |
| Badge label fallback    | `title`        | `title` (unchanged) |

The component is at
`plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js`,
function `EventAction` (≈ lines 356–423). Relevant lines today:

- `borderColor: statusConf.border_color || "var(--ant-color-border-secondary)"`
- `backgroundColor: statusConf.card_color || "var(--ant-color-fill-quaternary)"`
- `<Badge color={statusConf.color || "#999"} ... />`
- `action.message || statusConf.title || action.status` (fallback — unchanged)

`ActionSteps` is **out of scope** (it uses its own hardcoded theme-token map).

## Task

In `EventAction`:

1. Card border: `statusConf.border_color` → `statusConf.borderColor`.
2. Card background: `statusConf.card_color` → `statusConf.color`.
3. Badge dot/text colour: `statusConf.color` → `statusConf.titleColor`.
4. Leave the badge label fallback `statusConf.title` and all default fallback
   literals (`var(--ant-color-...)`, `"#999"`) unchanged.

Do not change the `link`/`onActionClick` rendering, the `blocked`-hidden guard, or
the `meta.js` event definitions.

## Acceptance Criteria

- `EventAction` reads `borderColor`, `color` (as background fill), and
  `titleColor` from `statusConf` — matching the `action_statuses.yaml` enum keys.
- No remaining references to `card_color` or `border_color` in `EventsTimeline.js`.
- The plugin builds/lints cleanly (run the plugin package's build/test, e.g.
  `pnpm --filter @lowdefy/modules-mongodb-plugins build` or the repo equivalent).
- Existing `EventsTimeline` tests (if any) still pass.

## Files

- `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js` — modify — `EventAction` colour keys.

## Notes

- This is a behaviour-visible change only once an `actionStatusConfig` carrying
  the enum shape is passed (Task 7). On its own it's safe: the fallbacks cover a
  missing/empty config, and no current caller passes the old `card_color`/
  `border_color` keys.

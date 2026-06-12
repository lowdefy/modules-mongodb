# ActionSteps

A vertical (or horizontal) Antd `Steps` view of grouped actions. Each `item` is an *action group* rendered as one step; its child `actions` render in the step description as badged, optionally linked rows. The group's rolled-up status drives the step icon and styling.

Useful for showing a checklist-style progression where each stage has multiple sub-tasks — e.g. a workflow gate's required actions, or an onboarding stage's outstanding items.

## Usage

```yaml
- id: gate_steps
  type: ActionSteps
  properties:
    title: Gate progression
    direction: vertical
    actionGroupConfig:
      kickoff:
        order: 1
        title: Kickoff
        icon: AiOutlineFlag
      review:
        order: 2
        title: Review
        icon: AiOutlineAudit
        link:
          pageId: review-view
          urlQuery:
            _id: "{{ lot._id }}"
      sign-off:
        order: 3
        title: Sign-off
        icon: AiOutlineCheckSquare
    items:
      - action_group: kickoff
        actions:
          - status: done
            message: Charter signed
          - status: done
            message: Team assigned
      - action_group: review
        actions:
          - status: in-progress
            message: Technical review
            link:
              pageId: review-view
              urlQuery:
                _id: "{{ lot._id }}"
          - status: action-required
            message: Risk register
      - action_group: sign-off
        actions:
          - status: blocked
            message: Awaiting review completion
```

## Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `title` | string | — | Heading rendered above the steps. |
| `direction` | `"vertical"` \| `"horizontal"` | `"vertical"` | Antd `Steps` direction. |
| `progressDot` | boolean | `false` | Render progress dots instead of icons. |
| `items` | array | `[]` | Action groups. Each item: `{ action_group, actions[] }`. |
| `actionGroupConfig` | object | — | Map of `action_group` key → `{ order, title, icon, link? }`. Required — items without a matching entry won't render correctly. `link` (optional) wraps the group title in a clickable Link. |
| `theme` | object | — | Antd `Steps` design-token overrides — forwarded to `ConfigProvider` as `theme.components.Steps` for this block only. See the [Steps design tokens](https://ant.design/components/steps#design-token). |

### Item shape

```js
{
  action_group: "review",     // → actionGroupConfig key, drives title/icon/order
  actions: [
    {
      status: "in-progress",  // see status table below
      message: "Technical review",  // HTML allowed (rendered via renderHtml)
      link: {                  // optional
        pageId: "review-view",
        urlQuery: { _id: "..." },
        input: { ... },
        newTab: false,
        disabled: false,
      },
    },
  ],
}
```

### Action statuses

Badge colors resolve through antd v6 design tokens, so they re-skin with the app theme.

| Status | Step status | Badge color | Notes |
|---|---|---|---|
| `blocked` | `wait` | `--ant-color-text-disabled` | Greyed, secondary text. |
| `action-required` | `process` | `--ant-color-primary` | |
| `in-progress` | `process` | `--ant-color-info` | Badge animates (`processing`). |
| `in-review` | `wait` | `--ant-purple-6` (fallback `#722ed1`) | No standard token; uses the antd purple scale. |
| `changes-required` | `error` | `--ant-color-warning` | |
| `done` | `finish` | `--ant-color-success` | Step icon overridden to `AiOutlineCheckCircle`. |
| `error` | `error` | `--ant-color-error` | |
| `not-required` | `wait` | `--ant-color-text-secondary` | Message and group title rendered with `<strike>`. |

### Group status rollup

The group's effective status is derived from its actions in this order:

1. Any `error` → `error`.
2. Any `in-progress`, or any `done` mixed with non-`done`/non-`not-required` → `in-progress`.
3. Any `action-required` → `action-required`.
4. All `not-required` → `not-required`.
5. All `blocked` / `not-required` → `blocked`.
6. All `done` / `not-required` → `done`.

## Events

| Event | Fires with | When |
|---|---|---|
| `onActionClick` | `{ action }` — the full action object that was clicked (`{ _id, kind, status, link, message, … }`) | A linked action row is clicked **and** the event is wired. |

### `onActionClick` — fire instead of navigate

`onActionClick` lets a host page handle a clicked action in-context (e.g. open a check action in a modal) rather than navigating to the action's link.

- **When wired** (the event appears on the block's `events`), clicking a linked action row fires `onActionClick` with the clicked `action` object passed through verbatim and **does not navigate**. Hosts branch on `_event.action.kind` / `_event.action._id` / `_event.action.link`. The clicked row renders as an `<a>` with the same `classNames.link` / secondary-text treatment as the default `Link`, so the visual appearance is identical — only the click behaviour differs.
- **When not wired** (no `onActionClick` registered — the default), behaviour is unchanged: each action row is a `Link` to its server-resolved `action.link` (`pageId` / `urlQuery`). This keeps notifications, overviews, and deep-links working with zero host changes.
- **Linkless rows stay inert in both modes.** A row whose `action.link` is missing or has `disabled: true` keeps the disabled rendering and **never fires the event** — so a host's `Link`-fallback wiring never sees a null link.

Group-title links (`actionGroupConfig[group].link`) are unaffected; `onActionClick` is per-action, not per-group.

```yaml
- id: gate_steps
  type: ActionSteps
  events:
    onActionClick:
      - id: open_action
        type: SetState
        params:
          active_action:
            _event: action
  properties:
    # …
```

## CSS Keys

| Key | Element |
|---|---|
| `element` | The outer container. |
| `title` | The `Typography.Title` heading above the steps. |
| `steps` | The Antd `Steps` component. |
| `badge` | Each action's status `Badge`. |
| `link` | Each action's `Link` wrapper. |
| `groupLink` | Each group title's `Link` wrapper (when `actionGroupConfig[group].link` is set). |

## Built-in classes

The block ships these global CSS classes via `style.less` and applies them automatically:

| Class | Where | What it does |
|---|---|---|
| `.action-steps-badge` | Every action `Badge` | Row layout (`margin-left: 5px`, `width: 100%`, `padding-right: 5px`). |
| `.action-steps-link-secondary` | Action `Link` when status is `blocked` or `not-required` | Secondary text color via `var(--ant-color-text-tertiary)`. |
| `.action-steps-link-disabled` | Action `Link` when `action.link.disabled` or `action.link` is missing | `cursor: default`. |

Override by raising specificity in your app's CSS or by passing `classNames.badge` / `classNames.link` to ensure your class wins.

The block also overrides `.ant-steps-item-title { width: 100%; }` so each step's title fills the row.

## Notes

- **HTML in `message` and `actionGroupConfig.title` is rendered through `renderHtml`** from `@lowdefy/block-utils`. Sanitize upstream if the source isn't trusted.
- **Ordering** comes from `actionGroupConfig[group].order`. Items without an `order` will sort as `undefined` — set `order` on every configured group.
- **`done` step icon** is forced to `AiOutlineCheckCircle` regardless of the `actionGroupConfig` icon.

# EventsTimeline

A vertical timeline of audit events. Each entry shows an avatar, the event title (Nunjucks-rendered upstream by the `events` module), a relative timestamp, an optional description, optional info link with a modal, optional inline action cards with status badges, and optional attached files.

Used by the [`events` module](../../../../../modules/events/README.md) to back its `events-timeline` component. The block doesn't fetch — it renders an array of pre-shaped event documents.

## Usage

```yaml
- id: lot_events
  type: EventsTimeline
  properties:
    data:
      _request: get_lot_events
    eventTypeConfig:
      create-contact:
        color: "#1890ff"
        title: Contact Created
        icon: AiOutlineUserAdd
        card_color: "#fafcff"
        border_color: "#d6e8ff"
      update-contact:
        color: "#52c41a"
        title: Contact Updated
        icon: AiOutlineEdit
    actionStatusConfig:
      pending:
        color: "#faad14"
        title: Pending
      complete:
        color: "#52c41a"
        title: Complete
      blocked:
        color: "#ff4d4f"
    s3GetPolicyRequestId: download_policy
    reverse: true
    mode: left
  events:
    onActionClick:
      - id: nav
        type: Link
        params:
          pageId:
            _event: action.link.pageId
          urlQuery:
            _event: action.link.urlQuery
```

`onActionClick` is optional. When it's **not** wired, the block navigates to the action's server-resolved `action.link` by itself via the Lowdefy `Link` component — so the "Go" affordance works with zero host wiring. Wire `onActionClick` only when the host needs to intercept the click (e.g. open an in-context modal) instead of navigating.

The matching request resolves each event against its per-app display template — so `event.title`, `event.description`, and `event.info` arrive as already-rendered HTML strings (sanitized client-side). See [Event display](../../../../../docs/idioms.md#event-display) for the upstream template pipeline.

## Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `data` | array | `[]` | Event documents to render. See [Event document shape](#event-document-shape). |
| `eventTypeConfig` | object | `{}` | Map of `event.type` → display config: `color`, `icon`, `card_color`, `border_color`, `title`. The icon (when present) replaces the timeline dot for that event. |
| `actionStatusConfig` | object | — | Map of `action.status` → display config: `color`, `title`, `card_color`, `border_color`. Required for inline actions to render. Actions with `status: "blocked"` are hidden. |
| `s3GetPolicyRequestId` | string | — | Request id resolving to an S3 download-policy URL. Required for `event.files` to render — the block dynamically imports `S3Download` from `@lowdefy/plugin-aws`. |
| `reverse` | boolean | `false` | Reverse the order of items (newest first when the source array is oldest-first). |
| `mode` | `"left"` \| `"alternate"` \| `"right"` | `"left"` | Antd `Timeline` mode. |

### Event document shape

```js
{
  _id: "...",
  type: "create-contact",                    // → eventTypeConfig key
  title: "Created <b>Alice</b>",             // sanitized HTML, rendered as the row title
  description: "...HTML...",                 // optional; when present, the row renders as a card
  info: "...HTML...",                        // optional; renders as a "Click here for more info" link → modal
  created: {
    timestamp: 1700000000000,
    user: { name: "Bob", id: "...", picture: "https://..." }
  },
  actions: [                                  // optional
    {
      id: "...",
      status: "pending",                     // → actionStatusConfig key
      message: "Awaiting approval",          // optional, falls back to actionStatusConfig[status].title
      link: { pageId: "...", urlQuery: {...}, title: "Open" }   // optional
    }
  ],
  files: [                                    // optional; needs s3GetPolicyRequestId
    { name, key, bucket, size, type, thumbnail }
  ]
}
```

When `description` is empty, the row renders as a single line (title + time-ago). When `description` is present, the row renders as a `Card` with the avatar, title, time-ago, and description. The card colours and borders come from `eventTypeConfig[event.type]`.

The avatar uses `created.user.picture` if available, otherwise falls back to initials on a deterministic colour from the user name.

## Events

| Event | When | Payload |
|---|---|---|
| `onActionClick` | A linked action card's affordance is clicked **and** the event is wired. | `{ action }` — the full action object (`{ _id, kind, status, link, message, … }`). |

When `onActionClick` is **wired**, clicking the affordance fires the action object instead of navigating, letting the host route the click (e.g. open a modal). When it's **unwired**, the affordance renders as a Lowdefy `Link` that navigates to the action's server-resolved `action.link` (`pageId` / `urlQuery`). **Linkless** actions (no `action.link.pageId`) render no affordance and fire nothing in either mode.

## CSS Keys

| Key | Element |
|---|---|
| `element` | The outer container. |
| `timeline` | The Antd `Timeline` component. |

The block also imports `style.less` from this directory for its base styling.

## Notes

- **HTML in `title` / `description` / `info` is sanitized.** All three pass through DOMPurify before insertion. Upstream code is responsible for producing the HTML — typically via the per-app `event_display` Nunjucks templates rendered server-side.
- **Time-ago labels.** Computed client-side with `dayjs.duration`. Hovering the label shows the absolute timestamp (and the user's name when present).
- **Files require `@lowdefy/plugin-aws`.** The S3Download component is imported lazily; if `@lowdefy/plugin-aws` isn't installed, files are silently omitted rather than crashing the block.
- **Actions with `status: "blocked"`** are filtered out and never rendered.

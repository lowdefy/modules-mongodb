---
title: SupportContext
module: plugins
type: reference
concepts: [support-context, error-recorder]
---

# SupportContext

Gives a support form the browser's details and the tab's recent errors at the moment a ticket is sent. Two parts:

- **The error recorder.** The plugin installs it on `window` (as `window.__lowdefySupportRecorder`) when its blocks load, before the first page's `onInit` runs, once per browser tab. It keeps the tab's last 20 errors in memory. **Nothing leaves the browser** until a page reads a snapshot and sends it.
- **The `SupportContext` block.** It renders nothing. Its `snapshot` method sets the block's value to a snapshot of the browser and the recorded errors, and fires `onSnapshot` with it.

The `support` module's report form calls `snapshot` before it sends a ticket, and adds the app, environment, version, page, organisation and its own extra fields to build the ticket's context.

## Usage

```yaml
- id: support_context
  type: SupportContext
  events:
    onSnapshot:
      - id: send_report
        type: CallAPI
        params:
          endpointId: report-problem
          payload:
            context:
              _event: true
```

```yaml
- id: take_snapshot
  type: CallMethod
  params:
    blockId: support_context
    method: snapshot
```

The block is an input: after `snapshot`, `_state: support_context` holds the snapshot too.

## What a snapshot carries

This is everything the block reads. An app can show it to users so they know what a ticket sends.

| Field        | What it is                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `url`        | The page URL, with its query string.                                    |
| `user_agent` | The browser's user agent string: browser, version and operating system. |
| `viewport`   | `{ width, height }` of the browser window's viewport, in CSS pixels.    |
| `screen`     | `{ width, height, pixel_ratio }` of the screen.                         |
| `locale`     | The browser's language, such as `en-ZA`.                                |
| `timezone`   | The browser's IANA time zone, such as `Africa/Johannesburg`.            |
| `errors`     | The tab's last 20 errors, oldest first, as below.                       |

Each error is `{ at, kind, message, stack? }`:

| Field     | What it is                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `at`      | When it happened, as an ISO time.                                                                                          |
| `kind`    | `console` for a `console.error` call, `error` for an uncaught error, `rejection` for an unhandled promise rejection.       |
| `message` | The call's arguments as one line: strings as they are, an Error as its message, objects as JSON. At most 2,000 characters. |
| `stack`   | The stack of the first Error among the arguments, when there is one. At most 2,000 characters.                             |

Lowdefy logs every failed request through `console.error`, with its request ID on a line of its own, so a failed request shows as two `console` entries: the error, then `Request ID: …`. The request ID is what finds the server's log of it.

## Recorder behaviour

- `console.error` still logs as before; the recorder only keeps a copy.
- The 21st entry drops the oldest.
- The recorder lives as long as the tab: it carries errors across page changes in the app, and starts empty on a full reload.
- It records whatever the app logs as an error, so an app that logs personal data with `console.error` sends it with a ticket.

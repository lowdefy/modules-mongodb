---
title: ChatThread
module: plugins
type: reference
---

# ChatThread

A two-party conversation thread, support-ticket style. Messages from the other side sit on the left with an avatar; own messages sit on the right in a primary-tinted bubble. The block sorts and dedupes what it is given, adds day pills, groups consecutive messages from one author, turns URLs into links and shows attachments.

Three behaviours worth knowing:

- **It is its own scroll container** (`maxHeight`). It sticks to the bottom while the reader is there, so a new message scrolls into view; once the reader scrolls up to read history, new messages no longer move the view until they scroll back down.
- **Text renders as text nodes**, never HTML, so a message body needs no escaping. Only `http://` and `https://` URLs become links, opening in a new tab.
- **Colours come from antd CSS variables**, so light and dark themes both hold. It uses no icons; the attachment paperclip is inline SVG.

## Usage

```yaml
- id: ticket_thread
  type: ChatThread
  properties:
    ownAuthorType: reporter
    maxHeight: 420
    emptyText: No messages yet
    messages:
      _state: ticket.messages
```

## Properties

| Property        | Type             | Default  | Description                                                                             |
| --------------- | ---------------- | -------- | --------------------------------------------------------------------------------------- |
| `messages`      | array            | `[]`     | The messages, in the shape below. Sorted and deduped by the block.                      |
| `ownAuthorType` | string           | `"user"` | The `author_type` shown as the reader's own (right-aligned, primary-tinted).            |
| `maxHeight`     | string \| number | `"55vh"` | Maximum height of the scroll container. Numbers are px.                                 |
| `emptyText`     | string           | —        | Centred text shown when there are no messages. With none set, an empty thread is blank. |

## Message shape

```yaml
_id: msg-1 # required; messages without one are dropped, a repeated _id keeps the first
author_type: team # compared with ownAuthorType
author:
  name: Grace Hopper # shown above the bubble; falls back to "You" or "Support team"
  avatar_url: https://… # optional; an image avatar
  avatar_color: blue # optional; an antd preset name (blue, green, red, orange, gold, purple, magenta, cyan, volcano, geekblue, lime) or any CSS colour
body: "Text, with links like https://example.com"
attachments:
  - name: screenshot.png
    mime: image/png # image/* with a url renders as an image
    url: https://… # null renders a dimmed chip that does not link
    key: support/u1/abc/screenshot.png # optional; used as the React key
seq: 2026-10-07T09:12:00.000Z # the message time; anything new Date() reads
```

- **Order:** by `seq`, oldest first.
- **Day pills:** "Today", "Yesterday", or the date (with the year when it is not this year), above the first message of each day.
- **Grouping:** a message from the same `author_type` and `author.name` within five minutes of the one before, on the same day, drops its name, time and avatar. Every message shows its time (`HH:mm`) on hover.
- **Avatars:** `avatar_url` when set, else up to two initials from `author.name` on a soft fill.
- **Attachments:** below the text. An `image/*` attachment with a `url` renders as an image (at most 280 × 200 px) linking to the file; any other attachment renders as a chip with its name.

## CSS keys

| Key       | Styles                           |
| --------- | -------------------------------- |
| `element` | The scrollable thread container. |
| `bubble`  | Each message bubble.             |
| `day`     | The centred day-separator pill.  |

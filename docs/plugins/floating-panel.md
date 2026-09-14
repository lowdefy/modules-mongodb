---
title: FloatingPanel
module: plugins
type: reference
---

# FloatingPanel

An Intercom-style corner launcher and the floating panel it opens. A container block: it owns a fixed-position launcher button and the panel that springs from it, and renders whatever blocks the page nests inside its slots.

Unlike a `Drawer` it never masks or reflows the page — the wrapper is `pointer-events: none`, so everything behind stays clickable while the panel is open. Backs the `ai-assistant` module's docked panel, but carries no chat assumptions of its own: any side-channel UI (help, notes, a mini-form) can live in it.

Three behaviours worth knowing:

- **Children are lazy-mounted, then kept mounted.** Nothing renders until the first open, and closing only hides the panel with CSS — scroll position, a half-typed input, and an in-flight stream all survive being minimised.
- **The body publishes its own pixel height** as the CSS variable `--fp-body-height`. Children that must fill the panel exactly (a chat, a virtualised list) say `height: var(--fp-body-height, 520px)` — a percentage would break through Lowdefy's `lf-col`/`lf-row` wrappers, a custom property inherits straight through.
- **No focus trap, deliberately.** Trapping focus would undo the point of a non-blocking panel. Escape closes and focus returns to the launcher.

## Usage

```yaml
- id: help_panel
  type: FloatingPanel
  properties:
    title: Help
    subtitle: Docs assistant
    avatar:
      icon: AiOutlineRobot
    launcher:
      icon: AiOutlineQuestionCircle
      ariaLabel: Open help
    width: 420
    height: 660
    placement: bottom-right
  slots:
    toolbar:
      blocks:
        - id: help_topic
          type: Title
          properties:
            level: 5
            content: Getting started
    content:
      blocks:
        - id: help_body
          type: Markdown
          properties:
            content: ...
```

## Slots

| Slot      | Purpose                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `content` | The panel body. Scrolls; everything else in the panel is fixed chrome.                                                                    |
| `header`  | Optional extra content in the header row, between the title and the window controls.                                                      |
| `toolbar` | Optional fixed band between the header and the body — for the subject of what is in the body, anything that must not scroll away with it. |
| `footer`  | Optional pinned bar along the bottom edge of the panel.                                                                                   |

## Properties

| Property        | Type                                 | Default          | Description                                                                                          |
| --------------- | ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `title`         | string                               | —                | Panel header title. Set in the app display font when `--fp-font-display` is defined.                  |
| `subtitle`      | string                               | —                | Small line under the title — an identity or status line, not a sentence.                              |
| `avatar`        | object                               | —                | Round mark left of the title: `{ icon, color }`. Icon defaults to a built-in spark glyph.             |
| `launcher`      | object \| `false`                    | `true`           | The launcher button — `{ icon, label, ariaLabel, badge }` — or `false` to drive the panel by methods. |
| `width`         | number \| string                     | `400`            | Panel width. Numbers are px.                                                                          |
| `height`        | number \| string                     | `620`            | Panel height. Always clamped to the viewport, so this is a maximum in practice.                       |
| `expandedWidth` | number \| string                     | `720`            | Panel width while expanded.                                                                           |
| `expandable`    | boolean                              | `true`           | Show the expand/collapse control in the header.                                                       |
| `closable`      | boolean                              | `true`           | Show the close control in the header.                                                                 |
| `keyboard`      | boolean                              | `true`           | Escape closes the panel.                                                                              |
| `placement`     | `"bottom-right"` \| `"bottom-left"`  | `"bottom-right"` | Which corner the launcher and panel anchor to.                                                        |
| `offset`        | object                               | `{24, 24}`       | Distance from the anchored corner: `{ bottom, side }`, in px.                                         |
| `zIndex`        | number                               | `1100`           | Stacking order. The stylesheet default clears the antd popup layer (~1050–1070).                      |
| `defaultOpen`   | boolean                              | `false`          | Render with the panel already open on first mount.                                                    |

## Events

| Event      | Fires                                                       |
| ---------- | ------------------------------------------------------------ |
| `onOpen`   | When the panel opens.                                        |
| `onClose`  | When the panel closes.                                       |
| `onToggle` | On every open/close, before the two above. `_event = { open }`. |
| `onExpand` | When the expand/collapse control is used. `_event = { expanded }`. |

## Methods

| Method        | Does                                                        |
| ------------- | ------------------------------------------------------------ |
| `setOpen`     | Open or close the panel. `args: { open: boolean }`.          |
| `toggleOpen`  | Toggle the panel — same thing the launcher does.             |
| `setExpanded` | Widen or restore the panel. `args: { expanded: boolean }`.   |

## Styling slot content

The block ships two opt-in classes for blocks placed in its `header` and `toolbar` slots, because a Lowdefy module cannot ship a stylesheet:

- `fp-icon-btn` — on the **wrapper** of a button (a Tooltip, say), renders it as a 28px icon-only chrome button matching the built-in expand/close controls. The label is visually hidden rather than removed, so the accessible name survives.
- `fp-title-row` — on a row holding an editable Typography title; mutes antd's edit pencil from its default link blue.

A chat block filling the body can take `fp-chat` — it bounds the scrolling message area, and inside the panel it also drops the avatar gutters and adds speaker chips.

Portaled popups (Tooltip, Select, Popover) opened from inside the panel need a `zIndex` above the panel's (1100) or they render behind it.

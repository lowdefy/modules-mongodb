---
title: NotificationSound
module: plugins
type: reference
concepts: [notifications, sound, localStorage]
---

# NotificationSound

A short chirp for live notifications, and the viewer's switch for it. The sound is **off until the viewer turns it on**. The setting is kept in the browser's `localStorage`, per app, so it holds per device; every open tab of the app follows a change at once. The chirp is two tones synthesised with the Web Audio API, so there is no audio file to ship.

The `notifications` module mounts one on every page (its `notification-sound` export, id `notifications_sound`) and draws the switch in the inbox header. Most apps never place it themselves.

Behaviours worth knowing:

- **Without `toggle` it draws nothing.** It only plays. With `toggle: true` it draws a small "Sound" switch with a volume icon; turning it on plays a preview chirp.
- **`play` reads the stored setting when it is called**, not the block's value, so an instance on any page follows the latest switch.
- **Once per batch, once across tabs.** `play(ids)` claims each notification id in `localStorage` under a Web Lock, so the same notifications arriving in several tabs chirp once, and a reload never chirps again for them. A hidden tab waits 1.5 seconds before it claims, so the tab the viewer is looking at wins. Claims older than a week are dropped.
- **No sound before the viewer interacts.** Browsers keep audio locked until the first click or key press on the page; a chirp asked for before then plays nothing.

## Usage

```yaml
# The switch
- id: notifications_sound_toggle
  type: NotificationSound
  properties:
    app:
      _build.app: slug
    toggle: true

# Play for a batch of new notifications, e.g. in a websocket onMessage
- id: chirp
  type: CallMethod
  params:
    blockId: notifications_sound
    method: play
    args:
      - - n-1
        - n-2
```

## Properties

| Property | Type    | Default | Description                                                                                                                       |
| -------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app`    | string  | —       | Names the app the setting belongs to, so apps sharing an origin keep their own. Use the same value for every instance in one app. |
| `toggle` | boolean | `false` | Draw the Sound switch. Without it the block draws nothing and only plays.                                                         |
| `label`  | string  | `Sound` | The switch's label.                                                                                                               |

The block's value is `true` when the viewer has the sound on.

## Events

| Event      | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `onChange` | The viewer turned the sound on or off, in this tab or another one. |

## Methods

| Method      | Description                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `play(ids)` | Chirp once for a batch of notification ids, when the sound is on and no other tab has chirped for them. Resolves `true` when it played. |

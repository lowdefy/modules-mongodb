---
title: NotificationSound
module: plugins
type: reference
concepts: [notifications, sound, localStorage]
---

# NotificationSound

A sound for live notifications, and the viewer's controls for it. The sound is **off until the viewer turns it on**. The setting is kept in the browser's `localStorage`, per app, so it holds per device; every open tab of the app follows a change at once. The default sound is a chirp of two tones synthesised with the Web Audio API, so there is no audio file to ship. An app can offer more sounds with `sounds`, and draw a dropdown for the viewer to pick one with `picker`.

The `notifications` module mounts one on every page (its `notification-sound` export, id `notifications_sound`) and draws the switch in the inbox header, both with the module's `sounds` var. Most apps place one themselves only to draw the picker.

Behaviours worth knowing:

- **Without `toggle` or `picker` it draws nothing.** It only plays. With `toggle: true` it draws a small "Sound" switch with a volume icon; turning it on plays a preview of the picked sound.
- **The first sound is the default.** A sound without `src` is the chirp. With no `sounds` the block plays the chirp, as it always has.
- **`picker: true` draws a dropdown of the sounds**, each with a button to hear it. Picking a sound stores it, turns the sound on and plays it. While the sound is off the dropdown reads `offLabel` ("Off"); the switch turns it off. The pick is kept in `localStorage` beside the setting, and other tabs follow it.
- **A pick no longer offered falls back to the first sound**, so removing a sound from the list is safe.
- **Pass the same `sounds` to every instance in one app.** Each instance plays from its own list.
- **`play` reads the stored setting and pick when it is called**, not the block's value, so an instance on any page follows the latest change.
- **Once per batch, once across tabs.** `play(ids)` claims each notification id in `localStorage` under a Web Lock, so the same notifications arriving in several tabs chirp once, and a reload never chirps again for them. A hidden tab waits 1.5 seconds before it claims, so the tab the viewer is looking at wins. Claims older than a week are dropped.
- **No sound before the viewer interacts.** Browsers keep audio locked until the first click or key press on the page; a sound asked for before then plays nothing. Sound files are decoded into the same Web Audio context as the chirp, so that first gesture unlocks them too; an audio element would need a gesture of its own in Safari, which a notification arriving over the live feed never brings.

## Usage

```yaml
# The switch
- id: notifications_sound_toggle
  type: NotificationSound
  properties:
    app:
      _build.app: slug
    toggle: true

# The picker, with the sounds the app offers
- id: notification_sound_picker
  type: NotificationSound
  properties:
    app:
      _build.app: slug
    picker: true
    sounds:
      - id: chirp
        title: Chirp
      - id: bell
        title: Bell
        description: A soft ring that fades out.
        src: /sounds/bell.mp3

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

| Property   | Type    | Default | Description                                                                                                                                      |
| ---------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app`      | string  | —       | Names the app the setting belongs to, so apps sharing an origin keep their own. Use the same value for every instance in one app.                |
| `toggle`   | boolean | `false` | Draw the Sound switch. Without it or `picker` the block draws nothing and only plays.                                                            |
| `label`    | string  | `Sound` | The switch's label, and the dropdown's accessible name.                                                                                          |
| `sounds`   | array   | `[]`    | The sounds to pick from, `[{ id, title, description?, src? }]`. The first is the default; one without `src` is the chirp. Empty plays the chirp. |
| `picker`   | boolean | `false` | Draw a dropdown of the sounds, each with a button to hear it.                                                                                    |
| `offLabel` | string  | `Off`   | What the dropdown reads while the sound is off.                                                                                                  |

The block's value is `true` when the viewer has the sound on.

## Events

| Event      | Description                                                                           |
| ---------- | ------------------------------------------------------------------------------------- |
| `onChange` | The viewer turned the sound on or off, or picked a sound, in this tab or another one. |

## Methods

| Method      | Description                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play(ids)` | Play the viewer's picked sound once for a batch of notification ids, when the sound is on and no other tab has played for them. Resolves `true` when it played. |

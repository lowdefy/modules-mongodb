---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-notifications": minor
---

**A viewer can pick their notification sound.** The `NotificationSound` block takes `sounds`, a list of `{ id, title, description?, src? }`: the first is the default, a sound without `src` is the chirp, and a pick that is no longer offered falls back to the first. Sound files play through the same Web Audio context as the chirp, so the viewer's first click or key press unlocks them for live notifications too. With `picker: true` the block draws a dropdown of the sounds, each with a button to hear it; picking one stores it in the browser beside the on/off setting, turns the sound on and plays it. While the sound is off the dropdown reads `offLabel` ("Off"), and the Sound switch turns it off.

Pass the list through the notifications module's new `sounds` var, which reaches the page-wide player and the inbox's Sound switch:

```yaml
- id: notifications
  vars:
    sounds:
      _ref: sounds.yaml # [{ id: chirp, title: Chirp }, { id: bell, title: Bell, src: /sounds/bell.mp3 }]
```

To let the viewer pick, draw the block on a page with the same list:

```yaml
- id: notification_sound_picker
  type: NotificationSound
  properties:
    app:
      _build.app: slug
    picker: true
    sounds:
      _ref: sounds.yaml
```

Without `sounds` nothing changes: the switch and the chirp, as before.

---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-plugins": minor
---

**A reply that finishes after the person leaves the page is kept.** Only the browser saved the assistant's reply, when it finished streaming, so moving to another page mid-reply lost it, even though the agent finished on the server. The new `save-thread-on-finish` endpoint stores the reply from the server. Set it as your agent's `onFinish` hook:

```yaml
agents:
  - id: support
    hooks:
      onFinish:
        - ai-assistant/save-thread-on-finish
```

Without the hook, nothing changes from before. With it, opening the panel again (or returning to a page with the embedded chat) shows the finished reply, and a thread still waiting for one says "Waiting for the assistant's reply", with **Check again**.

`save-thread` now merges the history it is sent with the stored one rather than replacing it, so a reply the hook stored survives the browser's next save. The chat sends `known_ids`, the ids of every message it has held, and a stored message is dropped only when it is one of those. An app that calls `save-thread` itself without `known_ids` gets the old behaviour: its history replaces the stored one.

The `FloatingPanel` block's `onOpen` event now carries `{ first }`, true on the first open since the block mounted, when its children mount.

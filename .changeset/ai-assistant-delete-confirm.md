---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

ai-assistant: ask before deleting a chat

Delete chat destroyed the open thread on the click. `delete-thread.yaml` went straight to the
delete endpoint, and neither the embedded toolbar's button nor the panel's carried a guard, so
one stray click took the conversation and every answer in it, and the control sits directly
beside "New chat" and "Manage chats", which is where a mis-click lands.

Both shells now open a confirm first, naming the thread. (The delete itself is soft as of the
accompanying change, so the confirm's wording stops at the chat leaving the user's list rather
than claiming the conversation is destroyed.)

Decisions:

- No var to switch it off. A confirm nobody opted into is a confirm nobody has, and the cost
  is one extra click on the rarest action in the shell. That makes this a behaviour change for
  existing consumers, hence minor rather than patch — a delete that used to happen now waits
  for an answer.
- `ConfirmModal`, not the `Modal` that ai-reporting's delete confirm uses. The panel stacks at
  1100 and the `Modal` block does not forward `zIndex`, so a `Modal` would open behind the
  panel that launched it. `ConfirmModal` does forward it; 1200 matches the panel's own
  tooltips. ai-reporting's modal sits on an ordinary page and never had to clear a panel.
- `delete-thread.yaml` is unchanged and runs from `onOk`. It already captures
  `ai_conversation_id` before replacing it, so nothing is seeded for the confirm and
  cancelling leaves no state behind.

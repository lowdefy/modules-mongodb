---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

**Take a screenshot from the assistant's chat panel.** With `screenshot: true`, the panel gets a Take screenshot button. It captures the page behind the panel with password inputs, `[data-support-mask]` elements and the `screenshot_mask_selectors` var's matches blanked, lets the user blur or crop it, and attaches it to the composer like any file, so the agent can send it with a support ticket. The chat uploads it through `sender_attachments`, so attachments must be on and the app's upload policy must accept an image. Not shown in the embedded shell.

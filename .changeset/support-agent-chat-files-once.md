---
"@lowdefy/modules-mongodb-support": patch
---

The `support` module's agent tools send each chat file once across all of the user's tickets: a second ticket filed in the same chat, or a follow-up message, leaves out the images and PDFs already sent on any of the user's tickets, so a new problem's ticket no longer repeats the first one's screenshots.

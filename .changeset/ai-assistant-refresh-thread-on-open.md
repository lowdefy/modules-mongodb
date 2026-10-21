---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

**ai-assistant:** opening the panel now shows the thread as it is stored, not the copy the page held from an earlier visit. Messages sent on another page, and a thread switched to there, show on going back without a refresh. A reply streaming on the page is left as it is. A page using `embedded` gets the same on each visit through the `enter` it already splices into `onMount`. Nothing to change in your app. One difference to know: a new chat nobody has sent in yet is not stored, so closing and reopening the panel returns to the thread last opened.

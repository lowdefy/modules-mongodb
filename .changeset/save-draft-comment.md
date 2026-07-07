---
"@lowdefy/modules-mongodb-workflows": patch
---

Edit-page Save Draft now sends the `comment` / `comment_visibility` inputs with the progress call and clears them after a successful save, matching the check page's progress reseed — so a draft comment is no longer folded into a later event on the next Save Draft.

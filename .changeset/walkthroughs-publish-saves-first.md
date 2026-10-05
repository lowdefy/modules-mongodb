---
"@lowdefy/modules-mongodb-walkthroughs": patch
---

walkthroughs: Publish in the editor now saves before it publishes

Publish moved the last save, not the screen, so an author who edited and clicked Publish without saving
published the older version, or found Publish disabled. It now saves what is on screen first. It is
enabled when there is a saved draft or an unsaved edit, and disabled in Preview.

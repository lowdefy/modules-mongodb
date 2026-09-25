---
"@lowdefy/modules-mongodb-walkthroughs": patch
---

walkthroughs: the editor now sets `walkthrough_missing`, which the player it mounts for Preview reads

An app building the editor page on Lowdefy 5 failed its build with a warning that the page referenced
`walkthrough_missing` but never set it. `load` now sets it to false when it resets the editor.

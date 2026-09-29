---
"@lowdefy/modules-mongodb-walkthroughs": patch
---

walkthroughs: publishing now requires a title

An untitled draft could be published, leaving a live walkthrough with no name to show. `publish-walkthrough`
now refuses a draft whose saved title is blank, and the editor marks Title required and disables Publish
while it is empty.

---
"@lowdefy/modules-mongodb-release-notes": minor
---

**release-notes:** What's new lists the notes announced to the signed-in person, newest first, beside the one picked (`urlQuery.note`, else the newest). Images and videos embedded in a note load from the public files bucket; one not copied yet shows a placeholder. A New mark clears once the person has opened the note, in every organisation. A switch at the foot, **Email me about new releases**, saves the person's choice; `urlQuery.section=email` scrolls to it. The menu link now reads "What's new".

The module now reads the `FILES_S3_BUCKET_PUB` secret.

Migration: set `FILES_S3_BUCKET_PUB` (the files module's public bucket) for the app.

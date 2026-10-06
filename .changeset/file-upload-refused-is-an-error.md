---
"@lowdefy/modules-mongodb-plugins": patch
---

**A refused upload is an error, not a saved file.** `FileManager` treated the end of every upload post as success, so a post S3 refused (a file over the policy's size cap, an expired policy) or a network error still fired `onSave` for a file that never arrived. Only a 2xx answer is now a stored file; any other answer, a network error or an abort shows the upload as failed and fires no `onSave`.

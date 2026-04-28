---
"@lowdefy/modules-mongodb-files": patch
---

Stamp S3 uploads with `x-amz-meta-uploaded-by-{id,name,url}` metadata. The presigned-post policy now includes server-supplied fields capturing the user id, display name, and originating page URL on every upload, with `unknown` fallbacks via `_if_none` so unauthenticated uploads still succeed. Upload conditions converted to the array-of-arrays form to whitelist the new fields with `starts-with ""`.

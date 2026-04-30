---
"@lowdefy/modules-mongodb-files": patch
---

Stamp S3 uploads with `x-amz-meta-uploaded-by-{id,name,url}` metadata so file uploads carry uploader id, display name, and originating page at the bucket level. The `files` module gains the full set of fields and switches its presigned-post conditions to the array-of-arrays form. Uses `_if_none` "unknown" fallbacks so unauthenticated uploads still succeed.

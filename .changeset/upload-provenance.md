---
"@lowdefy/modules-mongodb-files": patch
"@lowdefy/modules-mongodb-data-upload": patch
---

Stamp S3 uploads with `x-amz-meta-uploaded-by-{id,name,url}` metadata so file and data-upload uploads carry uploader id, display name, and originating page at the bucket level. The `files` module gains the full set of fields and switches its presigned-post conditions to the array-of-arrays form; the `data-upload` module already had id and name and gains the matching url field. Both use `_if_none` "unknown" fallbacks so unauthenticated uploads still succeed.

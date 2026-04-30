---
"@lowdefy/modules-mongodb-files": minor
---

Make `s3_region` a required var on the `files` module. Previously `files.s3_region` had a default of `ca-central-1` (later briefly `us-east-1`). The module now requires the consumer to set `s3_region` on the module entry — there is no default, and the build will fail if the var is missing.

**Breaking:** apps using `files` must add `s3_region` to the module's `vars` block in `lowdefy.yaml`. Example: `vars: { s3_region: us-east-1 }`.

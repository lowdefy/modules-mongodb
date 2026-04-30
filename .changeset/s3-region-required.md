---
"@lowdefy/modules-mongodb-files": minor
"@lowdefy/modules-mongodb-data-upload": minor
---

Make `s3_region` a required var on the `files` and `data-upload` modules. Previously `files.s3_region` had a default of `ca-central-1` (later briefly `us-east-1`) and `data-upload`'s region was hardcoded with no var at all. Both modules now require the consumer to set `s3_region` on the module entry — there is no default, and the build will fail if the var is missing. `data-upload`'s `sync_bucket` connection now reads `region` from `_module.var: s3_region` instead of a literal value.

**Breaking:** apps using either module must add `s3_region` to the module's `vars` block in `lowdefy.yaml`. Example: `vars: { s3_region: us-east-1 }`.

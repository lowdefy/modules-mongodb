# @lowdefy/modules-mongodb-files

## 0.5.1

## 0.5.0

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#29](https://github.com/lowdefy/modules-mongodb/pull/29) [`f9a4078`](https://github.com/lowdefy/modules-mongodb/commit/f9a40783224b093c10727f64cdb62f7cb2b39838) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Remove the `collection` var from the `companies`, `events`, and `files` modules. Each module's MongoDB collection name is now hardcoded in its connection file (`companies`, `log-events`, `files` respectively). Consumers can no longer rename the underlying collection through `vars.collection` — to point a module at a different collection, remap its connection (`companies-collection`, `events-collection`, `files-collection`) via the module entry's `connections` mapping in `lowdefy.yaml`.

  **Breaking:** apps that previously set `vars.collection` on any of these modules must remove it. If a non-default collection name was in use, switch to a `connections` remap on the module entry.

- [#29](https://github.com/lowdefy/modules-mongodb/pull/29) [`24580bc`](https://github.com/lowdefy/modules-mongodb/commit/24580bcce9491f8f3ed2ebdcd049ec6cc9b4cd76) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Make `s3_region` a required var on the `files` module. Previously `files.s3_region` had a default of `ca-central-1` (later briefly `us-east-1`). The module now requires the consumer to set `s3_region` on the module entry — there is no default, and the build will fail if the var is missing.

  **Breaking:** apps using `files` must add `s3_region` to the module's `vars` block in `lowdefy.yaml`. Example: `vars: { s3_region: us-east-1 }`.

### Patch Changes

- [#25](https://github.com/lowdefy/modules-mongodb/pull/25) [`a6b13ce`](https://github.com/lowdefy/modules-mongodb/commit/a6b13ced4bff8f53597088e2beb29fc72c0906a1) Thanks [@Yianni99](https://github.com/Yianni99)! - Stamp S3 uploads with `x-amz-meta-uploaded-by-{id,name,url}` metadata so file uploads carry uploader id, display name, and originating page at the bucket level. The `files` module gains the full set of fields and switches its presigned-post conditions to the array-of-arrays form. Uses `_if_none` "unknown" fallbacks so unauthenticated uploads still succeed.

## 0.1.1

### Patch Changes

- [#20](https://github.com/lowdefy/modules-mongodb/pull/20) [`e4d608a`](https://github.com/lowdefy/modules-mongodb/commit/e4d608a664775a73737b75ea9ef7f9793a0eb7eb) Thanks [@Yianni99](https://github.com/Yianni99)! - Fix plugin version constraints in module manifests. `@lowdefy/modules-mongodb-plugins` references updated from the invalid `^1` (no matching published version) to `^0.1.0`, and missing `version` declarations added for `@lowdefy/modules-mongodb-plugins` and `@lowdefy/community-plugin-xlsx` where the module validator required them.

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.

# @lowdefy/modules-mongodb-files

## 0.13.0

## 0.12.0

## 0.11.0

### Minor Changes

- [#100](https://github.com/lowdefy/modules-mongodb/pull/100) [`dd309b8`](https://github.com/lowdefy/modules-mongodb/commit/dd309b83299d3f37d2fb2fd380ed288e42bdf97f) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Log file downloads for parity with upload/delete auditing. The `FileManager`
  block now fires an `onDownload` event (payload `{ fileDoc }`) when a download is
  initiated. The `file-manager` / `file-card` components expose a new `on_download`
  var (action list, default `[]`) for consumer-supplied handlers, and — when
  `log_events` is on — record a `download-file` event via the events module,
  matching how uploads and deletes are logged.

- [#100](https://github.com/lowdefy/modules-mongodb/pull/100) [`dd309b8`](https://github.com/lowdefy/modules-mongodb/commit/dd309b83299d3f37d2fb2fd380ed288e42bdf97f) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Export the files module's download-policy request as a named component so it can
  be consumed outside the `file-manager` / `file-list` components. Consumers that
  render downloadable files themselves — such as the events module's
  `EventsTimeline` — can now `_ref` it inside a page's `requests:` list:

  ```yaml
  requests:
    - _ref:
        { module: files, component: download-policy, vars: { block_id: <id> } }
  ```

  This yields a presigned-GET request with id `download_policy_<block_id>` on the
  module's `files-bucket` connection, which the consumer passes as its
  `s3GetPolicyRequestId`. Previously the only module-owned download policy lived
  inside `file-manager` / `file-list`, forcing consuming apps to keep their own
  copies.

- [#100](https://github.com/lowdefy/modules-mongodb/pull/100) [`dd309b8`](https://github.com/lowdefy/modules-mongodb/commit/dd309b83299d3f37d2fb2fd380ed288e42bdf97f) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Expose the FileManager upload-modal form slot on the `file-manager` and
  `file-card` components. Consumers can now pass a `form_fields` block list
  (with field ids `<block_id>.form.*`) that renders in a post-upload modal;
  the entered values are persisted to the file document's `metadata`. Adds an
  `ok_text` var (modal confirm-button label) alongside the existing
  `modal_title`. When the injected form includes a `<block_id>.form.file_category`
  field, its value sets the saved document's top-level `file_category`; the
  build-time `file_category` var is used as the fallback, so existing consumers
  that pass no form are unaffected.

## 0.10.1

## 0.10.0

### Minor Changes

- [#96](https://github.com/lowdefy/modules-mongodb/pull/96) [`5742843`](https://github.com/lowdefy/modules-mongodb/commit/5742843c5be12cb2a67325efad52516bde5b1fc3) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Soft-delete now uses a `deleted` change stamp instead of a `removed` boolean (breaking).

  The soft-delete marker on file docs is renamed `removed` → `deleted` and changed from a boolean to a [change stamp](https://github.com/lowdefy/modules-mongodb/blob/main/docs/shared/soft-delete.md) object, matching the convention used by `activities` and the rest of the repo. `delete-file` sets `deleted` to a change stamp (capturing who/when), `save-file` initialises `deleted: null`, and `get-entity-files` reads live files with `deleted.timestamp: { $exists: false }`.

  Existing data needs a migration. Deleted docs already recorded who/when on their `updated` stamp, so promote it into `deleted`. Run it as a single per-document pipeline (a separate `{ removed: { $ne: true } }` pass would match already-migrated docs — `$ne` matches missing fields — and clobber the new stamps):

  ```js
  db.files.updateMany({ removed: { $exists: true } }, [
    {
      $set: {
        deleted: { $cond: [{ $eq: ["$removed", true] }, "$updated", null] },
      },
    },
    { $unset: "removed" },
  ]);
  ```

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.1

## 0.8.0

### Patch Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`6936a5c`](https://github.com/lowdefy/modules-mongodb/commit/6936a5ccaee39e0dd4d6a85d3b90c7a4fe4fb8a8) Thanks [@Saiby100](https://github.com/Saiby100)! - Files: read upload metadata from the file event and set the S3 `Content-Type` field directly.

  - `upload-policy` now reads `file_name` / `file_type` from `_event: file.name` / `_event: file.type` instead of reconstructing the upload block's state path via `block_id`. This decouples the request from the consuming block's id and avoids a brittle `_state` lookup.
  - The S3 POST policy now sets `Content-Type` as a fixed field (`_payload: file_type`) and drops the equivalent `eq $Content-Type` condition — the value is asserted by the field rather than gated by a policy condition.
  - `file-manager` migrates its fetch/refresh Request actions to the `requestIds` array form with `holdValue: true`, matching the current Request action API.

## 0.7.0

### Minor Changes

- [#67](https://github.com/lowdefy/modules-mongodb/pull/67) [`e21af13`](https://github.com/lowdefy/modules-mongodb/commit/e21af133e6713456cb0ca481fd728aed29388e06) Thanks [@Saiby100](https://github.com/Saiby100)! - `files` module — fixes and enhancements to `file-manager` and `file-list`:

  **Var forwarding (fix)**

  `file-manager` was not forwarding `entity_type`, `entity_id`, and `file_category` vars into its nested `_ref`s for `upload-policy.yaml` and `get-entity-files.yaml`. Without forwarding, those build-time `_var`s resolved to `null`, so:

  - `get_entity_files` matched on `{ collection: null, doc_id: null }` and always returned an empty list — uploaded files were never displayed.
  - `upload-policy` generated S3 object keys prefixed with `null/` instead of the entity type.

  The `file-card` wrapper passed vars in correctly; the bug only affected consumers that referenced `file-manager` directly (or any indirect usage, since `file-card` re-`_ref`s it). `file-list` had the same missing forwarding and is also fixed.

  **Unique request ids per block (fix)**

  `download-policy` and `get-entity-files` request ids are now suffixed with `block_id` (matching the existing `upload-policy` pattern). Previously both `file-manager` and `file-list` declared these requests with hardcoded `download_policy` and `get_entity_files` ids, so using both components on the same page caused duplicate request id build errors.

  **Download policy payload (fix)**

  `download-policy` now reads `key` and `content_type` from the S3 event (`_event: file.key`, `_event: file.type`) instead of unrelated state keys.

  **`file-list` item rendering (fix)**

  Replaced the undefined `_array_indices` operator with `_state: <list_id>.$.<field>` so list children read the current item from state. Added a `SetState` to `onMount` that seeds the list's state key from the request result.

  **`onSave` / `onDelete` extension (feat)**

  `file-manager` now accepts `on_save` and `on_delete` vars (arrays of actions, default `[]`) appended after the built-in `save_file_metadata`/`delete_file` + `refresh_files` sequences. `file-card` forwards both vars through.

  **Soft-delete field rename (breaking)**

  The soft-delete field on file docs is now `removed` (matching hydra) instead of `deleted`. Affects `save-file`, `delete-file`, and `get-entity-files`. Existing data with `deleted: true` needs a migration:

  ```
  db.files.updateMany({ deleted: { $exists: true } }, { $rename: { deleted: 'removed' } })
  ```

## 0.6.0

## 0.5.2

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

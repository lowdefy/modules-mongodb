# @lowdefy/modules-mongodb-files

## 2.0.0

### Major Changes

- [#316](https://github.com/lowdefy/modules-mongodb/pull/316) [`397ac4e`](https://github.com/lowdefy/modules-mongodb/commit/397ac4e07cf28c81fa6ad1b8f565743f5d098130) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **The files components, and the modules that use them, now work through the files module's endpoints.**

  - **files:** `file-manager` and `file-card` list through `list-files` on mount and again after each save and delete, get each upload's policy from `upload-policy`, save with `save-file` (sending the key and the thumbnail) and delete with `delete-file`. `file-list` lists through `list-files` and downloads through `download-file` with the `FileDownload` block. A refused upload shows the endpoint's message and is dropped. The components need no page requests, and their vars are unchanged.
  - **events:** the `events-timeline` component's `s3GetPolicyRequestId` var is replaced by `download_endpoint_id` (default null). Set it to the files module's `download-file` to show download links for files on `event.files`; a file that is not a file record is refused. Unset, event files are not shown.
  - **support:** uploads land under `{organization_id}/support/{user id}/{uuid}/{name}`, or `support/{user id}/…` for a user with no organization, who can still attach files. `create-ticket` and `post-message` accept only files under the caller's own prefix. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
  - **deals:** the deal files panel lists through `list-files` when a deal is opened or switched and when the upload modal closes, and the upload modal lists the selected deal's files each time it opens.
  - **plugins:** `FileDownload` gives each file without a `uid` one from its `_id` or `key`, so a file is listed once.

- [#316](https://github.com/lowdefy/modules-mongodb/pull/316) [`cbefe01`](https://github.com/lowdefy/modules-mongodb/commit/cbefe0138fb488e461881dbff57aba971a6b2f0f) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Breaking: every file operation goes through a files module endpoint, and downloads are signed from the stored record.** Before, any signed-in user who held a file's key could get a download link for it, whatever organization or record it belonged to, and could save a record over another file's key. The page requests that signed or listed by a key the browser sent are removed.

  - **New endpoints:** `list-files`, `upload-policy`, `save-file`, `download-file` and `delete-file`. Each loads what it acts on through the walled `files-collection` connection. `download-file` takes `{ file_id }` and returns `{ url }`, signed for the key on the record. `delete-file` takes `{ file_id }` and reads the record type and id from the record.
  - **Upload keys are made on the server**, under `{organization_id}/files/{entity_type}/{entity_id}/{timestamp}/{uuid}/{name}`. `upload-policy` refuses a caller with no organization and a `/` in the record type or id. `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` and refuses a key `upload-policy` did not mint for the caller's organization and that record, a key any record already holds (deleted ones included), and a key with nothing uploaded. Size and type now come from S3, and a thumbnail is kept only when it is a `data:image/` URL of 16 KB or less.
  - **New vars:** `access_check: { endpoint_id }` names an app endpoint the five endpoints call with `{ operation, entity_type, entity_id, file_id }`; only `{ allowed: true }` lets the operation go ahead, and `{ allowed: false, message }` stops it with that message. `max_file_size` (default 25 MB) caps uploads in the policy. `allowed_content_types` limits the types `upload-policy` accepts.
  - **Removed:** the `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export. An app that `_ref`s the `download-policy` export, or calls `save-file` with a `file` object or `delete-file` with `entity_type` and `entity_id`, must move to the endpoints above.

  Existing files are not moved. Records keep their keys, and `download-file` signs them because it goes by the record.

- [#316](https://github.com/lowdefy/modules-mongodb/pull/316) [`e857039`](https://github.com/lowdefy/modules-mongodb/commit/e8570395614810b639ca73540b8aa6764fe3e854) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Breaking: v2 makes the files module safe for an app with many organizations.** Until now anyone signed in who held a file's key could get a download link for it, whatever organization or record it belonged to, and could save a record over another file's key. Every file operation now goes through a files module endpoint that loads the record and runs an access check the app can supply, and every download link is signed from a stored record. Every module and the plugin move to 2.0.0 together, on Lowdefy 7 as before; no framework upgrade is needed. Files already uploaded stay where they are and keep working, so there is no data migration.

  To upgrade an app:

  1. **Move off the removed files requests.** The `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export are gone. The `file-manager`, `file-card` and `file-list` components need no page requests now. An app that lists, uploads, saves, downloads or deletes files itself calls the endpoints `list-files`, `upload-policy`, `save-file`, `download-file` and `delete-file` (`files/<endpoint>` in app config). `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` with a key `upload-policy` minted, and `delete-file` and `download-file` take `{ file_id }`. See `docs/files/reference/endpoints.md`.
  2. **Decide who may work with a record's files.** Without config, every signed-in member of the organization may. To narrow it, write an app endpoint that answers `{ allowed: true }` or `{ allowed: false, message }` for `{ operation, entity_type, entity_id, file_id }` and name it in the files module's `access_check: { endpoint_id }` var. It may be asked about a record that is not saved yet (the activities module mints an activity's id before saving it).
  3. **Check the upload limits.** Uploads are capped at `max_file_size`, 25 MB by default; raise it if the app takes larger files. Set `allowed_content_types` to limit the types `upload-policy` accepts.
  4. **Rename the download property on blocks.** FileManager, EventsTimeline, DataDescriptions and SmartDescriptions take `downloadEndpointId` (and an optional `downloadPayload`) in place of `s3GetPolicyRequestId`; with only the old property set they show no download. Point it at the files module's `download-file` for files module records. An app that signs its own files writes an endpoint that takes `{ file_id, ...downloadPayload }`, loads the record the file belongs to, and returns `{ url }`, failing with a message (`:reject:`) to refuse.
  5. **Events timeline:** the `events-timeline` component's `s3GetPolicyRequestId` var is now `download_endpoint_id`, null by default. Set it to `files/download-file` to show downloads for files on `event.files`. A file there that is not a file record no longer downloads.
  6. **Workflows:** the `file_download` field's `s3GetPolicyRequestId` var is replaced by `download_endpoint_id` and `download_payload`, which default to the workflows module's `download-form-file` with the page's `{ workflow_id }`, so form files keep downloading with no app config. Drop `s3GetPolicyRequestId`; to show files module records in the field, set `download_endpoint_id: files/download-file`. The overview pages no longer pull in the files module's `download-policy`.
  7. **Workflow form uploads must carry the organization.** The app's `upload_files` request (the `file_upload` field's `s3PostPolicyRequestId`) must mint keys under `{organization_id}/workflows/`, for example `{organization_id}/workflows/{workflow type}/{uuid}/{name}`; see the `file_upload` field in `docs/workflows/reference/form-components.md`. Submitting a form refuses a new file under any other key, and `download-form-file` signs only those keys and keys from before the upgrade, so a form file with another organization's key, or a files module or support key, no longer downloads.
  8. **Support uploads** land under `{organization_id}/support/{user id}/`, or `support/{user id}/` for a user with no organization. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
  9. **Guard the app's own signing requests.** A page request that signs any key the browser sends gives anyone signed in every object in the bucket, including other organizations' files. An app that signs its own download links for other prefixes in the same bucket (chat attachments, for example) should sign only keys under the caller's own prefix and return a null key for any other, as `apps/demo/modules/ai-assistant/attachment_requests.yaml` does.

  New uploads land under `{organization_id}/files/{entity_type}/{entity_id}/`; older objects keep their keys and still download, because signing goes by the record rather than the key. The other entries in this release give each module's changes in full.

## 1.4.1

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.0

### Patch Changes

- [#305](https://github.com/lowdefy/modules-mongodb/pull/305) [`0931d8e`](https://github.com/lowdefy/modules-mongodb/commit/0931d8e7af1a86655ae6cdfe6131c8a237636603) Thanks [@puffin-mrm](https://github.com/puffin-mrm)! - Apps on Lowdefy 7 no longer get build warnings from the deal page's pagers, the task modal's person picker or the file list. Each of these, and the deals list's loading placeholders, set a block property Lowdefy 7 doesn't have; nothing changes on screen.

## 1.0.0

### Major Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

  To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

  - **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
  - **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
  - **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
  - **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
  - **Events:** `contact_page_url` is replaced by `contact_page_id`.
  - **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
  - **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.2

## 0.44.1

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

## 0.40.0

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.1

## 0.32.0

## 0.31.1

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.1

## 0.25.0

### Minor Changes

- [#155](https://github.com/lowdefy/modules-mongodb/pull/155) [`a96d1a2`](https://github.com/lowdefy/modules-mongodb/commit/a96d1a2db63f73464bf7a2769614ff203888838e) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Files: file rows can now show read-only tags from a file's metadata.

  The files module's `file-manager` and `file-card` gain a `metadata_tags` var — a list of `{ key, label, when, color }` entries. Each renders a small tag under a file row when that file's metadata field matches (any truthy value, or an exact match when `when` is set), in both editable and read-only views. This lets a surface flag files inline — for example an "Available to client" tag — without a bespoke file list. Tags are display-only and never affect upload, save, or delete.

## 0.24.0

## 0.23.1

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.1

## 0.14.0

### Minor Changes

- [#108](https://github.com/lowdefy/modules-mongodb/pull/108) [`784e63c`](https://github.com/lowdefy/modules-mongodb/commit/784e63c103dfffa100a2e79e889c18352fff1e4e) Thanks [@Yianni99](https://github.com/Yianni99)! - Add optional component vars for consumers that need required/empty-state control:

  - `company-selector` gains a `required` var (default `false`) — sets the block
    required so a page-level `Validate` flags an empty company selection, instead
    of the consumer hand-rolling a submit guard.
  - `file-list` gains an `empty_text` var (default `"No files"`) — overrides the
    empty-state message.

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

---
"@lowdefy/modules-mongodb-activities": major
"@lowdefy/modules-mongodb-ai-assistant": major
"@lowdefy/modules-mongodb-ai-reporting": major
"@lowdefy/modules-mongodb-companies": major
"@lowdefy/modules-mongodb-contacts": major
"@lowdefy/modules-mongodb-deals": major
"@lowdefy/modules-mongodb-events": major
"@lowdefy/modules-mongodb-files": major
"@lowdefy/modules-mongodb-layout": major
"@lowdefy/modules-mongodb-notifications": major
"@lowdefy/modules-mongodb-organizations": major
"@lowdefy/modules-mongodb-release-notes": major
"@lowdefy/modules-mongodb-support": major
"@lowdefy/modules-mongodb-user-account": major
"@lowdefy/modules-mongodb-user-admin": major
"@lowdefy/modules-mongodb-walkthroughs": major
"@lowdefy/modules-mongodb-workflows": major
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: v2 makes the files module safe for an app with many organizations.** Until now anyone signed in who held a file's key could get a download link for it, whatever organization or record it belonged to, and could save a record over another file's key. Every file operation now goes through a files module endpoint that loads the record and runs an access check the app can supply, and every download link is signed from a stored record. Every module and the plugin move to 2.0.0 together, on Lowdefy 7 as before; no framework upgrade is needed. Files already uploaded stay where they are and keep working, so there is no data migration.

To upgrade an app:

1. **Move off the removed files requests.** The `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export are gone. The `file-manager`, `file-card` and `file-list` components need no page requests now. An app that lists, uploads, saves, downloads or deletes files itself calls the endpoints `list-files`, `upload-policy`, `save-file`, `download-file` and `delete-file` (`files/<endpoint>` in app config). `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` with a key `upload-policy` minted, and `delete-file` and `download-file` take `{ file_id }`. See `docs/files/reference/endpoints.md`.
2. **Decide who may work with a record's files.** Without config, every signed-in member of the organization may. To narrow it, write an app endpoint that answers `{ allowed: true }` or `{ allowed: false, message }` for `{ operation, entity_type, entity_id, file_id }` and name it in the files module's `access_check: { endpoint_id }` var. It may be asked about a record that is not saved yet (the activities module mints an activity's id before saving it).
3. **Check the upload limits.** Uploads are capped at `max_file_size`, 25 MB by default; raise it if the app takes larger files. Set `allowed_content_types` to limit the types `upload-policy` accepts.
4. **Rename the download property on blocks.** FileManager, EventsTimeline, DataDescriptions and SmartDescriptions take `downloadEndpointId` (and an optional `downloadPayload`) in place of `s3GetPolicyRequestId`; with only the old property set they show no download. Point it at the files module's `download-file` for files module records. An app that signs its own files writes an endpoint that takes `{ file_id, ...downloadPayload }`, loads the record the file belongs to, and returns `{ url }`, failing with a message (`:reject:`) to refuse.
5. **Events timeline:** the `events-timeline` component's `s3GetPolicyRequestId` var is now `download_endpoint_id`, null by default. Set it to `files/download-file` to show downloads for files on `event.files`. A file there that is not a file record no longer downloads.
6. **Workflows:** the `file_download` field's `s3GetPolicyRequestId` var is replaced by `download_endpoint_id` and `download_payload`, which default to the workflows module's `download-form-file` with the page's `{ workflow_id }`, so form files keep downloading with no app config. Drop `s3GetPolicyRequestId`; to show files module records in the field, set `download_endpoint_id: files/download-file`. The overview pages no longer pull in the files module's `download-policy`.
7. **Support uploads** land under `{organization_id}/support/{user id}/`, or `support/{user id}/` for a user with no organization. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
8. **Guard the app's own signing requests.** A page request that signs any key the browser sends gives anyone signed in every object in the bucket, including other organizations' files. An app that signs its own download links for other prefixes in the same bucket (chat attachments, for example) should sign only keys under the caller's own prefix and return a null key for any other, as `apps/demo/modules/ai-assistant/attachment_requests.yaml` does.

New uploads land under `{organization_id}/files/{entity_type}/{entity_id}/`; older objects keep their keys and still download, because signing goes by the record rather than the key. The other entries in this release give each module's changes in full.

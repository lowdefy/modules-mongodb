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

**Breaking: v2 makes the files module safe for an app with many organizations.** Until now anyone signed in who held a file's key could get a download link for it, whatever organization or record it belonged to, could keep or forward that S3 link after their access ended, and could save a record over another file's key. Every file operation now goes through a files module endpoint that loads the record and runs an access check the app can supply. Every file a module shows is a stable link on the app's own domain, `/api/endpoints/...`, that checks the caller's session and access each time it is opened and then redirects to an S3 link signed for 60 seconds. Every module and the plugin move to 2.0.0 together, on Lowdefy 7.2.0 or later (the first release with link endpoints). Files already uploaded stay where they are and keep working, so there is no data migration.

To upgrade an app:

1. **Move to Lowdefy 7.2.0.** Set `lowdefy: 7.2.0` in `lowdefy.yaml` and move the `lowdefy` and `@lowdefy/*` packages to 7.2.0.
2. **Move off the removed files requests.** The `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export are gone. The `file-manager`, `file-card` and `file-list` components need no page requests now. An app that lists, uploads, saves or deletes files itself calls the endpoints `list-files`, `upload-policy`, `save-file` and `delete-file` (`files/<endpoint>` in app config). `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` with a key `upload-policy` minted, and `delete-file` takes `{ file_id }`. A file opens through the `file` link endpoint, `GET /api/endpoints/files/file/<key>`. See `docs/files/reference/endpoints.md`.
3. **Decide who may work with a record's files.** Without config, every signed-in member of the organization may. To narrow it, write an app endpoint that answers `{ allowed: true }` or `{ allowed: false, message }` for `{ operation, entity_type, entity_id, file_id }` and name it in the files module's `access_check: { endpoint_id }` var. It may be asked about a record that is not saved yet (the activities module mints an activity's id before saving it).
4. **Check the upload limits.** Uploads are capped at `max_file_size`, 25 MB by default; raise it if the app takes larger files. Set `allowed_content_types` to limit the types `upload-policy` accepts.
5. **Point the download blocks at a link endpoint.** FileDownload, FileManager, EventsTimeline, DataDescriptions and SmartDescriptions take `linkEndpointId` (and an optional `linkPath`, path segments before the key) in place of `s3GetPolicyRequestId`; with only the old property set they show no links. Use `files/file` for files module records, and the workflows module's `form-file` with `linkPath: [workflow_id]` for workflow form files. Each file renders as a plain link that opens in a new tab and can be copied.
6. **An app that signs its own files** for these blocks writes a link endpoint (`type: Api`, `link: true`). It gets `{ path, query }` as its payload, where `path` is everything after its id, loads the record the file belongs to, checks access, and returns the signed URL to redirect to; to refuse, it rejects with a `:status` (`:reject: …` with `:status: 404`).
7. **Refused files show a bare status page.** A file link opened while signed out answers 401, and one the endpoint refuses (not found, deleted, another organization's, or refused by `access_check`) a 404 with no body, which the new tab shows as the browser's own status page. The `access_check` message is no longer shown on a download; it still shows on list, upload, save and delete.
8. **`onDownload` and the `download-file` event mean "clicked".** FileManager's `onDownload`, the `file-manager` and `file-card` components' `on_download` var and their `download-file` event (with `log_events`) fire when a file link is clicked, not when a download is verified: a refused file still logs, and opening a copied link does not. Treat them as a client-side record, not an audit trail.
9. **Events timeline:** the `events-timeline` component's `s3GetPolicyRequestId` var is now `file_link_endpoint_id`, null by default. Set it to `files/file` to show links for files on `event.files`. A file there that is not a file record answers 404.
10. **Workflows:** the `file_download` field's `s3GetPolicyRequestId` var is replaced by `link_endpoint_id` and `link_path`, which default to the workflows module's `form-file` with the page's `[workflow_id]`, so form files keep opening with no app config. Drop `s3GetPolicyRequestId`; to show files module records in the field, set `link_endpoint_id: files/file` and `link_path: []`. The overview pages no longer pull in the files module's `download-policy`.
11. **Workflow form uploads must carry the organization.** The app's `upload_files` request (the `file_upload` field's `s3PostPolicyRequestId`) must mint keys under `{organization_id}/workflows/`, for example `{organization_id}/workflows/{workflow type}/{uuid}/{name}`; see the `file_upload` field in `docs/workflows/reference/form-components.md`. Submitting a form refuses a new file under any other key, and `form-file` opens only those keys and keys from before the upgrade, so a form file with another organization's key, or a files module or support key, no longer opens.
12. **Apps that share workflow data share a base path and a workflows entry id.** Images pasted into a workflow rich-text field are saved as a `form-file` link that holds the app's base path and the workflows module's entry id, so every app that shows the same workflow data must use the same base path and the same entry id for the workflows module. Images saved before the upgrade keep their S3 URLs.
13. **Notification attachments need sign-in.** The notifications `file-download` page is no longer public: a signed-out recipient who opens an emailed attachment goes through sign-in first, and only the notification's recipient can open it. Emailed links don't change.
14. **List every uploading domain in the bucket's CORS.** Uploads still go straight from the browser to S3. An app served on several domains lists each one in the bucket's CORS `AllowedOrigins`. File links carry no host, so they work on every domain, each checked with that domain's session.
15. **Support uploads** land under `{organization_id}/support/{user id}/`, or `support/{user id}/` for a user with no organization. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
16. **Guard the app's own signing requests.** A page request that signs any key the browser sends gives anyone signed in every object in the bucket, including other organizations' files. An app that signs its own download links for other prefixes in the same bucket (chat attachments, for example) should sign only keys under the caller's own prefix and return a null key for any other, as `apps/demo/modules/ai-assistant/attachment_requests.yaml` does.

New uploads land under `{organization_id}/files/{entity_type}/{entity_id}/`; older objects keep their keys and still open, because signing goes by the record rather than the key. The other entries in this release give each module's changes in full.

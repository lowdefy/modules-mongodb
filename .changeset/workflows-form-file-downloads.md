---
"@lowdefy/modules-mongodb-workflows": major
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: workflow form files download through the workflows module's `download-form-file` endpoint.** It signs a file's key only when the key is in the form slots of actions the caller may view in that workflow and is the caller's own organization's form file, so holding a key is no longer enough.

- **New endpoint `download-form-file`** (exported): payload `{ workflow_id, file_id }`, `file_id` being the file's key; returns `{ url }`. It signs with the files module's `files-bucket` connection, and refuses another organization's workflow, a key in no form slot, and a key in the slot of an action (or keyed slot) the caller holds no verb on. Files uploaded before the upgrade keep downloading.
- **New WorkflowAPI request `GetWorkflowFormFile`**, which finds the key using the same access filter and `form_data` pruning as the overview pages.
- **Overview pages** no longer instantiate the files module's `download-policy` request; their action cards download through `download-form-file`. File upload fields now render on the cards as downloads.
- **`file_download` field:** renders `FileDownload`. `download_endpoint_id` and `download_payload` replace `s3GetPolicyRequestId`, and default to `download-form-file` with the page's `{ workflow_id }`, so form files need no app config. **Upgrade:** drop `s3GetPolicyRequestId`; to list files module records in the field, set `download_endpoint_id: files/download-file`.
- **Form file keys carry the organization.** Submitting a form refuses a file whose key is not under the caller's `{organization_id}/workflows/`, unless it is already in that form, and names the field. `download-form-file` signs only those keys and keys with no module prefix, which form files uploaded before the upgrade have. **Upgrade:** the app's `upload_files` request must mint keys under `{organization_id}/workflows/`.
- The `files` dependency now supplies only the `files-bucket` connection.

---
"@lowdefy/modules-mongodb-workflows": major
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: workflow form files open through the workflows module's `form-file` link endpoint.** It signs a file's key only when the key is in the form slots of actions the caller may view in that workflow and is the caller's own organization's form file, so holding a key is no longer enough.

- **`form-file`** (exported, see its own entry) finds the key with the files module's `files-bucket` connection, and answers another organization's workflow, a key in no form slot, and a key in the slot of an action (or keyed slot) the caller holds no verb on with a bare 404. Files uploaded before the upgrade keep opening.
- **New WorkflowAPI request `GetWorkflowFormFile`**, which finds the key using the same access filter and `form_data` pruning as the overview pages.
- **Overview pages** no longer instantiate the files module's `download-policy` request; their action cards link form files to `form-file`. File upload fields now render on the cards as links.
- **`file_download` field:** renders `FileDownload`. `link_endpoint_id` and `link_path` replace `s3GetPolicyRequestId`, and default to `form-file` with the page's `[workflow_id]`, so form files need no app config. **Upgrade:** drop `s3GetPolicyRequestId`; to list files module records in the field, set `link_endpoint_id: files/file` and `link_path: []`.
- **Form file keys carry the organization.** Submitting a form refuses a file whose key is not under the caller's `{organization_id}/workflows/`, unless it is already in that form, and names the field. `form-file` opens only those keys and keys with no module prefix, which form files uploaded before the upgrade have. **Upgrade:** the app's `upload_files` request must mint keys under `{organization_id}/workflows/`.
- The `files` dependency now supplies only the `files-bucket` connection and the shared signing part.

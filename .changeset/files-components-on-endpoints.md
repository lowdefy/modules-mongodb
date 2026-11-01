---
"@lowdefy/modules-mongodb-files": major
"@lowdefy/modules-mongodb-events": major
"@lowdefy/modules-mongodb-support": major
"@lowdefy/modules-mongodb-deals": patch
"@lowdefy/modules-mongodb-plugins": patch
---

**The files components, and the modules that use them, now work through the files module's endpoints.**

- **files:** `file-manager` and `file-card` list through `list-files` on mount and again after each save and delete, get each upload's policy from `upload-policy`, save with `save-file` (sending the key and the thumbnail) and delete with `delete-file`. `file-list` lists through `list-files`. Every file is a plain link to the module's `file` link endpoint, through the `FileDownload` block. With `log_events`, clicking a file link in `file-manager` or `file-card` logs a `download-file` event and runs `on_download`; both mean the link was clicked, not that the file was served. A refused upload shows the endpoint's message and is dropped. The components need no page requests, and their vars are unchanged.
- **events:** the `events-timeline` component's `s3GetPolicyRequestId` var is replaced by `file_link_endpoint_id` (default null). Set it to the files module's `file` (`files/file`) to show links for files on `event.files`; a file that is not a file record answers 404. Unset, event files are not shown.
- **support:** uploads land under `{organization_id}/support/{user id}/{uuid}/{name}`, or `support/{user id}/…` for a user with no organization, who can still attach files. `create-ticket` and `post-message` accept only files under the caller's own prefix. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
- **deals:** the deal files panel lists through `list-files` when a deal is opened or switched and when the upload modal closes, and the upload modal lists the selected deal's files each time it opens.
- **plugins:** `FileDownload` gives each file without a `uid` one from its `_id` or `key`, so a file is listed once.

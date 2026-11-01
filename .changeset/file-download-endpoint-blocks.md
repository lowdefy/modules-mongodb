---
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: every download block renders plain links to a link endpoint, named by `linkEndpointId`, instead of signing through a page request.** A page request signs whatever key the browser sends; a link endpoint loads the record and checks access every time the link is opened, then redirects to a short-lived signed link.

- **New `FileDownload` block:** lists `fileList`, each file as `<a href target="_blank" rel="noopener noreferrer">` to `<basePath>/api/endpoints/<linkEndpointId>/<...linkPath>/<key>`, where the key is the file's `_id`, else its `key`. Links open in a new tab and can be copied. The block fetches nothing and needs no `CallAPI` on the page.
- **FileManager, EventsTimeline, DataDescriptions and SmartDescriptions** take `linkEndpointId` and an optional `linkPath` in place of `s3GetPolicyRequestId`, and link their file values the same way. FileManager links each row's name and download button, and fires `onDownload` when either is clicked (left or middle click). It records a click: a refused file still fires it, and opening a copied link does not.
- **Upgrade:** replace `s3GetPolicyRequestId` with `linkEndpointId`, pointing at a link endpoint (`type: Api`, `link: true`) that redirects to the file. For files module records that is the files module's `file` (`files/file` in app config); for workflow form files the workflows module's `form-file` with `linkPath: [workflow_id]`. With only `s3GetPolicyRequestId` set, these blocks show no links.
- The plugin no longer imports `@lowdefy/plugin-aws`'s `S3Download`.

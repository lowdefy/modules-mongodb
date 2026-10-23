---
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: every download block signs through an API endpoint, named by `downloadEndpointId`, instead of a page request.** A page request signs whatever key the browser sends; an endpoint loads the record and signs the key stored on it.

- **New `FileDownload` block:** lists `fileList` and, on click, calls the endpoint `downloadEndpointId` with `{ ...downloadPayload, file_id }`, where `file_id` is the file's `_id`, else its `key`, and opens the `url` it returns. A refusal shows the endpoint's message and opens nothing.
- **FileManager, EventsTimeline, DataDescriptions and SmartDescriptions** take `downloadEndpointId` and an optional `downloadPayload` in place of `s3GetPolicyRequestId`. FileManager sends `file_id: fileDoc._id`. The other three render `FileDownload` for their file values.
- **Upgrade:** replace `s3GetPolicyRequestId` with `downloadEndpointId`, pointing at an endpoint that takes `{ file_id, ...downloadPayload }` and returns `{ url }`. For files module records that is the files module's `download-file`. With only `s3GetPolicyRequestId` set, these blocks show no download.
- The plugin no longer imports `@lowdefy/plugin-aws`'s `S3Download`.

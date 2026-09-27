---
title: FileManager
module: plugins
type: reference
---

# FileManager

Drag-drop file upload with S3 signed URLs, paste-to-upload, optional metadata form, file-type icons, image thumbnails, download links, and a delete-confirmation modal. Used by the `files` module to back its `file-manager`, `file-card`, and (indirectly) `file-list` components.

The block does not own the file metadata — it expects the consumer to pass an array of file documents (`properties.files`) and to handle `onSave` / `onDelete` by writing to MongoDB. Upload uses `@lowdefy/plugin-aws`'s S3 post-policy mechanism.

## Usage

```yaml
- id: lot_files
  type: FileManager
  requests:
    - id: upload_policy
      # post-policy request from @lowdefy/plugin-aws
    - id: download_policy
      # get-policy request from @lowdefy/plugin-aws
    - id: get_files
      # MongoDB aggregation returning the file docs for this entity
  properties:
    s3PostPolicyRequestId: upload_policy
    s3GetPolicyRequestId: download_policy
    files:
      _request: get_files
    accept: ".pdf,.png,.jpg"
    hint: "Click or drag a file to upload"
  events:
    onMount:
      - id: load_files
        type: Request
        params: get_files
    onSave:
      - id: save
        type: CallAPI
        params:
          endpointId: files-save-file
          payload:
            entity_id: lot-1
            file:
              _event: file
      - id: refresh
        type: Request
        params: get_files
    onDelete:
      - id: remove
        type: CallAPI
        params:
          endpointId: files-delete-file
          payload:
            file_id:
              _event: fileDoc._id
      - id: refresh
        type: Request
        params: get_files
```

The pre-wired `file-card` component on the `files` module sets all of this up — most consumers should use that instead of the block directly.

### Upload policy from the page

By default the block fetches its upload policy with the page request named by `s3PostPolicyRequestId`. When the app must mint the policy somewhere a page request cannot reach (an API endpoint that checks permissions or picks the key on the server), define `onUploadPolicy` instead. The block then triggers it before each upload, in place of the request, with `_event` set to `{ file: { name, lastModified, size, type, uid }, pasted }`. The actions fetch the policy and hand it back with the block's `setUploadPolicy` method:

```yaml
- id: attachments
  type: FileManager
  properties:
    s3GetPolicyRequestId: download_policy
  events:
    onUploadPolicy:
      - id: get_policy
        type: CallAPI
        params:
          endpointId: attachments-upload-policy
          payload:
            name:
              _event: file.name
            content_type:
              _event: file.type
            size:
              _event: file.size
            pasted:
              _event: pasted
      - id: set_policy
        type: CallMethod
        skip:
          _eq:
            - _actions: get_policy.response.response.upload
            - null
        params:
          blockId: attachments
          method: setUploadPolicy
          args:
            - _actions: get_policy.response.response.upload
    onSave:
      - id: record
        type: CallAPI
        params:
          endpointId: attachments-record
          payload:
            key:
              _event: file.key
```

The policy is the same `{ url, fields }` an `AwsS3PresignedPostPolicy` request returns; `fields.key` and `fields.bucket` become `file.key` and `file.bucket` on `onSave`.

Policy events run one at a time, so each `setUploadPolicy` call in the event belongs to the upload that asked for it.

A file pasted from the clipboard carries `pasted: true`, in the `onUploadPolicy` event and on `onSave`'s `file`, so the app can give it a generated name (clipboard images arrive with a generic one).

#### A refused upload is held

If the event ends without a `setUploadPolicy` call (the endpoint refused, or an action skipped the call) or with a failed action, the block holds that upload quietly: no progress bar, no error state and no error message from the block. The page decides what happens next, usually after asking the user (a name clash: "Replace report.pdf?"). Keep the file's `uid` from the event, then either:

- send it: fetch a policy again and call `setUploadPolicy` with the policy and the `uid` as the second argument. The upload goes ahead as if the event had answered, and `onSave` fires as usual.
- drop it: call `cancelUpload` with the `uid`. The block forgets the file.

An upload the page will never send (a file over its size limit, say) can be dropped from the event itself: `cancelUpload` with the event's `uid`, called from the `onUploadPolicy` actions, drops it instead of holding it.

```yaml
events:
  onUploadPolicy:
    - id: get_policy
      type: CallAPI
      params:
        endpointId: attachments-upload-policy
        payload:
          name:
            _event: file.name
    - id: hold
      type: SetState
      skip:
        _ne:
          - _actions: get_policy.response.response.upload
          - null
      params:
        held_upload:
          uid:
            _event: file.uid
          name:
            _event: file.name
    - id: ask_replace
      type: CallMethod
      skip:
        _ne:
          - _actions: get_policy.response.response.upload
          - null
      params:
        blockId: replace_modal
        method: toggleOpen
    # set_policy as above, skipped when there is no policy
```

The `replace_modal` Modal's `onOk` fetches the policy again (with `replace: true`, say) and resumes the upload; its `onCancel` drops it:

```yaml
onOk:
  - id: get_replace_policy
    type: CallAPI
    params:
      endpointId: attachments-upload-policy
      payload:
        name:
          _state: held_upload.name
        replace: true
  - id: resume
    type: CallMethod
    params:
      blockId: attachments
      method: setUploadPolicy
      args:
        - _actions: get_replace_policy.response.response.upload
        - _state: held_upload.uid
onCancel:
  - id: drop
    type: CallMethod
    params:
      blockId: attachments
      method: cancelUpload
      args:
        - _state: held_upload.uid
```

A `setUploadPolicy` call for a held `uid` with no policy leaves the upload held. A `uid` the block does not hold (already sent or cancelled) is ignored. Held files live in the block until they are sent, cancelled or the page is left.

### Form-fields modal

When the block has a `form` slot, completing an upload opens a modal with the slot rendered inside it. State written under `{blockId}.form.*` is sent through to `onSave` along with the file:

```yaml
- id: lot_files
  type: FileManager
  properties:
    # ...
  slots:
    form:
      blocks:
        - id: lot_files.form.file_title
          type: TextInput
          properties:
            title: Title
            required: true
        - id: lot_files.form.category
          type: Selector
          properties:
            title: Category
            options: [contract, drawing, photo]
  events:
    onSave:
      - id: save
        type: CallAPI
        params:
          endpointId: files-save-file
          payload:
            file:
              _event: file
            metadata:
              _state: lot_files.form
```

Form state is validated (regex-anchored to `^{blockId}\.form\.`) before `onSave` runs. State is cleared after a successful save or a cancel.

## Properties

| Property                | Type                                 | Default                        | Description                                                                                                    |
| ----------------------- | ------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `files`                 | array                                | `[]`                           | The file documents to display. See [File document shape](#file-document-shape).                                |
| `s3PostPolicyRequestId` | string                               | —                              | Request id that returns an S3 post-policy for uploads. Required to upload, unless `onUploadPolicy` is defined. |
| `s3GetPolicyRequestId`  | string                               | —                              | Request id that returns an S3 get-policy URL for downloads. Required for the download link.                    |
| `accept`                | string                               | `*`                            | File-type filter passed to the dragger (e.g. `.pdf,.jpg`, `image/*`).                                          |
| `hint`                  | string (HTML)                        | `Click or drag file to upload` | Hint text inside the dragger. Rendered through `renderHtml`.                                                   |
| `disabled`              | boolean                              | `false`                        | Disable the dragger.                                                                                           |
| `viewOnly`              | boolean                              | `false`                        | Hide the dragger and the per-row delete button. Useful for read-only views.                                    |
| `showDelete`            | boolean                              | `true`                         | Show the delete button per row. Forced to `false` when `viewOnly` is `true`.                                   |
| `singleFile`            | boolean                              | `false`                        | Hide the dragger once a file is uploaded (one-file mode).                                                      |
| `maxCount`              | number                               | —                              | Hide the dragger once `files.length >= maxCount`.                                                              |
| `modalTitle`            | string                               | `Upload File`                  | Title of the form-fields modal. Only used when the `form` slot is present.                                     |
| `okText`                | string                               | `Save`                         | Submit button label on the form-fields modal.                                                                  |
| `label`                 | object                               | —                              | When set, wraps the block in an Antd `Label` (with `title`, `extra`, `tooltip`, …).                            |
| `required`              | boolean                              | `false`                        | Forwarded to the `Label` wrapper for required-state styling.                                                   |
| `size`                  | `"small"` \| `"middle"` \| `"large"` | —                              | Forwarded to the `Label` wrapper.                                                                              |

### File document shape

```js
{
  _id: "...",
  file: {
    name: "report.pdf",
    key: "lot/.../report.pdf",
    bucket: "my-files",
    size: 245678,
    type: "application/pdf",
    thumbnail: "data:image/jpeg;base64,..."   // optional, set on image uploads
  },
  file_title: "Lab Analysis Q1",              // optional; preferred over file.name for display
  file_category: "lab_results",               // optional
  metadata: { ... },                          // optional; from the form slot
  created: { timestamp: 1700000000000, user: { name: "Alice", id: "..." } }
}
```

## Events

| Event            | When                                                                               | Payload                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onChange`       | Dragger upload state changes (start, progress, error).                             | —                                                                                                                                                                          |
| `onUploadPolicy` | Before each upload, when defined, in place of the `s3PostPolicyRequestId` request. | `{ file: { name, lastModified, size, type, uid }, pasted }`. Hand the policy back with `setUploadPolicy`. See [Upload policy from the page](#upload-policy-from-the-page). |
| `onSave`         | Upload completes (and the form is valid, when present).                            | `{ file: { name, key, bucket, size, type, thumbnail, pasted } }`, `pasted: true` only on a clipboard file. The consumer is expected to persist this and any form state.    |
| `onDelete`       | Per-row delete is confirmed.                                                       | `{ fileDoc }` — the full file document being deleted.                                                                                                                      |
| `onDownload`     | A download is initiated (after the presigned URL opens).                           | `{ fileDoc }` — the full file document being downloaded.                                                                                                                   |

`onDownload` fires only once the presigned GET URL has resolved and the download has actually been opened, so it is safe to use for download audit logging. Note that download logging is emitted **client-side** from this event (unlike upload/delete auditing, which the `files` module records **server-side** in its `save-file` / `delete-file` API routines) — there is no download API to hang it off, so the `file-manager` / `file-card` components call the events module's `new-event` endpoint directly from `onDownload`.

For the form-fields modal, the consumer can return `{ success: false }` from the `onSave` action chain to keep the modal open (e.g. on validation or API failure).

## Methods

| Method            | Args                     | Effect                                                                                                                                                                                                                                                |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uploadFromPaste` | none                     | Reads the system clipboard (PNG/JPEG only) and starts an upload. Useful as a button action when the user can't focus the dragger.                                                                                                                     |
| `setUploadPolicy` | `{ url, fields }`, `uid` | Hands the block an upload policy. From the `onUploadPolicy` actions it answers the upload that asked (`uid` optional); with the `uid` of a held upload, at any time, it sends that upload. See [A refused upload is held](#a-refused-upload-is-held). |
| `cancelUpload`    | `uid`                    | Forgets a held upload. From the upload's own `onUploadPolicy` actions, drops it instead of holding it.                                                                                                                                                |

## CSS Keys

| Key        | Element                           |
| ---------- | --------------------------------- |
| `element`  | The outer container.              |
| `dragger`  | The Antd `Upload.Dragger`.        |
| `hint`     | The hint text inside the dragger. |
| `fileList` | The list of uploaded files.       |
| `fileItem` | An individual file row.           |

## Notes

- **Image thumbnails.** Image uploads (`file.type` starts with `image/`) get a 64 px JPEG thumbnail generated client-side and stored on the file doc as `file.thumbnail` (data URL). Non-image files get a type-specific icon (PDF, Excel, Word, generic).
- **Paste anywhere.** The block listens for `onPaste` on its container, so pasting an image while the page is focused inside the FileManager triggers an upload. Disabled when `viewOnly` or `disabled` is set.
- **Internal events.** The block registers `__getS3PostPolicy`, `__getS3DownloadPolicy`, `__validateForm`, and `__clearFormState` events for its own use. Do not bind to these names in consumer YAML.
- **`type` import.** `properties.maxCount` must be an integer to take effect.

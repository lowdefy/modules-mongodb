# FileManager

Drag-drop file upload with S3 signed URLs, paste-to-upload, optional metadata form, file-type icons, image thumbnails, download links, and a delete-confirmation modal. Used by the [`files` module](../../../../../modules/files/README.md) to back its `file-manager`, `file-card`, and (indirectly) `file-list` components.

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

### Form-fields modal

When the block has a `form` content slot, completing an upload opens a modal with the slot rendered inside it. State written under `{blockId}.form.*` is sent through to `onSave` along with the file:

```yaml
- id: lot_files
  type: FileManager
  properties:
    # ...
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

| Property | Type | Default | Description |
|---|---|---|---|
| `files` | array | `[]` | The file documents to display. See [File document shape](#file-document-shape). |
| `s3PostPolicyRequestId` | string | — | Request id that returns an S3 post-policy for uploads. Required to upload. |
| `s3GetPolicyRequestId` | string | — | Request id that returns an S3 get-policy URL for downloads. Required for the download link. |
| `accept` | string | `*` | File-type filter passed to the dragger (e.g. `.pdf,.jpg`, `image/*`). |
| `hint` | string (HTML) | `Click or drag file to upload` | Hint text inside the dragger. Rendered through `renderHtml`. |
| `disabled` | boolean | `false` | Disable the dragger. |
| `viewOnly` | boolean | `false` | Hide the dragger and the per-row delete button. Useful for read-only views. |
| `showDelete` | boolean | `true` | Show the delete button per row. Forced to `false` when `viewOnly` is `true`. |
| `singleFile` | boolean | `false` | Hide the dragger once a file is uploaded (one-file mode). |
| `maxCount` | number | — | Hide the dragger once `files.length >= maxCount`. |
| `modalTitle` | string | `Upload File` | Title of the form-fields modal. Only used when the `form` slot is present. |
| `okText` | string | `Save` | Submit button label on the form-fields modal. |
| `label` | object | — | When set, wraps the block in an Antd `Label` (with `title`, `extra`, `tooltip`, …). |
| `required` | boolean | `false` | Forwarded to the `Label` wrapper for required-state styling. |
| `size` | `"small"` \| `"middle"` \| `"large"` | — | Forwarded to the `Label` wrapper. |

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

| Event | When | Payload |
|---|---|---|
| `onChange` | Dragger upload state changes (start, progress, error). | — |
| `onSave` | Upload completes (and the form is valid, when present). | `{ file: { name, key, bucket, size, type, thumbnail } }`. The consumer is expected to persist this and any form state. |
| `onDelete` | Per-row delete is confirmed. | `{ fileDoc }` — the full file document being deleted. |

For the form-fields modal, the consumer can return `{ success: false }` from the `onSave` action chain to keep the modal open (e.g. on validation or API failure).

## Methods

| Method | Args | Effect |
|---|---|---|
| `uploadFromPaste` | none | Reads the system clipboard (PNG/JPEG only) and starts an upload. Useful as a button action when the user can't focus the dragger. |

## CSS Keys

| Key | Element |
|---|---|
| `element` | The outer container. |
| `dragger` | The Antd `Upload.Dragger`. |
| `hint` | The hint text inside the dragger. |
| `fileList` | The list of uploaded files. |
| `fileItem` | An individual file row. |

## Notes

- **Image thumbnails.** Image uploads (`file.type` starts with `image/`) get a 64 px JPEG thumbnail generated client-side and stored on the file doc as `file.thumbnail` (data URL). The block uses the thumbnail for the row icon. Non-image files get a type-specific icon (PDF, Excel, Word, generic).
- **Paste anywhere.** The block listens for `onPaste` on its container, so pasting an image while the page is focused inside the FileManager triggers an upload. Disabled when `viewOnly` or `disabled` is set.
- **Internal events.** The block registers `__getS3PostPolicy`, `__getS3DownloadPolicy`, `__validateForm`, and `__clearFormState` events for its own use. Do not bind to these names in consumer YAML.
- **`type` import.** The block uses `@lowdefy/helpers`'s `type.isArray` / `type.isInt` for property type checks; `properties.maxCount` must be an integer to take effect.

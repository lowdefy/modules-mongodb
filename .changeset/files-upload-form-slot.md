---
"@lowdefy/modules-mongodb-files": minor
---

Expose the FileManager upload-modal form slot on the `file-manager` and
`file-card` components. Consumers can now pass a `form_fields` block list
(with field ids `<block_id>.form.*`) that renders in a post-upload modal;
the entered values are persisted to the file document's `metadata`. Adds an
`ok_text` var (modal confirm-button label) alongside the existing
`modal_title`. When the injected form includes a `<block_id>.form.file_category`
field, its value sets the saved document's top-level `file_category`; the
build-time `file_category` var is used as the fallback, so existing consumers
that pass no form are unaffected.

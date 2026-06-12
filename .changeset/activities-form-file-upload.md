---
"@lowdefy/modules-mongodb-activities": minor
---

Activities: built-in file upload on the activity form.

- The activity form (new page, edit page, and quick-capture modal) now renders an Attachments section with the files module's `file-manager`, so users can attach files while logging an activity. Files bind to `entity_type: activity`, `entity_id: activity_id`, `file_category: activity-attachment` — the same keys the detail view's file sidebar reads.
- To give uploads a stable id before the activity exists, `activity_id` is minted (`_uuid`) on form open — capture-modal `onOpen` and new-page `onInit` — and reused as the create payload's `_id` instead of minting a fresh id at submit. The modal's `onClose` reset clears it; the edit page seeds it from the loaded `_id` so the file-manager resolves identically on new, edit, and capture. This also gives consumer attachment-style `fields.attributes` blocks a stable `_state: activity_id` to bind against.
- The form embeds the file-manager unconditionally, so hosts must wire the module's `files` dependency (previously only needed for the optional detail-page file sidebar).

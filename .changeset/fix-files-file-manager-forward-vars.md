---
"@lowdefy/modules-mongodb-files": minor
---

`files` module — fixes and enhancements to `file-manager` and `file-list`:

**Var forwarding (fix)**

`file-manager` was not forwarding `entity_type`, `entity_id`, and `file_category` vars into its nested `_ref`s for `upload-policy.yaml` and `get-entity-files.yaml`. Without forwarding, those build-time `_var`s resolved to `null`, so:

- `get_entity_files` matched on `{ collection: null, doc_id: null }` and always returned an empty list — uploaded files were never displayed.
- `upload-policy` generated S3 object keys prefixed with `null/` instead of the entity type.

The `file-card` wrapper passed vars in correctly; the bug only affected consumers that referenced `file-manager` directly (or any indirect usage, since `file-card` re-`_ref`s it). `file-list` had the same missing forwarding and is also fixed.

**Unique request ids per block (fix)**

`download-policy` and `get-entity-files` request ids are now suffixed with `block_id` (matching the existing `upload-policy` pattern). Previously both `file-manager` and `file-list` declared these requests with hardcoded `download_policy` and `get_entity_files` ids, so using both components on the same page caused duplicate request id build errors.

**Download policy payload (fix)**

`download-policy` now reads `key` and `content_type` from the S3 event (`_event: file.key`, `_event: file.type`) instead of unrelated state keys.

**`file-list` item rendering (fix)**

Replaced the undefined `_array_indices` operator with `_state: <list_id>.$.<field>` so list children read the current item from state. Added a `SetState` to `onMount` that seeds the list's state key from the request result.

**`onSave` / `onDelete` extension (feat)**

`file-manager` now accepts `on_save` and `on_delete` vars (arrays of actions, default `[]`) appended after the built-in `save_file_metadata`/`delete_file` + `refresh_files` sequences. `file-card` forwards both vars through.

**Soft-delete field rename (breaking)**

The soft-delete field on file docs is now `removed` (matching hydra) instead of `deleted`. Affects `save-file`, `delete-file`, and `get-entity-files`. Existing data with `deleted: true` needs a migration:

```
db.files.updateMany({ deleted: { $exists: true } }, { $rename: { deleted: 'removed' } })
```

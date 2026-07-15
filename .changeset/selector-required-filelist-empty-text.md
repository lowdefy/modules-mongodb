---
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-files": minor
---

Add optional component vars for consumers that need required/empty-state control:

- `company-selector` gains a `required` var (default `false`) — sets the block
  required so a page-level `Validate` flags an empty company selection, instead
  of the consumer hand-rolling a submit guard.
- `file-list` gains an `empty_text` var (default `"No files"`) — overrides the
  empty-state message.

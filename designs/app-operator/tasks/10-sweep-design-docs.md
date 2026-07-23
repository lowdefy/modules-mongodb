# Task 10: Standardise `app_name` → `slug` in in-flight and concept design docs

## Context

Half-migrating terminology (code snippets updated, prose left as `app_name`) leaves future
readers to reconcile two names for the same thing. This task sweeps the in-flight workflow-part
docs and the workflows concept docs so they consistently say `slug`. `_completed/` and
`_rejected/` subfolders are read-only history (project rule) and are excluded. This is a prose/
snippet sweep — no code or config in `modules/`, `plugins/`, or `apps/` is touched here.

## Task

Within `designs/workflows-module-concept/**` and `designs/workflows-module/**` (excluding any
`_completed/` and `_rejected/` subfolders), apply these substitutions:

- **Code-snippet sites** — `_module.var: app_name` → `_app: slug`; drop `app_name:` manifest
  var declarations shown in snippets.
- **Data-model placeholders** that name the slug position — `access.{app_name}` →
  `access.{slug}`, `display.{app_name}` → `display.{slug}`,
  `user.app_attributes.{app_name}` → `user.app_attributes.{slug}`, and similar.
- **Narrative references to the value** — "the host app's `app_name`" → "the host app's slug".

**Do not change** `created.app_name` anywhere — it is a stored field name, not a placeholder
(design Non-goals).

Enumerate the target files first:

```
git grep -ln 'app_name' designs/workflows-module-concept/ designs/workflows-module/ \
  | grep -v _completed | grep -v _rejected
```

Then, in each, distinguish the three cases above from the stored `created.app_name` field
(which stays) before editing.

## Acceptance Criteria

- In the in-scope design docs, `app_name`/`{app_name}` referring to the slug value or its
  position is renamed to `slug`/`{slug}`.
- `created.app_name` is unchanged everywhere.
- No file under `_completed/` or `_rejected/` is modified.

## Files

- `designs/workflows-module-concept/**/*.md` (excl. `_completed/`, `_rejected/`) — modify — prose + snippet + placeholder renames
- `designs/workflows-module/**/*.md` (excl. `_completed/`, `_rejected/`) — modify — same

## Notes

- Independent of all other tasks — no build or code dependency; can run in parallel.
- Skip `review/` subfolders' historical content only if editing them would misrepresent a past
  decision; otherwise prose there may be swept too for consistency. When unsure, prefer
  updating current-facing design prose and leaving verbatim historical review quotes intact.

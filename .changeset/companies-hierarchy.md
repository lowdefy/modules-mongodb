---
"@lowdefy/modules-mongodb-companies": minor
---

Add opt-in parent/child hierarchy to the `companies` module. Companies form a directed acyclic graph (DAG) over a new top-level `parent_ids: string[]` field — each company can have multiple parents and multiple children. Gated by a single `hierarchy.enabled` var (default `false`); when disabled, the module behaves exactly as today and the `parent_ids` field is omitted from new documents.

**What enabling `hierarchy.enabled: true` adds:**

- **Edit form** — a new "Parent {label_plural}" multi-select section appended to the form. Self is filtered out of the options entirely; descendants render as disabled options with a "(child of this company)" suffix so users see why they can't be picked. The selector reads `state.cycle_check_self_id` and `state.cycle_check_ids`, populated by the page's `set_state` action after `get_descendant_company_ids` resolves on mount.
- **View page** — a new "Company Hierarchy" sidebar tile with two stacked sections (Parents above, Children below) rendered as inline anchor links. Empty sections collapse; the whole tile self-hides when there's nothing to show. Soft-deleted parents are filtered out via the `$lookup` sub-pipeline; soft-deleted children are filtered out via the children request.
- **Cycle prevention** — `update-company` runs a `$graphLookup`-based pre-check (walks upward from each candidate parent through `parent_ids`). If self appears anywhere in the ancestor closure, `:reject:` aborts the routine with the message "Selected parents would create a cycle in the company hierarchy." — surfaces to the calling form's `onError` handler.

**New module vars (under `hierarchy`):**

- `enabled` (bool, default `false`) — master flag.
- `parent_label` (string, optional) — override for the parent multi-select label and parents heading.
- `children_label` (string, optional) — override for the children heading.
- `max_depth` (number, default `20`) — defensive cap on every `$graphLookup` in the module's pipelines (descendants resolution + cycle check). Backstops runaway traversal in the unlikely case a cycle leaks past the API check.

**New collection field:** `parent_ids: string[]` (top-level, only emitted when `hierarchy.enabled: true`). No data migration needed — existing companies without the field behave as roots (no parents) under MongoDB multikey index semantics.

**New module exports:**

- `parent_selector` component — `MultipleSelector` wrapper used on the edit form (no own `onMount`; the consuming page sequences the options fetch).
- `tile_hierarchy` component — referenced internally by the view page's sidebar.
- `get_descendant_company_ids` request — shared by edit form (cycle-check exclusion list) and the deferred list filter; reads `_state.filter.parent_scope` with fallback to `_state._id` so one request file serves both consumers.
- `get_company_children` request — direct-children-only multikey `$match` for the view-page tile.

**Cleanup bundled in this release** (verified against `@lowdefy/blocks-antd@4.7.1` schemas):

- Dropped the vestigial `optionConfig` block from `company-selector.yaml` — not in `Selector/schema.json`, not consumed by any plugin in `plugins/`. The schema's option shape (`{ label, value, disabled, ... }`) already matches the projection's output natively.
- Switched `label: <string>` to `title: <string>` on `company-selector.yaml` — `label:` is an object on the antd schema (label-area styling), `title:` is the string-typed displayed label.

**Apps that recommend bumping `@lowdefy/blocks-antd` to >= 5.0** — the new `$lookup` on `get_company.yaml` uses the `localField + foreignField + pipeline` combination (MongoDB 5.0+).

**Out of scope for this release:** hierarchy filter on the list page (`tasks/10-list-filter.md` spec retained for a future implementation when needed); cross-module hierarchy roll-ups (e.g. "all contacts under any descendant of X"); hierarchical permissions; bulk re-parent / drag-and-drop graph editor.

The list filter and the related no-op Atlas Search soft-delete cleanup (`mustNot exists path: removed.timestamp` in `get_all_companies.yaml` and `get_company_excel_data.yaml`) are documented in the design's "Related cleanup" section and remain pending.

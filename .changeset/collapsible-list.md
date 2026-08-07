---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-workflows": minor
---

Add a `CollapsibleList` block and a `collapsible_list` form component. It has the same authoring shape as `controlled_list`, but each row collapses to a one-line summary (the `itemTitle` template) with a chevron to expand it. Collapse state lives in the React block, so nothing extra is written to form state — the row array persists through the normal draft/submit round-trip with no per-row `data` mirror, no `editing` flag, and no per-row Save button. Rows stay mounted while collapsed, so they are still validated and never pruned. By default, collapsing a row validates just that row and re-opens it (showing inline errors) if a required field is missing. `itemTitle` drives both the collapsed edit summary and the read-only item card header, and the component renders identically to `controlled_list` on the view/review/overview surfaces.

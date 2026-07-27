---
"@lowdefy/modules-mongodb-workflows": minor
---

Workflow action pages support an optional wide layout. Setting `page_layout: wide` on a workflow renders all of its action pages — view, edit, review, error, and the per-workflow check page — with the workflow-progress panel on the left, the form expanded to the full width, and the record's Details and History moved into a right-side drawer opened from a header button. Workflows that omit `page_layout` (or set it to `standard`) keep the existing three-column layout unchanged, and an unrecognized value is rejected at build time.

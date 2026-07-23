---
"@lowdefy/modules-mongodb-deals": minor
---

Align the deals module with the sibling entity modules (companies / contacts /
activities) for consistency: add `label` / `label_plural` vars so a host can
relabel the entity (used across the menu, page titles, breadcrumbs, and the
New button); extract the create-form body to a `form_deal` component and the
list action to a `button_new_deal` component; adopt the `content_width` page
var, vertical field labels, and the shared Cancel/Create button conventions on
the create page; align the list "New" and filter "Clear" buttons; and
genericize leftover "sales-pipeline" wording now that the module is
workflow-agnostic.

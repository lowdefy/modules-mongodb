---
"@lowdefy/modules-mongodb-workflows": patch
---

Fix outer-card suppression on the form-action edit/error pages. The templates
dropped the outer form card whenever the first form entry declared a sub-form,
assuming it owned its own card chrome — but only the `section` field renders a
Card. A form led by a `controlled_list` (or `box`/`label`/`file_upload`) thus
rendered with no card, and its comment input fell outside any card. Suppression
now triggers only when the first entry's component is `section`.

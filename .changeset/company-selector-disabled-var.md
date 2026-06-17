---
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-activities": minor
---

Lock linked-company edits on the activity edit page.

- Companies: `company-selector` accepts a new `disabled` var (default `false`) that renders the selector read-only.
- Activities: new `disable_company_edit` var (default `false`). When `true`, the edit page renders the linked-companies selector disabled, so linked companies stay visible but can't be changed after creation. The new page and quick-capture prefill still set companies; detail-page chips and list-table tags are unaffected.

---
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-workflows": patch
---

Add a role-filtered simple contact selector

New `role-contact-selector` contacts component: a Selector (or MultipleSelector
via `mode`) of active contacts scoped to one or more roles (matched against
`apps.<app_name>.roles`), storing a denormalized `{ contact_id, name, email }`
value — object in single mode, array in multiple — so read-only views render it
as a contact (name + link). New `role_contact` and `role_contact_multiple`
workflows form fields wrap the single- and multiple-select cases. A lighter
alternative to the rich contact picker (`contact`) when a form only needs to pick
existing contacts in a given role.

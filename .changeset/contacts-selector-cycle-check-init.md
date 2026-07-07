---
"@lowdefy/modules-mongodb-contacts": patch
---

Fix stable-Lowdefy build failure on the contacts new/edit forms. Both pages
render the company selector (`get_companies_for_selector`), which reads
`state.cycle_check_self_id` / `state.cycle_check_ids`, but neither page
initialised those state keys — so the build failed with 4 `_state`
"no input block with this id exists" errors. Initialise both keys (to `null`
and `[]`, plain-picker defaults) in each page's mount `SetState`, matching the
pattern already used on contacts/view and companies new/edit/view.

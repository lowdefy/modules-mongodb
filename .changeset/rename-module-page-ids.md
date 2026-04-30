---
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-data-upload": minor
"@lowdefy/modules-mongodb-release-notes": minor
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-plugins": patch
---

Rename module pages from entity-prefixed IDs to semantic verbs to remove the redundant URL prefix (e.g. `/companies/companies` → `/companies/all`). Module pages now use `all`, `view`, `edit`, `new` consistently. Cross-module references via `_module.pageId:` and hardcoded scoped page IDs (`{entry-id}/{page-id}`) must be updated to the new IDs.

Page ID changes per module:
- `companies`: `companies` → `all`, `company-detail` → `view`, `company-edit` → `edit`, `company-new` → `new`
- `contacts`: `contacts` → `all`, `contact-detail` → `view`, `contact-edit` → `edit`, `contact-new` → `new`
- `user-admin`: `users` → `all`, `users-view` → `view`, `users-edit` → `edit`, `users-invite` → `new`, `check-invite-email` → `check`
- `user-account`: `profile` → `view`, `edit-profile` → `edit`, `create-profile` → `new` (`login`/`logout`/`verify-email-request` unchanged)
- `data-upload`: `data-upload` → `all`
- `release-notes`: `release-notes` → `view`
- `notifications`: `inbox` → `all` (`link`/`invalid` unchanged)

Plugin defaults updated to match: `SmartDescriptions` now defaults `contactDetailPageId` to `contacts/view` and `companyDetailPageId` to `companies/view`; `EventsTimeline` schema example updated; `DataDescriptions` field-type fallbacks updated.

Also includes two fixes to the contacts new page: removed a duplicate avatar render (the avatar block was included both directly and via `form_profile`), and fixed the post-create redirect that was navigating with a null `_id` because CallAPI return values are accessed at `_actions: <id>.response.response.<field>`, not `.response.<field>`. Same redirect fix applied to the companies new page.

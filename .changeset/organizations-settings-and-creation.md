---
"@lowdefy/modules-mongodb-organizations": minor
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-user-account": patch
---

**`organizations` gains settings pages, an audit log, organization creation and a switch page.** The module now has General, Members, a page per member, Audit log, Billing and Security settings pages on a shared `settings-page` component, plus my-organizations, create-organization (behind `allow_create_organization`), setup and switch-organization pages. See `docs/organizations/`.

What changes for consumers:

- **The module depends on `events`.** Every write logs an organization event, and the audit log and member page read them back. Register the module's `event_types` component in the events module's `event_types` var, and list `organizations` before `events` in `modules.yaml`.
- **The `settings` page is now `general`**, with the logo beside the name. The `default` menu links it.
- **The member modal is gone.** A member row opens the `member` page, whose access form saves authority and app roles together through the new `update-member-access` endpoint. `update-member-roles` and `update-org-role` are removed.
- **New endpoints:** `resend-invitation`, `leave`, `transfer-ownership`, `setup-organization` and `create-organization`. `invite` sets authority and the app's own member fields (`invite_fields`, sent as the invitation's attributes) and re-issues a pending invitation for the same address. `update-organization` sets or clears the logo.
- **`org-switcher` switches through the `switch-organization` page**, which checks the membership and records the organization as the browser's last. `restore-last-organization` returns a person to it from the landing page.
- **New exports:** the `settings-page`, `setup-step`, `member-join`, `restore-last-organization` and `event_types` components, and the `org-events-system` connection (`tenant: shared`, for the left event, change-logging into `log-changes-system`).
- **New vars** for the app's own content: `label`, `label_plural`, `settings_sections`, `settings_requests`, `general_facts`, `member_page_blocks`, `member_page_requests`, `member_page_on_mount`, `setup_steps`, `setup_requests`, `invite_fields`, `invitation_expiry_days`, `remove_confirmation_note`, `leave_confirmation_note`, `my_organizations_note`, `event_display`, `allow_create_organization`, `creator_app_roles`, `settings_back_title`, `settings_back_page_id`. See `docs/organizations/how-to/extend-settings.md`.
- **The members and invitations tables are Lowdefy's `Table` block**, which needs Lowdefy `0.0.0-experimental-20261006081525` or later.
- **`settings-page` passes `shell: { mode: settings, ... }` to the layout's page.** A layout that reads it draws the settings sections in place of the side menu; the layout module in this repo does not yet, so the pages show with the app's usual menu.

The shared members join (`modules/shared/org/members_base.yaml`) keeps one contact per member, so a person matched by both their user id and their email gives one row. This applies to `user-admin`'s and `user-account`'s member reads too.

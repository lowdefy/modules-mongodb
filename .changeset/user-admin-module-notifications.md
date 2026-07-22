---
'@lowdefy/modules-mongodb-user-admin': minor
'@lowdefy/modules-mongodb-layout': patch
---

The user-admin module ships its own invite emails (requires a Lowdefy release with module-level notifications).

**Module-shipped invite templates.** `invite-user` and `resend-user-invite` notification templates now live in the module's `notifications:` section — apps no longer define invite templates or shape invite events in the notifications module's `send_routine`. The invite endpoints dispatch **directly** to `dispatch-notifications` with `_module.notificationId`, shaping the item inline (the recipient is known at invite time). Records carry the scoped type (`user-admin/invite-user`); add those keys to the app's `event_types` enum for inbox badges. Apps that shaped invite events in their own `send_routine` can delete that branch and their app-level invite templates.

**New var `login_page_id`** (default `user-account/login`): the scoped page id the invite email's sign-in button targets, with the invitee's email in the `hint` query param.

**Layout fix for the new framework release:** the `menu` var is now untyped — its default is a runtime `_menu` operator that must pass through to the page block, and the new typed-var validation rejected the unevaluated operator object.

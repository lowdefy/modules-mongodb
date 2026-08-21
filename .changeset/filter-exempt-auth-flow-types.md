---
'@lowdefy/modules-mongodb-notifications': minor
---

Auth-flow emails now reach their actual recipients even when a recipient filter redirects everything else.

**Filter-exempt notification types.** New `filter_exempt_types` var: notification types listed in it bypass the email recipient filter and always deliver to the actual recipient. The module's email connections resolve their `filter` per send against the dispatch payload's `notification_id` — an exempt type folds the filter to null, anything else keeps the configured filter, and a send without a `notification_id` stays filtered (fail-safe). Defaults to the pre-auth invite flows (the same set as `public_link_types`), which are useless when redirected — a redirected invite cannot be actioned by the invitee. Set to an empty list to restore the previous filter-everything behavior. The record's `email_result.to` shows the outcome either way. Apps that remap the email connections own their filter outright; the exemption does not apply there.

**SMTP recipient filter.** New `email.filter` var wires the same recipient filter (`{ replaceAddress, allowlist, regex }`) into the SMTP transport that `sendgrid.filter` provides for SendGrid — the two transports now have filter parity, including the exemption.

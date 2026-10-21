---
"@lowdefy/modules-mongodb-support": minor
---

**support:** the webhook can tell Pelican who your app's active users are. Pelican reads which user ids used an app from its request logs, which name users only by id, and now asks the app for their details with a signed `users.lookup` event naming up to 200 user ids. The webhook answers `{ users: [{ id, email, name }] }` with the email and name from the user record of each id that is a member of your app (your pinned organisation, or any organisation under `tenant`). Anyone else is left out, and nothing else is shared.

It is off by default. Turning it on shares the email and name of the members Pelican asks about:

```yaml
# modules/support/vars.yaml
user_lookup: true
```

Left off, the event answers 404, "This app does not share user details". A malformed lookup answers 422.

Webhook events the module does not know now answer 404 "Unknown event", where they used to answer the 400 a bad ticket delivery gets. Ticket, test and `release.*` deliveries answer as before. Nothing to change in your app unless you want the lookup on.

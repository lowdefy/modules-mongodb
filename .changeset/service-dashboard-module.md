---
"@lowdefy/modules-mongodb-service-dashboard": minor
---

New `service-dashboard` module: a service status page showing the app's report from Pelican (availability against target, incidents, response times, active users, most-used pages and support tickets) for this app and the apps its support app reports on, over the last 30 or 90 days, this month or last month. Top users show only with `top_users: true`, named from the app's own users collection.

It reads Pelican through the support module's connection and key, so set up the `support` module first and set up service status on the deployment's support app in Pelican. To add it:

- Add the module after `support`, with `roles` set to who may see it.
- List `service-dashboard/service-status` under `auth.pages.roles` and `service-dashboard/service-report` under `auth.api.roles`, both with the same roles.
- Add its `default` menu to your menu.

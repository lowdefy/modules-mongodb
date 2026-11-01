---
title: Service dashboard
module: service-dashboard
type: index
concepts: [service-status, availability, pelican, support-app, top-users]
---

# Service dashboard

A service status page for a client app: how available, fast and used the app was, and how its support tickets went, for the users with the roles the app chooses. [Pelican](https://pelican.lowdefy.app) checks the app every 5 minutes, rolls each day up overnight from the app's logs, the checks and its tickets, and serves the report to the app. The page shows one tab per app in the report: the app's own support app and any other support apps it reports on in Pelican.

The module keeps no data of its own. It reads the report from Pelican through the [support](../support/index.md) module's connection, with the support app's key, so the app needs the support module set up first.

## Installing

```yaml
# modules.yaml, after the support entry
- id: service-dashboard
  source: "github:lowdefy/modules-mongodb/modules/service-dashboard@v1.4.1"
  vars:
    roles:
      - admin
      - manager
```

The module needs the `layout` and `support` modules as entries of the app. It has no secrets of its own beyond `MONGODB_URI` for top users: Pelican's address and key are the support module's `pelican_url` and `SUPPORT_PELICAN_KEY`.

In Pelican, the deployment's support app needs service status set up (its address, availability target, the apps it also reports on, and the day monitoring starts). Until then the page reads "No service data yet".

### Who sees it

A module cannot set an app's auth config, so the app lists the page and its endpoint under the same roles as the `roles` var:

```yaml
# lowdefy.yaml
auth:
  pages:
    roles:
      admin:
        - service-dashboard/service-status
      manager:
        - service-dashboard/service-status
  api:
    roles:
      admin:
        - service-dashboard/service-report
      manager:
        - service-dashboard/service-report
```

with `service-dashboard` replaced by the module's entry id when it differs.

- `auth.pages.roles` hides the menu link from everyone else and refuses them the page.
- `auth.api.roles` answers the endpoint 403 to them.
- The endpoint also refuses, with a 400, a user holding none of `roles`, so the data stays gated if an app leaves the endpoint out of `auth.api.roles`.

### Menu

The module exports a `default` menu with one link to the page, titled with the `title` var:

```yaml
links:
  - _ref:
      module: service-dashboard
      menu: default
```

## The page

`/{entry id}/service-status` shows, for the period picked (last 30 days, the default; last 90 days; this month; last month), per app:

- Cards: availability against the target, incidents with their time down and degraded, response time (the daily p95s averaged, weighted by requests) with the error rate, and active users with the weekday average.
- The daily availability strip: each day coloured by its worst 5-minute window. Days before the app's monitoring started, and days with no data, are grey and don't count towards availability.
- Charts of requests and server errors, response time (p95 and median, with the 8-second line past which a window counts as degraded), active users, and support tickets opened and resolved per week with the median time to first reply and to resolve.
- The incidents, newest first, and the most-used pages with their page loads and user-days (each day's users of the page, added up). A page shows as the title of a menu link to it in the app's menus, else as its page id.
- Top users, with `top_users` on.

A period ends yesterday, the last day Pelican has rolled up. Days run midnight to midnight South African time. "Last month" in January is December of the year before.

What the page shows when the report is incomplete:

| Situation                                     | Page                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Pelican's last nightly rollups didn't finish  | A banner naming the last day with data and the days still to come |
| The app has no day rolled up yet              | "No service data yet", and when the first day appears             |
| Pelican answers an error, a 401 or not at all | "Service status can't be loaded right now", with Try again        |
| A user without one of `roles`                 | No menu link; the page and the endpoint are refused               |

A failed call to Pelican is logged as `service_report_unavailable` with the status and Pelican's error code. A 401 there means `SUPPORT_PELICAN_KEY` is wrong or revoked. The rest of the app is unaffected.

## Top users

With `top_users: true` the page lists the 20 users with the most active days in the period, then page loads. Pelican sends only user ids and counts; the module names them from the app's own users collection, matched on `_id` against the session user id:

```yaml
vars:
  roles: [admin]
  top_users: true
  users:
    collection: users
    name_field: name
    company_field: profile.company_name # optional; leave out for no company column
```

A user id not in the collection shows as "Unknown user". Turning `top_users` on without `users.collection` and `users.name_field` fails the build, naming what to set. Decide with the client whether to turn it on: it shows who uses the app most to everyone holding `roles`.

## The endpoint

`service-report` takes `{ period }` (`last_30_days`, `last_90_days`, `this_month` or `last_month`) and posts `{ from, to, top_users }` to Pelican's `/api/endpoints/service-report` from the app's server; the browser never holds the key. It answers `{ ok: true, range, tabs, apps }` with each app shaped for the page, or `{ ok: false, message }` when Pelican did not answer with a report.

## Vars

See [reference/vars.md](reference/vars.md).

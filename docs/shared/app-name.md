---
type: shared
module: shared
title: App slug scoping
concepts:
  - slug
  - _app
  - multi-app
  - scoping
---

# App slug scoping

Multi-app deployments share user, contact, and event collections across apps. Documents are scoped by the app's **slug** so each app sees only the data it owns.

The slug is declared **once**, on the root of the app's `lowdefy.yaml`:

```yaml
# lowdefy.yaml
name: Ops App
slug: ops-app

modules:
  - id: contacts
    source: "github:lowdefy/modules-mongodb/modules/contacts@v0.17.0"
  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.17.0"
```

Modules read it directly with the `_app: slug` operator. No module takes an app-name var — `activities`, `companies`, `contacts`, `deals`, `notifications`, and `workflows` all scope themselves off the app's own slug.

> The `user-account` and `user-admin` modules **do not scope by slug** — they are built on the BetterAuth-based auth engine, where one module instance serves one pinned organization (org = app), so per-app scoping by the `apps.{app}` map is gone. See [`user-account`](../user-account/how-to/migration.md) and [`user-admin`](../user-admin/how-to/migration.md).

## Reading the slug: `_app` and `_build.app`

Two forms exist, and the position decides which one to write:

- **`_app: slug`** — everywhere ordinary: runtime positions (MongoDB filters, change-stamp templates, request payloads, Nunjucks vars) and plain build positions. It evaluates on client, server, and at build.
- **`_build.app: slug`** — only when the operator sits **directly inside a `_build.*` operator's arguments** (e.g. a key fed to `_build.object.fromEntries` or `_build.string.concat`). There, `_app` would still be an unevaluated object when the surrounding `_build.*` operator runs; `_build.app` resolves to a literal string in time.

Referencing an undeclared slug **fails the build** — `_app: slug` is required-when-referenced, so a missing `slug:` on `lowdefy.yaml` is caught at build time rather than writing documents under an empty scope.

## Format: kebab-case, enforced

Lowdefy validates `slug` against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` — lowercase letters and digits, hyphen-separated, starting with a letter. No underscores, no dots, no leading, trailing, or consecutive hyphens. A malformed slug fails the build.

The constraint matters because the slug becomes part of MongoDB field paths. `apps.my.app.is_user` would be parsed as the nested fields `apps → my → app → is_user`, not as a single key `my.app`; kebab-case rules that out mechanically.

## Where the slug appears in stored data

- `created.app_name` on event and notification documents — set by the writing pipeline so reads can filter by app. The **stored field keeps the name `app_name`**; its value is the slug.
- `apps.{slug}.is_user` and `apps.{slug}.roles` on contact documents — per-app user flag and role list.
- `{slug}.title` on event documents — per-app pre-rendered titles, stored at the **top level** of the event document (not nested under a `display` key) — see [Event display](event-display.md).
- `access.{slug}`, `action.{slug}.message`, `action.{slug}.links` on workflow action documents — per-app access gates and rendered action copy.
- `events.display_key` — the events module reads titles back at `{display_key}.title`. It defaults to the app's own slug, so the two match unless you deliberately point one app at another's display strings.

## App display metadata: `_app: name` and `_app: description`

The slug is an identifier, not a label. For page chrome — page titles, footers, email copy — read the app's display metadata from the same operator instead of hardcoding a string:

```yaml
# a page title, instead of repeating the app's display name in the page config
_ref:
  module: layout
  component: page
  vars:
    id: home
    title:
      _app: name
```

`_app: description` reads the app's `description:` the same way. Both are display-only — they never key stored data.

## Multi-app deployments

Each app declares its own slug on its own `lowdefy.yaml`. Nothing else needs setting: every module in that app scopes to that slug automatically, so the apps keep separate contacts, notifications, and event display strings while sharing the underlying `user-contacts`, `notifications`, and `log-events` collections.

The one deliberate cross-app read is the events module's `display_key` var — set it when an app renders event titles written by a different app:

```yaml
# an ops app rendering the CRM app's pre-rendered event titles
- id: events
  vars:
    display_key: crm-app
```

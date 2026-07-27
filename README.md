# Lowdefy modules — MongoDB

A set of reusable [Lowdefy](https://lowdefy.com) modules backed by MongoDB — authentication, user admin, contacts, companies, file attachments, audit events, notifications, and more.

> **Prerelease.** This repo is in a prerelease state (0.x). Breaking changes can land in any minor release. Pin to an exact version or commit SHA in production.

Full documentation: [`docs/`](docs/index.md)

## Quick start

Declare the app's `slug` on the root of your `lowdefy.yaml`, then add modules to the `modules` array, pinning each to a tagged release:

```yaml
name: My App
slug: my-app # kebab-case; modules scope themselves to it via `_app: slug`

modules:
  - id: events
    source: "github:lowdefy/modules-mongodb/modules/events@v0.17.0"

  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout@v0.17.0"

  - id: user-account
    source: "github:lowdefy/modules-mongodb/modules/user-account@v0.17.0"

  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.17.0"
```

The slug is declared once and read by every module that scopes data per app — there is no per-module app-name var. Where a value needs it explicitly, use the operator; the audit stamp's app attribution is the common case (the stored field stays named `app_name`, its value is the slug):

```yaml
- id: events
  source: "github:lowdefy/modules-mongodb/modules/events@v0.17.0"
  vars:
    change_stamp:
      timestamp:
        _date: now
      user:
        name:
          _user: profile.name
        id:
          _user: id
      app_name:
        _app: slug
```

The minimum set for an authenticated app is `layout` + `events` + `user-account` + `notifications`. See [`docs/index.md`](docs/index.md) for the full module list, dependency graph, and "what to use when" guide, and [`docs/shared/app-name.md`](docs/shared/app-name.md) for how the slug scopes stored data.

## Documentation

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the docs front-matter and authoring schema. Release notes live in [`CHANGELOG.md`](CHANGELOG.md).

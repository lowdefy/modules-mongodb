# Lowdefy modules — MongoDB

A set of reusable [Lowdefy](https://lowdefy.com) modules backed by MongoDB — authentication, user admin, contacts, companies, file attachments, audit events, notifications, and more.

> **Prerelease.** This repo is in a prerelease state (0.x). Breaking changes can land in any minor release. Pin to an exact version or commit SHA in production.

Full documentation: [`docs/`](docs/index.md)

## Quick start

Add modules to the `modules` array in your app's `lowdefy.yaml`, pinning each to a tagged release:

```yaml
modules:
  - id: events
    source: "github:lowdefy/modules-mongodb/modules/events@v0.9.2"
    vars:
      display_key: my-app

  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout@v0.9.2"

  - id: user-account
    source: "github:lowdefy/modules-mongodb/modules/user-account@v0.9.2"
    vars:
      app_name: my-app

  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.9.2"
    vars:
      app_name: my-app
```

The minimum set for an authenticated app is `layout` + `events` + `user-account` + `notifications`. See [`docs/index.md`](docs/index.md) for the full module list, dependency graph, and "what to use when" guide.

## Documentation

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the docs front-matter and authoring schema. Release notes live in [`CHANGELOG.md`](CHANGELOG.md).

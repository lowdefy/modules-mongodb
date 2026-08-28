---
title: Lowdefy Modules — MongoDB
module: root
type: index
---

# Lowdefy modules — MongoDB

A set of reusable [Lowdefy](https://lowdefy.com) modules backed by MongoDB. Drop them into a Lowdefy app to get authentication, user admin, contacts, companies, file attachments, audit events, and notifications without writing the YAML for each.

The repo is for app builders who already use Lowdefy and want a curated set of modules that work together — shared change stamps, shared event collection, shared layout — instead of assembling them piece by piece.

> **Prerelease.** This repo is in a prerelease state (0.x). Breaking changes can land in any minor release. Pin to an exact version or commit SHA in production and review the changelog before upgrading.

## Modules

| Module                                              | One-liner                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [layout](../modules/layout/README.md)               | Page wrapper — header, sider, menu, profile, notifications, dark mode, auth pages                           |
| [events](../modules/events/README.md)               | Audit event log — `new-event` API, timeline panel, `change_stamp` template                                  |
| [files](../modules/files/README.md)                 | File attachments backed by S3 — upload, download, file cards, file lists                                    |
| [notifications](../modules/notifications/README.md) | Bell, inbox, deep-link routing, configurable send routine                                                   |
| [user-account](../modules/user-account/README.md)   | Login, email verification, profile view/edit/create                                                         |
| [user-admin](../modules/user-admin/README.md)       | User administration — list, edit, invite                                                                    |
| [contacts](../modules/contacts/README.md)           | Contact management — list, detail, edit, create, selector                                                   |
| [companies](../modules/companies/README.md)         | Company management — list, detail, edit, create, selector                                                   |
| [activities](../modules/activities/README.md)       | CRM activities — calls, meetings, emails logged against contacts and companies                              |
| [ai-assistant](../modules/ai-assistant/README.md)   | Agent chat with persisted, per-user threads — docked corner panel or embedded in a page                     |
| [workflows](../modules/workflows/README.md)         | Multi-workflow engine — declare workflow YAML, render entity action lists, FSM-driven lifecycle transitions |
| [release-notes](../modules/release-notes/README.md) | Render `CHANGELOG.md` as a release-notes page                                                               |
| [ai-reporting](../modules/ai-reporting/README.md)   | AI chat over your data — open query engine, charts, CSV exports, saved reports                              |

## Dependency graph

```mermaid
graph TD
  layout --> user-account
  layout --> notifications
  user-account --> layout
  user-account --> events
  user-admin --> layout
  user-admin --> events
  user-admin --> notifications
  notifications --> layout
  contacts --> layout
  contacts --> events
  contacts --> companies
  contacts --> files
  companies --> layout
  companies --> events
  companies --> contacts
  companies --> files
  files --> layout
  files --> events
  activities --> layout
  activities --> events
  activities --> contacts
  ai-assistant
  workflows --> layout
  workflows --> events
  workflows --> notifications
  release-notes --> layout
  events
  ai-reporting --> layout
```

A few notes on the shape:

- `ai-reporting` depends only on `layout` — every one of its pages renders inside the host app's chrome. It logs no events and needs no other sibling module.
- `events` has no dependencies — every other module either logs events or carries a change stamp, so it sits at the bottom of the graph. `ai-assistant` is the only standalone: it needs an app agent and the plugin package, but no sibling module.
- `layout` depends on `user-account` and `notifications` because the page chrome integrates the profile dropdown and the notification bell. Those modules in turn depend on `layout` for their own pages — the cycle is intentional and resolved at runtime.
- `contacts` and `companies` depend on each other for selectors and bidirectional links. Same story — runtime cycle, by design.
- Dependencies are **not** installed transitively. Declaring `dependencies:` in a manifest tells the build how to wire cross-module references — it does not pull modules in. Every module you use must be added as its own entry in `lowdefy.yaml`. So adding `companies` means also adding entries for `layout`, `events`, `contacts`, and `files` (and their dependencies in turn).

## What to use when

| You need…                                                                   | Add…                                        |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| A login page and a profile page                                             | `layout`, `events`, `user-account`          |
| To invite and manage users                                                  | + `user-admin`, `notifications`             |
| A bell and inbox for in-app messages                                        | + `notifications`                           |
| Contact management with company links                                       | + `contacts`, `companies`, `files`          |
| File attachments on any entity                                              | + `files`                                   |
| To log calls, meetings, and emails against contacts/companies               | + `activities`, `contacts`                  |
| Multi-step business processes (lifecycle, actions, approvals) on any entity | + `workflows`                               |
| An audit log on writes anywhere in the app                                  | + `events` (most other modules already log) |
| A release-notes page from `CHANGELOG.md`                                    | + `release-notes`                           |
| An AI agent chat with persisted threads — docked on every page or in a page | + `ai-assistant` (and an app agent)         |
| To chat to your data and save the answers as navigable reports              | + `ai-reporting`, `layout`                  |

The minimum set for an authenticated app is `layout` + `events` + `user-account` + `notifications`. Everything else is opt-in.

## Using modules in an app

Modules are added to the `modules` array in `lowdefy.yaml`:

```yaml
modules:
  - id: events
    source: "github:lowdefy/modules-mongodb/modules/events@v0.35.0"
    vars:
      display_key: my-app

  - id: layout
    source: "github:lowdefy/modules-mongodb/modules/layout@v0.35.0"
    # Drop logo-{light,dark}-theme.png and logo-square-{light,dark}-theme.png
    # into the app's public/ folder — the layout reads them by convention.

  - id: user-account
    source: "github:lowdefy/modules-mongodb/modules/user-account@v0.35.0"
    vars:
      app_name: my-app

  - id: notifications
    source: "github:lowdefy/modules-mongodb/modules/notifications@v0.35.0"
    vars:
      app_name: my-app
```

Each entry pins a `source` (GitHub ref or local `file:` path), passes `vars`, and optionally remaps `dependencies` and `connections` when entry IDs don't match the names declared in the module manifest. See <https://docs.lowdefy.com/modules> for the full module-system reference.

Each module's `docs/{module}/` folder covers the vars, exports, and worked examples for that module. The [`docs/shared/`](shared/) folder covers the shared patterns (`change_stamp`, soft delete, `event_display`, slot vars, `app_name`, avatar colors, secrets) that most modules use.

## See it in action

`apps/demo/` wires every module together against MongoDB. It's the canonical worked example — match its `vars.yaml` files in `apps/demo/modules/{module}/vars.yaml` for each module's input.

## Plugins

Some modules require [`@lowdefy/modules-mongodb-plugins`](../plugins/modules-mongodb-plugins/README.md), a peer plugin package shipped from this repo with custom blocks (ActionSteps, ContactSelector, DataDescriptions, EventsTimeline, FileManager, FloatingPanel, SmartDescriptions), a `FetchRequest` action, the server-side `WorkflowAPI` connection that powers the `workflows` module engine, and the `AiText` connection behind the `ai-assistant` module's thread titling.

## Versioning

Releases are tagged in this repo. Pin module sources to a specific tag (`@v1.2.0`) — pinning to a branch will pull whatever is on that branch at build time. Release notes live in [`CHANGELOG.md`](../CHANGELOG.md).

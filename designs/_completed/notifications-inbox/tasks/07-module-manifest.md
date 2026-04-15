# Task 7: Update Module Manifest

## Context

All pages, requests, actions, and components are now in place (tasks 01-06). The module manifest (`modules/notifications/module.lowdefy.yaml`) needs to be updated to register the new pages and add the `app_name` var.

Current manifest registers: 1 page (inbox), 1 connection, 1 API, 3 header components, 1 secret, 1 plugin. It has no `vars` section.

The existing `components/unread-count-request.yaml` uses `user_id` in its pipeline but should use `contact_id` (per the design's `contact_id` convention). This should also be updated.

## Task

### 1. Update `module.lowdefy.yaml`

Apply these changes to the existing file:

**Description** — change from:

```yaml
description: Notification dispatch — send-notification API stub
```

to:

```yaml
description: Notification bell, inbox, and deep-link routing
```

**Add vars section** — after `dependencies:` block, before `connections:`:

```yaml
vars:
  app_name:
    type: string
    required: true
    description: >
      App identifier used to scope notifications. Matches created.app_name
      on notification documents.
```

**Add page refs** — change from:

```yaml
pages:
  - _ref: pages/inbox.yaml
```

to:

```yaml
pages:
  - _ref: pages/inbox.yaml
  - _ref: pages/link.yaml
  - _ref: pages/invalid.yaml
```

**Add page exports** — change from:

```yaml
exports:
  pages:
    - id: inbox
      description: Notifications inbox page
```

to:

```yaml
exports:
  pages:
    - id: inbox
      description: Notifications inbox — list, filter, and view notifications
    - id: link
      description: Deep-link handler — routes notification links to target pages
    - id: invalid
      description: Error page for invalid notification links
```

Leave all other sections (connections, api, components, secrets, plugins) unchanged.

### 2. Update `components/unread-count-request.yaml`

Change `user_id` to `contact_id` to match the `contact_id` convention used by all new requests. Also add `app_name` filtering for consistency.

From:

```yaml
id: notifications_unread_count
type: MongoDBAggregation
connectionId:
  _module.connectionId: notifications-collection
properties:
  pipeline:
    - $match:
        read: false
        user_id:
          _user: id
    - $count: total
```

To:

```yaml
id: notifications_unread_count
type: MongoDBAggregation
connectionId:
  _module.connectionId: notifications-collection
payload:
  app_name:
    _module.var: app_name
properties:
  pipeline:
    - $match:
        read: false
        contact_id:
          _user: id
        created.app_name:
          _payload: app_name
    - $count: total
```

### 3. Update `apps/demo/modules.yaml`

Add `vars` to provide the required `app_name` to the notifications module entry:

From:

```yaml
- id: notifications
  source: "file:../../modules/notifications"
```

To:

```yaml
- id: notifications
  source: "file:../../modules/notifications"
  vars:
    app_name: demo
```

### 4. Update `VARS.md`

The existing `modules/notifications/VARS.md` says "This module has no vars." Update it to document the new `app_name` var:

```markdown
# Notifications — Vars

| Var        | Type   | Required | Description                                                                                       |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------------------------- |
| `app_name` | string | yes      | App identifier used to scope notifications. Matches `created.app_name` on notification documents. |
```

## Acceptance Criteria

- `VARS.md` documents the `app_name` var
- `module.lowdefy.yaml` has updated description
- `vars.app_name` is defined as required string
- `pages` section refs all three pages: inbox, link, invalid
- `exports.pages` lists all three pages with descriptions
- Inbox export description is updated (not the old "Notifications inbox page")
- All other manifest sections (connections, api, components, secrets, plugins) are unchanged
- `components/unread-count-request.yaml` uses `contact_id` instead of `user_id`
- `components/unread-count-request.yaml` filters by `created.app_name` via payload
- `apps/demo/modules.yaml` includes `vars: { app_name: demo }` for the notifications module
- All files are valid YAML

## Files

- `modules/notifications/module.lowdefy.yaml` — modify — add vars, pages, exports
- `modules/notifications/components/unread-count-request.yaml` — modify — change user_id to contact_id, add app_name filter
- `apps/demo/modules.yaml` — modify — add app_name var to notifications module entry
- `modules/notifications/VARS.md` — modify — document app_name var

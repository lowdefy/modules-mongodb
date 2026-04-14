# Notification Send API — Module-Exported Dispatch Endpoint

## Problem

Modules like `user-admin` need to send notifications after business events (invite user, resend invite, etc.). Currently they call `notifications:send-notification`, which is a stub that returns `{ success: true }`. The actual notification dispatch happens through a custom AWS Lambda service that the consuming app calls directly — this Lambda integration is app-specific and doesn't belong in the notifications module.

We need the notifications module to export a proper `send-notification` API whose implementation is injected by the consuming app. Calling modules remain unaware of how notifications are dispatched — they just call the API with `event_ids`.

## Current State

### Notifications module API (stub)

```yaml
# modules/notifications/api/send-notification.yaml
id: send-notification
type: InternalApi
routine:
  - :return:
      success: true
```

### User-admin calls it via cross-module reference

```yaml
# modules/user-admin/api/invite-user.yaml (line 208-217)
- id: send-notification
  type: CallApi
  properties:
    endpointId:
      _module.endpointId:
        id: send-notification
        module: notifications
    payload:
      event_ids:
        - _step: new-event.eventId
```

### Demo app's actual Lambda dispatch (currently separate)

Connection:

```yaml
- id: consume_notifications
  type: AxiosHttp
  properties:
    method: post
    baseURL:
      _string.concat:
        - _secret: SERVICES_API_URL
        - /api/consume-notifications
    headers:
      x-api-key:
        _secret: SERVICES_API_KEY
```

Request:

```yaml
# prp shared notifications request
id: { { id } }
type: AxiosHttp
connectionId: consume_notifications
payload:
  event_ids:
    _var: event_ids
properties:
  data:
    ids:
      _payload: event_ids
```

## Solution

Replace the stub routine with a `_module.var` that lets the consuming app inject the dispatch implementation. The routine's connection is declared at app scope — once the app is built there are no module scopes, so the routine can reference any connection by its raw ID.

### 1. Update `api/send-notification.yaml`

```yaml
id: send-notification
type: InternalApi
routine:
  _module.var:
    key: send_routine
    default: []
```

- **Default `[]`** — empty routine, no-op. Safe for apps that don't need dispatch (or haven't configured it yet).
- The routine receives `event_ids` in the payload (existing contract from `user-admin`).

### 2. Declare `send_routine` var in module manifest

Add to `modules/notifications/module.lowdefy.yaml` vars section:

```yaml
vars:
  app_name:
    type: string
    required: true
    description: >
      App identifier used to scope notifications. Matches created.app_name
      on notification documents.
  send_routine:
    type: array
    description: >
      API routine steps for dispatching notifications. Receives event_ids
      in the payload. Default is an empty routine (no-op).
```

### 3. Demo app provides the Lambda dispatch routine

```yaml
# apps/demo/modules.yaml — notifications entry
- id: notifications
  source: "file:../../modules/notifications"
  vars:
    app_name: demo
    send_routine:
      _ref: modules/notifications/send-routine.yaml
```

### 4. App-level routine file

```yaml
# apps/demo/modules/notifications/send-routine.yaml
- id: create-notifications
  type: AxiosHttp
  connectionId: consume-notifications
  payload:
    event_ids:
      _payload: event_ids
  properties:
    data:
      ids:
        _payload: event_ids
```

The `connectionId: consume-notifications` is a raw string referencing a connection declared at app scope. After build, all IDs are flat — no module scoping applies to raw strings.

### 5. App-level connection

Declared in the app's connections (not in the notifications module):

```yaml
# apps/demo/connections/ or lowdefy.yaml connections section
- id: consume-notifications
  type: AxiosHttp
  properties:
    method: post
    baseURL:
      _string.concat:
        - _secret: SERVICES_API_URL
        - /api/consume-notifications
    headers:
      x-api-key:
        _secret: SERVICES_API_KEY
```

### No Changes Required

- **User-admin module** — already calls `notifications:send-notification` with `event_ids` payload. No changes needed.
- **Resend-invite API** — same pattern, no changes.
- **Notification inbox/link pages** — read-side, unaffected.

## Key Decisions

| Decision             | Choice                       | Rationale                                                                                                                                     |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Override mechanism   | `_module.var` on routine     | Simplest Lowdefy pattern. App injects the full routine array. Module stays implementation-agnostic.                                           |
| Default behaviour    | Empty array `[]`             | Safe no-op. Modules can call send-notification without errors even when no dispatch is configured.                                            |
| Connection ownership | App scope, raw ID            | After build there are no module scopes. The routine references the app's connection by raw ID. No need to inject connections into the module. |
| Payload contract     | `event_ids` array in payload | Already established by user-admin's existing CallApi calls. No change needed.                                                                 |
| Secrets              | App scope                    | `SERVICES_API_URL` and `SERVICES_API_KEY` belong to the app's connection. The notification module doesn't need to know about them.            |

## Files Changed

| File                                                 | Change                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| `modules/notifications/module.lowdefy.yaml`          | Add `send_routine` var                           |
| `modules/notifications/api/send-notification.yaml`   | Replace stub routine with `_module.var`          |
| `apps/demo/modules.yaml`                            | Add `send_routine` var to notifications entry    |
| `apps/demo/modules/notifications/send-routine.yaml` | **New** — Lambda dispatch routine                |
| App connections                                      | Add `consume-notifications` AxiosHttp connection |

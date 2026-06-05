# Task 1: Wire `global.enums.event_types` and add the `action-approve` enum entry

## Context

The demo app (`apps/demo/lowdefy.yaml`) has **no `global:` section**. Several notifications-module surfaces read `global.enums.event_types` and degrade silently when it's missing:

- The inbox card type chip (`modules/notifications/components/list-notifications.yaml:70-78`) looks up `_global: enums.event_types.{event_type}` via `_string.concat` and renders nothing when the lookup is undefined.
- The view-panel header does the same lookup.
- The inbox type-filter options (`modules/notifications/actions/set-types.yaml`) are built by intersecting `lowdefyGlobal('enums.event_types')` keys with the distinct `event_type` values in the user's notifications — with no global, the dropdown is empty today.

The events module exports a composed `event_types` component (`modules/events/module.lowdefy.yaml:63-67`):

```yaml
- id: event_types
  component:
    _build.object.assign:
      - _ref: ../shared/enums/event_types.yaml
      - _module.var: event_types
```

`modules/shared/enums/event_types.yaml` composes the per-module enum files (user-admin, user-account, contacts, companies, activities) — so `invite-user` and `resend-user-invite` entries **already exist** in the composed component (from `modules/user-admin/enums/event_types.yaml`). The `_module.var: event_types` layer is the demo's app additions, wired in `apps/demo/modules/events/vars.yaml:6-7` to `apps/demo/modules/events/event_types.yaml`, which currently holds only `create-lead` and `start-onboarding`.

The only handled event type with no enum entry anywhere is `action-approve` (the workflow engine's approve event, emitted when the demo onboarding `send-quote` action is approved).

## Task

1. **Add a `global:` block to `apps/demo/lowdefy.yaml`** (top level, e.g. after the `config:` section):

   ```yaml
   global:
     enums:
       event_types:
         _ref:
           module: events
           component: event_types
   ```

   `events` is the module entry id in `apps/demo/modules.yaml`; this is the standard cross-module component `_ref` form.

2. **Add an `action-approve` entry to `apps/demo/modules/events/event_types.yaml`**, matching the existing entry shape (hex `color`, `title`, `AiOutline*` `icon`):

   ```yaml
   action-approve:
     color: "#52c41a"
     title: Action Approved
     icon: AiOutlineCheckCircle
   ```

   Exact color/title/icon values are a style choice — keep them consistent with the existing entries (`create-lead` uses `#1890ff`, `start-onboarding` uses `#7c3aed`; green reads as "approved").

Do **not** add `invite-user` / `resend-user-invite` entries — they already arrive via the composed component, and duplicating them app-side would shadow the module-owned values.

## Acceptance Criteria

- Demo app builds cleanly (`pnpm` build for `apps/demo`).
- The built config's `global.enums.event_types` contains (at least) `action-approve`, `invite-user`, `resend-user-invite`, `create-lead`, `start-onboarding`, plus the other composed module entries.
- The inbox type-filter dropdown logic (`set-types.yaml`) now has a non-empty enum map to intersect against (end-to-end chip/filter rendering is asserted in tasks 2-3 once notification docs exist).
- The events timeline still renders as before (it composes its own map independently; no conflict).

## Files

- `apps/demo/lowdefy.yaml` — modify — add the `global.enums.event_types` block.
- `apps/demo/modules/events/event_types.yaml` — modify — add the `action-approve` entry.

## Notes

- This task is independent of tasks 2-3 and can run in parallel with task 2, but tasks 2-3's chip/filter acceptance checks assume it has landed.
- The global is also what makes the link/view surfaces' type chips render for invite notifications — no additional wiring needed there.

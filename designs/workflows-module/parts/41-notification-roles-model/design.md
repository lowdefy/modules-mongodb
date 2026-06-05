# Part 41 — Notification-roles model (rethink)

**Status: STUB — not yet designed.** This part captures the problem and the verified current state so a future rethink starts informed. It is deliberately deferred out of [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) (already XL) and supersedes the consumer story implied by [Part 34 D9](../_completed/34-action-access-model/design.md).

**Layer:** action grammar + engine event-dispatch + notifications module. **Size:** TBD. **Repo:** `modules/workflows/`, `modules/notifications/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Why a rethink

`notification_roles` is an authored config field that lives at the action root ([Part 34 D9](../_completed/34-action-access-model/design.md)) and is meant to drive notification **fan-out** — who gets notified when an action transitions. The whole model is up for reconsideration: role-based fan-out may not be the right primitive, the consumer contract is unclear, and the field is currently inert.

## Verified current state (2026-06)

- **`notification_roles` is read or written nowhere** in the plugin `src`, the `modules/workflows` resolvers, or the demo app (grep-confirmed). It is authored-but-inert.
- The engine event path — `buildDefaultLogEventPayload` → `dispatchLogEvent` → `dispatchNotifications` — does **not** propagate `notification_roles` onto the event. The event carries `references: { workflow_ids, action_ids, <entity ref> }` and `metadata: { workflow_type, interaction, status_before, status_after, comment? }` only.
- `dispatchNotifications` calls the notifications module's `send-notification` with **`event_ids` only**; the consuming app's `send_routine` re-fetches the event doc and decides recipients.
- [Part 34 Q3](../_completed/34-action-access-model/design.md) previously claimed `getActionFields.js:14` reads `config.access?.notification_roles` — **factually false** (that file is a fixed field projection). Corrected there.

The reference implementation (per recollection) wrote `notification_roles` onto the event doc so the notification service consumed it from there. This module never replicated that — so there is no behaviour to "restore," and the right move is to design the model fresh rather than bolt the old shape onto the new event path.

## Open questions for the rethink

1. **Is role-based fan-out the right primitive at all** — or explicit recipients, or a subscription model owned by the notifications module (Part 8)?
2. **Who consumes it, and from where** — engine writes it onto the event (`references` vs `metadata`)? Denormalised onto the action doc? Read directly from config by `send_routine`?
3. **Engine vs notifications-module ownership** — does the engine propagate recipient hints, or is fan-out fully the notifications module's concern (the current delegation to `send_routine`)?
4. **Per-app fan-out** — Part 34 D9 kept it a flat list and deferred per-app scoping to v1.x; revisit here.
5. **Relationship to the notifications subscription config** (`modules/notifications`) — overlap, precedence, or replacement.

## Until this lands

`notification_roles` stays authored config with no engine consumer; no role-based fan-out happens. Apps that need notifications wire recipients through the notifications module's `send_routine` reading the event doc, as today.

## Related

- [Part 34 — Action access model § D9](../_completed/34-action-access-model/design.md) — current root placement; consumer story revisited here.
- [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) — scopes `notification_roles` wiring out (Non-goals); rebuilds the event-dispatch path this part would hook into.
- [Part 8 — side-effect dispatch](../_completed/08-side-effect-dispatch/design.md) and `modules/notifications` — the fan-out / subscription system that ultimately consumes recipients.

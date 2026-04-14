# Review 2 — State Binding and Cross-Design Coordination

## State Binding

### 1. ButtonSelector `filter_type` id doesn't bind to `filter.type` state path

> **Resolved.** Changed `id: filter_type` to `id: filter.type` in design.md and tasks/05-inbox-page.md. example confirms `filter.type` (dot notation) is the correct pattern.

The inbox page initializes state with nested `filter.type` (design line 186-188):

```yaml
filter:
  type: Unread
```

Requests read this via `_payload: filter.type` (from `_state: filter` in the payload at design line 825-826). The title template reads `_state: filter.type` (design line 238-239).

But the ButtonSelector has `id: filter_type` (underscore, design line 267). In Lowdefy, input blocks bind to state at their `id` path. `filter_type` writes to `state.filter_type` (a flat top-level key), not `state.filter.type` (nested under the `filter` object). The two other filter controls — `filter.dates` (line 584) and `filter.status` (line 594) — correctly use dot notation.

Result: clicking "Read" / "Unread" does nothing. The ButtonSelector updates `state.filter_type` which no request reads. `state.filter.type` stays "Unread" forever. The title, query filter, and notification-types request all continue using the stale initial value.

example confirms the correct pattern — example's ButtonSelector uses `id: filter.type` (dot notation) at `apps/shared/notifications/notifications-view.yaml:104`.

**Fix:** Change `id: filter_type` to `id: filter.type` on line 267. This also needs propagation to `tasks/05-inbox-page.md`.

## Cross-Design Coordination

### 2. Module manifest conflicts with notification-header-badge design

> **Resolved.** Removed `notification-on-click` from the manifest's component and export sections. The header-badge design is currently being implemented, so `notification-on-click` will be gone before inbox implementation starts.

The inbox design's module manifest (lines 104-151) shows the full target manifest including `notification-on-click` as a component and export (lines 133-142):

```yaml
components:
  - id: notification-on-click
    component:
      _ref: components/notification-on-click.yaml
```

The `notification-header-badge` design (`designs/notification-header-badge/design.md`) deletes this file and removes the component + export from the manifest. These designs modify the same manifest section with opposing intent.

If notification-header-badge is implemented first, the inbox design's manifest section is stale — an implementer following it literally would re-add the deleted component. If inbox is implemented first, the manifest is correct but the header-badge tasks need to account for the inbox's additional manifest changes (new pages, vars, exports).

**Fix:** Either:

- (a) Add a note to the inbox design's manifest section: "The `notification-on-click` component and export are removed by the notification-header-badge design. If that design is implemented first, omit these entries."
- (b) Specify implementation order between the two designs and adjust the later design's manifest to reflect the earlier one's changes.

## Module Contract

### 3. Runtime dependency on `enums.event_types` global not declared

> **Resolved.** Expanded the "Event types from global state" key decision to document the full convention (module enum files → shared assembly → app global → consumer modules). Added note that the events module `VARS.md` should document this consumer convention.

The `set-types.yaml` action (line 1087-1098) calls `lowdefyGlobal('enums.event_types')` to map event type keys to display labels and colors. The `list-notifications.yaml` and `view-notification.yaml` components read `_global: enums.event_types.{key}` for status badges (lines 431-434, 503-509).

This data comes from `modules/shared/enums/event_types.yaml`, which assembles event types from user-admin, user-account, companies, and contacts modules. The app must wire the shared module and populate `enums.event_types` in global state for the filter and badges to work.

But the module manifest's `dependencies` (line 88-90) only lists `layout`:

```yaml
dependencies:
  - id: layout
```

If an app uses the notifications module without the shared/events module, the event type filter silently shows empty options and all status badges render blank. No build error signals the problem.

**Fix:** Either:

- (a) Add a soft dependency or documented requirement: `{ id: shared, description: "Provides enums.event_types global for filter options and status badges", optional: true }`
- (b) Add a note in the module manifest's `vars` section documenting the `enums.event_types` global convention, so apps know to provide it.

### 4. `VARS.md` states "This module has no vars" — contradicts `app_name` addition

> **Resolved.** Added section 4 to task 07: update `VARS.md` to document the `app_name` var.

The existing `modules/notifications/VARS.md` says "This module has no vars." The design adds a required `app_name` var (lines 94-99). No task covers updating `VARS.md`.

**Fix:** Add updating `VARS.md` to task 07 (module manifest), or delete the file if vars are fully described in `module.lowdefy.yaml`.

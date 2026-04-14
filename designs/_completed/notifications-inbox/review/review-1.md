# Review 1 — Correctness and Completeness

## Security

### 1. `update-selected-notification` missing ownership filter

> **Resolved.** Added `contact_id: _user: id` and `created.app_name: _payload: app_name` to the update filter, plus `app_name` to the payload.

`update-selected-notification.yaml` filters only by `_id` (design line 939). Any authenticated user who knows a notification's `_id` could mark another user's notification as read. The inbox request `get-selected-notification.yaml` correctly validates `contact_id` ownership (line 893), but the write request does not.

example has the same gap (`apps/shared/notifications/requests/update_selected_notification.yaml:9-11`), so this is inherited behavior — but worth fixing in the demo version.

**Fix:** Add `contact_id` and `app_name` to the update filter:

```yaml
properties:
  disableNoMatchError: true
  filter:
    _id:
      _payload: selected_id
    contact_id:
      _user: id
    created.app_name:
      _payload: app_name
```

And add `app_name` to the payload.

## Data Model

### 2. `link` (singular) vs `links` (plural) field name

> **Resolved.** Demo shares example app's notification backend. Updated schema to `links` (plural) with `links.button` as the default key. Link page reads now use `links.button.pageId` / `urlQuery` / `input`. Key Decisions updated to reflect hardcoded `links.button` instead of the dynamic `_url_query: option` path.

The design schema (line 31) defines a singular `link` field:

```
link: { pageId, urlQuery, input }
```

example notifications use `links` (plural) — a multi-option map keyed by `_url_query: option` (e.g., `links.button.pageId`, `links.{action_id}.pageId`). See `example/apps/shared/notifications/notifications-link.yaml:160`.

The design's Key Decisions section (line 1140) explicitly simplifies this. But the notification documents are created by the backend (Lambda `consumeNotifications` in example). If demo shares the same notification generation pipeline, documents will have `links` not `link`, and all the link page reads (`get_notification_for_link.0.link.pageId` at design line 697) will return null.

**Fix:** Either:

- (a) Confirm demo uses a separate notification generation path that writes `link` (singular), and document this in the design.
- (b) Change the schema and link page reads to use `links.button` (matching example's default option key), or accept a `link_option` module var / URL query param for the key.

### 3. `event_type` vs `type` for invite check on link page

> **Rejected.** Demo intentionally uses `event_type` for the invite check, not example's `type`. Both fields exist on notification documents (`type` = template identifier, `event_type` = business event), but demo standardizes on `event_type` for all UI and logic. Added `type` to the schema for completeness but the design does not reference it.

example's link page checks the `type` field for invite detection (`get_notification_type.0.type == "team-invite-notify-user"` at example link page line 67-68). The design checks `event_type` (`get_notification_type_for_link.0.event_type == "invite-user"` at design line 634-635).

example notifications have both fields — `event_type` (category like "insert-ticket") and `type` (specific like "team-invite-notify-user"). The design schema (lines 18-36) only shows `event_type`.

If demo notifications follow example's document shape, the link page's `$project: { event_type: 1 }` stage (design line 731) projects the wrong field, and the `invite-user` check fails silently — all invite links would redirect to login.

**Fix:** Clarify whether demo notifications use a single `event_type` field or example's dual `event_type` + `type` fields. If dual, the link page type check and projection need to target `type`, not `event_type`.

## Missing Task Coverage

### 4. `unread-count-request.yaml` update not in any task

> **Resolved.** Added `unread-count-request.yaml` update to task 01 (requests and stages): change `user_id` to `contact_id`, add `created.app_name` filter.

The existing `unread-count-request.yaml` (`modules/notifications/components/unread-count-request.yaml`) has two issues:

- Uses `user_id` instead of `contact_id` (line 9) — the design's Key Decisions (line 1130) acknowledges this needs fixing
- Missing `created.app_name` filter — every other query in the design filters by `app_name`

No task file covers updating this component. Since it already uses `_module.connectionId`, it should also be able to use `_module.var: app_name`.

**Fix:** Add a step to task 02 (requests) or create a dedicated task to update `unread-count-request.yaml`:

```yaml
pipeline:
  - $match:
      read: false
      contact_id:
        _user: id
      created.app_name:
        _module.var: app_name
  - $count: total
```

### 5. App wiring update not in any task

> **Resolved.** Updated App Wiring section to show `vars: { app_name: demo }`. Added app wiring step to task 06 (module manifest).

Adding `app_name` as a required var (design line 93-97) means `apps/demo/modules.yaml` must be updated to provide it. The current entry (line 3 of the app's modules.yaml) has no `vars`:

```yaml
- id: notifications
  source: "file:../../modules/notifications"
```

No task covers adding `vars: { app_name: "demo" }` (or whatever the app's identifier is). The build would fail on a required var with no value.

**Fix:** Add to task 07 (module manifest): update `apps/demo/modules.yaml` to include the `app_name` var.

## Logic

### 6. Invite-user link flow for unauthenticated users

> **Resolved.** Confirmed as a real bug in example (unauthenticated invite users land on invalid page instead of login). Fixed with a single-request approach: `get-notification-for-link` uses `$or` match (`event_type: invite-user` OR `contact_id` ownership). Invite-user notifications navigate directly to the notification's link target (login page with email hint). Removed `get-notification-type-for-link` (no longer needed).

The link page skips login redirect for `invite-user` types (design line 629-635) and skips `break_no_user` (design line 647-650). But `get-notification-for-link` still filters by `contact_id: _user: id` (design line 751-752). For an unauthenticated user, `_user: id` is null — the query returns empty, and the user is redirected to the invalid page.

example has the same pattern (example link page lines 38-39, 84-91). This may work in example because invite emails link to signup pages directly rather than the notification link page, or because the invite flow always routes through login first via another mechanism.

If invite links in demo are expected to work for unauthenticated users (as the design suggests at line 1136: "the recipient may not have an account yet"), the flow is broken.

**Fix:** Either:

- (a) Add an unauthenticated fetch path for invite-user types that skips `contact_id` filtering and navigates directly using the notification's link data.
- (b) Document that invite links always route through login first (the callback URL will bring the user back after auth), making the "skip login" behavior only relevant for already-authenticated users who happen to click an invite link.

## Naming

### 7. `match-filter-type.yaml` name is misleading

> **Resolved.** Renamed to `match-filter-read-status.yaml` throughout the design.

`match-filter-type.yaml` filters by **read/unread status** (design lines 996-1015), not by event type. Meanwhile `match-filter.yaml` handles both **date range** and **event type** filtering (lines 951-989). The suffix `-type` suggests event type filtering, creating confusion about which stage does what.

**Fix:** Rename to `match-filter-read-status.yaml` or `match-filter-read.yaml`.

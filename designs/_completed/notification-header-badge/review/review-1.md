# Review 1 — Source Verification and Cross-Design Coordination

## Cross-Design Conflict

### 1. Notifications-inbox design manifest still includes `notification-on-click`

> **Rejected.** The notifications-inbox design will be updated in its own review cycle. Header-badge is implemented first; the inbox design's stale references will be caught when that design is reviewed or implemented.

The `designs/notifications-inbox/design.md` module manifest section (lines 122–142) lists `notification-on-click` in both `exports.components` and `components`. That design's "Changes from current manifest" section only adds `app_name`, new pages, and an updated description — it intentionally leaves `notification-on-click` untouched.

This creates an ordering problem:

- **Inbox first, then header-badge:** Works. Inbox doesn't modify `notification-on-click`, header-badge removes it afterward.
- **Header-badge first, then inbox:** Problem. The inbox design's manifest section shows `notification-on-click` present. An implementer following that manifest literally would re-add the deleted component and export.

Since header-badge fixes a broken API (bell click does nothing without `link`), it should ship first. **Fix:** Update the notifications-inbox design's manifest section to remove `notification-on-click` from both `exports.components` and `components`, and update the `notification-config` export description to include "and inbox link". Also update task `04-components.md` line 5, which lists `notification-on-click` as one of three existing components.

## Verified Claims

All factual claims in the design were verified against source:

- `notification-config.yaml` has only `count` and `icon` — confirmed (`modules/notifications/components/notification-config.yaml`).
- `notification-on-click.yaml` contains a Link action with `_module.pageId: inbox` — confirmed (`modules/notifications/components/notification-on-click.yaml`).
- `module.lowdefy.yaml` has both `notification-on-click` in components (line 39) and exports (lines 26–27) — confirmed.
- `page.yaml` has `onNotificationClick` event block at lines 107–119, refs `notification-on-click` — confirmed.
- `page.yaml` wires `notification-config` into `properties.notifications` at lines 55–66 via `_ref` — adding `link` to the config object will flow through without layout changes. Confirmed.
- `header_extra` description mentions `compact` and `mobile_extra` (line 21 of layout `module.lowdefy.yaml`) — neither key is used anywhere in code. Only `header_extra.requests` (page.yaml:85) and `header_extra.blocks` (page.yaml:124) are referenced. Cleanup is valid.
- `onNotificationClick` is only consumed in `page.yaml` — no other files reference it. Safe to remove.
- `notification-on-click` is only referenced by its own module manifest and the layout `page.yaml` — no other consumers.

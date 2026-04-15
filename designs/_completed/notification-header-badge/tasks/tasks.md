# Implementation Tasks — Notification Header Badge

## Overview

Migrate the notification bell from event-driven click handling (`onNotificationClick`) to property-driven navigation (`notifications.link`), matching the updated `PageHeaderMenu` API. Derived from `designs/notification-header-badge/design.md`.

## Tasks

| #   | File                               | Summary                                                    | Depends On |
| --- | ---------------------------------- | ---------------------------------------------------------- | ---------- |
| 1   | `01-notification-link-property.md` | Add link to notification-config, remove dead event handler | —          |

## Ordering Rationale

Single task. All five file changes are interdependent — the notifications module manifest references `notification-on-click`, the layout `page.yaml` refs that export, and the config component absorbs its behavior. These must change together to keep the build valid.

## Scope

**Source:** `designs/notification-header-badge/design.md`
**Context files considered:** None (no supporting files)
**Review files skipped:** None

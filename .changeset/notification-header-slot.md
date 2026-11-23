---
"@lowdefy/modules-mongodb-notifications": minor
---

**Apps can put their own blocks in the header of an opened notification.** The inbox's reading pane gave an app no place for a button that acts on the record a notification is about. The new `components.notification_header_slots` var renders blocks after the notification's title and before Mark as unread, for every opened notification.

The blocks read the open notification from `_request: get_selected_notification.0`, the whole stored record (`_id`, `type`, `data`, `created`, `read`). Hide them per type or per data with `visible` on your blocks:

```yaml
components:
  notification_header_slots:
    - id: button_open_ticket
      type: Button
      visible:
        _eq:
          - _request: get_selected_notification.0.type
          - _module.notificationId:
              id: support-reply
              module: support
      properties:
        title: Open ticket
      events:
        onClick:
          - id: link_ticket
            type: Link
            params:
              pageId:
                _module.pageId:
                  id: ticket
                  module: support
              pathParams:
                ticket_key:
                  _request: get_selected_notification.0.data.ticket_key
```

Without the var the header renders as before. Nothing to change on upgrade.

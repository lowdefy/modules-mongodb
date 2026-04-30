# Notifications

How to wire up the notifications module, create notification types, and trigger notifications from API routines.

## Pattern

The notification system spans three layers: a **Lowdefy module** (inbox UI, bell badge, deep-link routing), a **Lambda pipeline** (consume + send), and **notification configs** (paired YAML + JS files per notification type). Each layer is independently customizable.

**Module layer**: The `notifications` module provides inbox, bell badge, and deep-link pages. It requires two module vars: `app_name` (string — scopes notifications to the current app) and `send_routine` (array — API routine steps for dispatching). The module exports pages (`inbox`, `link`, `invalid`), a `notification-config` component (bell badge for PageHeaderMenu), an `unread-count-request` (aggregation for badge count), and the `send-notification` API endpoint.

**Lambda layer**: Two Lambda functions process notifications. **consumeNotifications** receives event IDs via HTTP POST, looks up the event type in a `jobs` map, runs each matching notification template (which determines recipients via a MongoDB aggregation pipeline and renders email content via React), creates notification documents in MongoDB, and queues emails to SQS. **sendNotifications** is an SQS consumer that sends emails via SendGrid. The SQS queue is FIFO with a dead-letter queue (3 retries, 14-day retention).

**Notification configs** are paired files: a `.yaml` file defining the MongoDB pipeline that determines recipients and projects data, and a `.js` file defining the React email template and test data. Each config is registered in the consumeNotifications handler's `jobs` map under an event type key. One event type can trigger multiple configs (e.g., `insert-ticket` notifies author, team subscribers, and support subscribers).

**Triggering flow**: An API routine creates an event, then calls the notifications module's `send-notification` endpoint with `event_ids`. The app's `send_routine` (configured via module var) forwards the IDs to the consume-notifications Lambda via AxiosHttp. The Lambda processes each event ID against matching notification configs.

## Data Flow

```
App API routine (e.g., invite-user, create-contact)
  → Creates event in events collection (via events module CallApi)
  → Calls send-notification endpoint with event_ids
  → send_routine (AxiosHttp) POSTs to /api/consume-notifications Lambda
  → consumeNotifications looks up event type in jobs map
  → For each matching config:
      → Runs YAML pipeline against events collection (determines recipients, projects data/links)
      → Each $unwind on notification_contacts produces one notification per recipient
      → Creates notification doc in MongoDB { contact_id, event_type, title, description, body, links, read: false, send_email, priority }
      → Queues email to SQS (FIFO) with rendered React template
  → sendNotifications (SQS consumer) sends email via SendGrid
  → User sees notification in inbox (filtered by contact_id + app_name)
  → Bell badge shows unread count
  → Email contains deep-link button → link page marks as read → redirects to target page
```

## Variations

**Simple notification** — single recipient, single app. The YAML pipeline matches the event, looks up one contact, projects minimal data:

```yaml
# config/exampleEventNotifyRecipient.yaml
type: "example_event"
title: "Example Event Notification"
send_email: true
priority: 50
pipeline:
  - $match:
      _id: $recordId
  - $lookup:
      from: user_contacts
      localField: contact_id
      foreignField: _id
      as: notification_contacts
  - $unwind: $notification_contacts
  - $project:
      contact: $notification_contacts
      created: 1
      data:
        title: $title
      links:
        button:
          pageId: { target-page }
          urlQuery:
            _id: $_id
```

**Multi-recipient notification** — one event notifies multiple user groups. Register multiple configs under the same job key. Each config has its own pipeline that determines a different recipient set (e.g., author vs subscribers vs managers):

```js
// handler.js jobs map
jobs: {
  "insert-ticket": [
    TicketInsertedNotifyTeamSubscribers,
    TicketInsertedNotifyAuthor,
    TicketInsertedNotifySupportSubscribers,
  ],
}
```

**Multi-app notification** — the same event creates notifications for different apps. Each config YAML sets `app_name` to scope which app's inbox shows it. The recipient pipeline filters contacts by the target app's `apps.{app_name}.is_user` flag:

```yaml
# In the pipeline's $lookup for notification_contacts:
- $match:
    $expr:
      $and:
        - $eq: [$apps.{app_name}.is_user, true]
        - $ne: [$apps.{app_name}.disabled, true]
```

**Scheduled notifications** — triggered by cron instead of user actions. The Lambda config is the same; only the trigger source differs (EventBridge schedule instead of HTTP POST from app).

## Anti-patterns

- **Don't create notification documents directly from Lowdefy** — always go through the Lambda pipeline. The Lambda handles email rendering, SQS queueing, recipient resolution, and environment-specific link rewriting.
- **Don't hardcode URLs in notification config links** — use `pageId` + `urlQuery` objects. The Lambda rewrites these to full URLs using the app's environment domain config.
- **Don't forget `$unwind: $notification_contacts`** — the pipeline must produce one document per recipient. Without `$unwind`, no notifications are created.
- **Don't skip the `send_routine` module var** — without it, `send-notification` is a no-op. The app must provide the AxiosHttp routine that calls the Lambda.
- **Don't register configs without test data** — every JS config needs a `testData` object for email preview rendering. Missing test data breaks the email preview.

## Reference Files

**Module (Lowdefy UI):**

- `modules/notifications/module.lowdefy.yaml` — module manifest with vars, exports, dependencies
- `modules/notifications/pages/all.yaml` — two-column inbox: list (span 10) + detail (span 14), filters, pagination
- `modules/notifications/pages/link.yaml` — deep-link router: fetch → invite check → auth check → mark read → redirect
- `modules/notifications/components/notification-config.yaml` — bell badge config (count, icon, link)
- `modules/notifications/components/unread-count-request.yaml` — unread count aggregation ($match + $count)
- `modules/notifications/requests/get-notifications.yaml` — paginated list with $facet (notifications + total_count)
- `modules/notifications/actions/update-list.yaml` — reset pagination → fetch → set list → set types

**Lambda pipeline:**

- `lambda/internal/src/notifications/consumeNotifications/handler.js` — consumer handler with apps config and jobs map
- `lambda/internal/src/notifications/sendNotifications/handler.js` — SQS email sender with SendGrid config
- `lambda/internal/src/notifications/consumeNotifications/config/ExampleEventNotifyRecipient.js` — example template with createNotificationTemplate, ContentComponent, Layout, testData
- `lambda/internal/src/notifications/consumeNotifications/config/exampleEventNotifyRecipient.yaml` — example pipeline: $match → $lookup contacts → $unwind → $project (contact, data, links)
- `lambda/internal/src/notifications/consumeNotifications/layout/DefaultLayout.js` — email layout with logo, greeting, signature, optional unsubscribe
- `lambda/internal/serverless.yml` — SQS FIFO queue, DLQ, Lambda functions, IAM permissions

**App wiring:**

- `apps/example-app/modules/notifications/send-routine.yaml` — AxiosHttp call to consume-notifications Lambda
- `apps/example-app/connections.yaml` — `consume-notifications` AxiosHttp connection with API key
- `modules/user-admin/api/invite-user.yaml` — example of triggering send-notification from API routine (line 201)

## Template

### Notification Config (YAML pipeline)

```yaml
# lambda/internal/src/notifications/consumeNotifications/config/{eventTypeNotifyRecipient}.yaml

type: "{event-type-notify-recipient}"
event_type: "{event_type}"
app_name: {app_name}
send_email: true
title: "{Notification title with {{ data.field }} template vars}"
description: "{Short description with {{ data.field }} template vars}."
priority: 50

pipeline:
  # Look up related entities from the event document
  - $lookup:
      from: {related_collection}
      localField: {entity}_ids
      foreignField: _id
      as: {entity}
  - $unwind:
      path: ${entity}
  # Determine recipients — look up contacts who should receive this notification
  - $lookup:
      from: user_contacts
      let:
        {recipient_id}: ${entity}.{recipient_field}
      as: notification_contacts
      pipeline:
        - $match:
            $expr:
              $and:
                - $eq:
                    - $_id
                    - $${recipient_id}
                - $eq:
                    - $apps.{app_name}.is_user
                    - true
                - $ne:
                    - $apps.{app_name}.disabled
                    - true
  # One notification per recipient
  - $unwind:
      path: $notification_contacts
  # Project the final notification shape
  - $project:
      created: 1
      contact: $notification_contacts
      data:
        {entity}:
          _id: ${entity}._id
          title: ${entity}.title
      links:
        button:
          pageId: {target-page-id}
          urlQuery:
            _id: ${entity}._id
```

### Notification Config (JS email template)

```js
// lambda/internal/src/notifications/consumeNotifications/config/{EventTypeNotifyRecipient}.js

import React from "react";
import { Section, Text } from "@react-email/components";
import { Button, createNotificationTemplate } from "@mrmtech/splice-emails";

import DefaultLayout, { theme } from "../layout/DefaultLayout.js";

const testData = {
  contact: {
    profile: { name: "Jane Doe" },
  },
  data: {
    {entity}: {
      _id: "123",
      title: "Example Title",
    },
  },
  links: {
    button: "https://{domain}/{target-page}?_id=123",
  },
};

const {EventType}Content = ({ data, links }) => {
  return (
    <Section>
      <Text>
        There has been an update on <b>{data.{entity}.title}</b>.
      </Text>
      <Text>Click the button below to view the details.</Text>
      <Button href={links.button} color={theme.primary_color}>
        View Details
      </Button>
    </Section>
  );
};

export const {EventTypeNotifyRecipient} = createNotificationTemplate({
  ContentComponent: {EventType}Content,
  Layout: DefaultLayout,
  testData,
  configPath: "./config/{eventTypeNotifyRecipient}.yaml",
});

export default {EventTypeNotifyRecipient}.default;
```

### Triggering from API routine

```yaml
# In an API routine (e.g., api/create-{entity}.yaml), after creating the event:
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

### Registering in handler

```js
// In consumeNotifications/handler.js:
import { EventTypeNotifyRecipient } from "./config/EventTypeNotifyRecipient.js";

const config = {
  // ...apps config...
  jobs: {
    "{event-type}": [EventTypeNotifyRecipient],
  },
};
```

## Checklist

- [ ] Module vars: `app_name` set in app's module config; `send_routine` provides AxiosHttp to consume-notifications
- [ ] App connection: `consume-notifications` AxiosHttp connection exists with `SERVICES_API_URL` and `SERVICES_API_KEY`
- [ ] Config pair: both `.yaml` pipeline and `.js` template exist for each notification type
- [ ] Pipeline `$unwind: $notification_contacts` — produces one doc per recipient
- [ ] Pipeline `$project` includes `contact`, `created`, `data`, and `links` fields
- [ ] Links use `pageId` + `urlQuery` objects (not hardcoded URLs) — Lambda rewrites per environment
- [ ] JS template has `testData` with realistic sample data for email preview
- [ ] JS template uses `createNotificationTemplate` with `ContentComponent`, `Layout`, `testData`, `configPath`
- [ ] Handler `jobs` map registers the config under the correct event type key
- [ ] API routine calls `send-notification` with `event_ids` array after creating the event
- [ ] Notification document has `event_type` matching a key in global `enums.event_types` for badge colors/titles in inbox

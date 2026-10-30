---
title: Support
module: support
type: index
concepts: [support, tickets, pelican, support-app, ticket-copy]
---

# Support

The reporter's side of the [Pelican](https://pelican.lowdefy.app) support desk. A signed-in user reports a problem and chats with the team; the team answers in Pelican.

Tickets live in Pelican. The app keeps a copy of each of its users' tickets in its own `support-tickets` collection, filled from Pelican's support API, so lists and threads read from the app's own database.

## Installing

```yaml
# modules.yaml
- id: support
  source: "github:lowdefy/modules-mongodb/modules/support@v1.4.1"
  vars:
    environment:
      _build.env: STAGE
    app_version:
      _build.env: APP_VERSION
```

The module needs the `layout`, `events`, `notifications` and `files` modules as entries of the app, and the [`@lowdefy/modules-mongodb-plugins`](../plugins/index.md) package, which its manifest pulls in.

### One support app per deployment

In Pelican, a support app stands for one deployment of an app, with its own key, webhook address and webhook secret. Register production in the client's space, and staging (and any other shared deployment) in a test space, so test tickets never reach the client's Support page. Name them apart, such as "Orders" and "Orders (staging)".

A developer's machine leaves `SUPPORT_PELICAN_KEY` unset, which leaves support unavailable, or uses a test support app with no webhook address.

Every deployment talks to production Pelican, the `pelican_url` default.

### Secrets

| Secret                   | From                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `SUPPORT_PELICAN_KEY`    | The deployment's support app in Pelican. Without it, support is unavailable. |
| `SUPPORT_WEBHOOK_SECRET` | The same support app. It signs every webhook Pelican sends to the app.       |

Rotating either in Pelican keeps the old one working for a day, so redeploy with the new value within that day.

### The webhook

Pelican sends every change to one of the app's tickets to the module's `webhook` endpoint. In the deployment's support app in Pelican, set the webhook address to:

```
{app url}/api/endpoints/support/webhook
```

with `support` replaced by the module's entry id when it differs. The endpoint has no session, so list it in the app's `auth.api.public`; the build fails naming it otherwise:

```yaml
auth:
  api:
    public:
      - support/webhook
```

Lowdefy keeps `auth.api.public` and `auth.api.protected` apart: an app that lists protected endpoints moves to listing public ones, and every endpoint it does not list then needs a session.

The endpoint checks each delivery before anything runs. It passes when the `Pelican-Signature` header holds an HMAC of the delivery made with `SUPPORT_WEBHOOK_SECRET` and the `Pelican-Timestamp` is within five minutes of the server's clock; otherwise Lowdefy answers 401. While a rotated secret's old value is live, Pelican signs with both, so a deployment holding either passes. A test delivery from the support app's settings in Pelican answers 200 for a right address and secret and writes nothing; a wrong secret or a clock more than five minutes off answers 401.

A deployment with no webhook address in Pelican refreshes a thread only when it opens and the list only when My tickets opens, and sends no reply notifications.

### Release notes

Pelican sends release announcements on the same webhook. A delivery whose event starts with `release.` goes, once verified, to the endpoint the `release_notes_endpoint` var names, such as `release-notes/receive` for the [release-notes](../release-notes/index.md) module, as `{ delivery, app_version }`, and the webhook answers with what it returns. With the var null (the default), it answers 404, "This app does not take release notes". Ticket events and test deliveries are unaffected.

### User lookup

App request logs name users only by id, so Pelican asks the app who they are on the same webhook. A `users.lookup` delivery, `{ event: 'users.lookup', at, user_ids }` with 1 to 200 user ids, answers with the email and name of each id that is a member of the app:

```
{ users: [{ id, email, name }] }
```

- Only the app's members answer: an id with a member row in the app's organisation under the `pinned` policy, or in any organisation under `tenant`, since every organisation on a tenant deployment is the app's. An id with no member row here (unknown, in another organisation, or removed from the app) is left out, never an error. A person with several memberships answers once.
- `email` and `name` come from the auth engine's user record. `email` is lowercased, or null when the record has none; `name` is null when the record has none. Nothing else is shared.
- The lookup reads and writes nothing else, and needs no index beyond the `user-members` one the [user-admin indexes](../user-admin/reference/indexes.md) list.

It is off by default, since it shares users' emails. Turn it on per deployment in the module's vars:

```yaml
# modules/support/vars.yaml
user_lookup: true
```

What the webhook answers:

| Delivery                                      | Answer                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bad or stale signature                        | 401                                                                                                                                |
| `test`                                        | 200 `{ ok: true }`                                                                                                                 |
| `release.*`                                   | What the `release_notes_endpoint` answers, or 404 with the var null                                                                |
| `users.lookup`, `user_lookup` off             | 404 "This app does not share user details"                                                                                         |
| `users.lookup` without 1 to 200 non-empty ids | 422 "A users.lookup names 1 to 200 user ids."                                                                                      |
| `users.lookup`, `user_lookup` on              | 200 `{ users }`                                                                                                                    |
| A ticket event with a bad body                | 400 "A support webhook names an event, the user_id the ticket belongs to, and the ticket's reporter view with its id and version." |
| Any other event, or none                      | 404 "Unknown event"                                                                                                                |

### Reply notifications

Each new team message, Pelican's own included, sends the user the module's `support-reply` notification, through the notifications module: in the app's bell and by email, with a button to the ticket's page. It goes even while the user has the thread open, since the server cannot know what a browser shows. Its key is `support-reply:{message id}`, so a repeated delivery sends nothing new; that needs the notifications module's unique index on `key`.

The email goes to the address the app's auth user record holds for the user, never one from the webhook. The notification is sent in the organisation the ticket was filed from. A ticket the team logged, or one first stored from the list, has no organisation; in an app whose notifications sit behind the tenant wall, its replies show in the thread with no notification.

### Required indexes

The module cannot create indexes. Create these on `support-tickets` with the app's index tooling (e.g. splice-actions):

```js
// My tickets: the user's tickets, newest first.
db["support-tickets"].createIndex(
  { user_id: 1, "view.updated": -1 },
  { name: "support_tickets_user_updated" },
);
// A ticket named by its key.
db["support-tickets"].createIndex(
  { user_id: 1, "view.key": 1 },
  { name: "support_tickets_user_key" },
);
```

## The help button

The module's `launcher` component is a help button docked in a corner of every page, opening a support panel that does not block the page: the user can still scroll and click behind it. It shows only to a signed-in user (with or without an organisation), and only in an app built with `SUPPORT_PELICAN_KEY` set. The key is checked when the app is built, so a build without it has no button.

Wire its four components into the layout module's vars:

```yaml
# The layout entry's vars
global_blocks:
  - _ref:
      module: support
      component: launcher
global_requests:
  _ref:
    module: support
    component: requests
global_subscriptions:
  _ref:
    module: support
    component: subscriptions
global_events:
  onInit:
    - _ref:
        module: support
        component: on-init
```

`requests` and `subscriptions` are lists; when the app has global requests or subscriptions of its own, join the lists with `_build.array.concat`. `on-init` is one action, the panel's state. `subscriptions` is the live thread (below); the panel's threads need it. The `launcher` var sets the button's label (default Help), its corner (`bottom-left` by default, the corner the ai-assistant panel does not use) and whether it shows at all.

### New report

The panel opens on the report form: a type (the `types` var, each with its description), a title of up to 120 characters and a description of up to 4,000. Then up to five files, each an image or a PDF of up to 10 MB:

- **Take screenshot** draws the page behind the panel, leaving the panel out, and opens an editor to blur or crop it. See [SupportScreenshot](../plugins/support-screenshot.md).
- Files dropped on, chosen in or pasted into the drop area.

Each file uploads to the app's bucket as it is added. A line on the form says what Send also shares: the page, the browser's details and the errors the tab recorded.

**Send** files the ticket in one go. Its context is:

| Field                                                    | From                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `app`, `environment`, `version`                          | The app's slug and the `environment` and `app_version` vars.      |
| `organization`                                           | `{ id, name }` of the organisation the user is in, or null.       |
| `page`, `url`                                            | The page's id and address.                                        |
| `user_agent`, `viewport`, `screen`, `locale`, `timezone` | The browser. See [SupportContext](../plugins/support-context.md). |
| `errors`                                                 | The tab's last 20 errors.                                         |
| `extra`                                                  | The `context` var, evaluated when Send is pressed.                |

When Pelican has the ticket, the draft clears and the panel opens the new ticket's thread. Otherwise the draft stays and the form says why: Pelican's own message for something to fix, "Something went wrong, try again" (with the wait, when Pelican gives one) for a busy or failed call, or "Support is unavailable right now" for a refused key. Nothing is sent again on its own.

### Keeping fields out of screenshots

Every password input is blanked in a screenshot. To blank anything else, put a `data-support-mask` attribute on it:

```yaml
- id: account_number
  type: Html
  properties:
    html:
      _nunjucks:
        template: <span data-support-mask>{{ number }}</span>
        on:
          number:
            _state: account.number
```

or list a CSS selector for it in the `mask_selectors` var:

```yaml
mask_selectors:
  - .customer-card .account-number
```

## My tickets and the thread

**My tickets** in the panel lists the user's tickets, newest first: the ones they reported and the ones the team logged for them. Each row is one line, and the whole row opens the ticket: the key, the title, the type, the stage (Received, In progress, Needs your reply or Resolved, from Pelican's codes `received`, `in_progress`, `needs_your_reply` and `resolved`) and when it last changed. Open, Resolved and All switch the list (it opens on Open), and a search box and a type filter narrow it; they filter the loaded list without fetching again. A dot marks a ticket with a team message the user has not read. When the user's tickets come from more than one organisation, each row names its organisation. Opening the view fetches the list from Pelican; when that fails, it shows the saved tickets with a notice.

Opening a ticket shows its **thread**: the messages, with images inline and PDFs as file chips, and a composer for a reply with up to five images or PDFs. Opening it fetches the ticket from Pelican, which renews its file links and marks it read. A message the team removed shows as "Removed". The team's messages, Pelican's own included, sit on the left; the user's on the right. A reporter cannot close a ticket: the team resolves it. A reply that fails keeps its draft and says why, as the report form does.

### The live thread

An open thread shows a team reply as soon as the webhook stores it, with no polling. The module ships a websocket, `ticket-thread`: a change stream on `support-tickets`, filtered to the open ticket and the signed-in user, so another user's ticket id delivers nothing. Opening a thread subscribes to it; going back to the list, switching to New report, closing the panel or opening My tickets unsubscribes, so only people chatting hold a stream. Each change replaces the thread with the stored row, and a newer view marks the ticket read.

The panel and the ticket page share one channel: the thread opened last is the live one. The ticket page declares the subscription itself, and the layout keeps one when the app also wires `global_subscriptions`.

Module websockets need a signed-in caller by default, so `support/ticket-thread` needs no `auth.websockets` rule. The database must run as a replica set, as change streams need; MongoDB Atlas does.

### The pages

The module ships two pages for the user, at full width.

| Page id   | Path                       | Shows                                                                                                                                                                                                      |
| --------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support` | `/{entry id}/support`      | **My tickets**: every ticket the user has, open and resolved, newest activity first. Each row has the title, key, type, stage, when it last changed and a dot when the team replied since the user looked. |
| `ticket`  | `/{entry id}/{ticket key}` | One ticket: its title, key, type, stage and when it opened, the conversation (images inline, the team's messages on the left, the user's on the right) and the reply composer.                             |

A search box filters the list by title or key, and two selectors by status (Open, Resolved, or one stage) and by type. With no tickets the list says so, and with filters that match none it asks the user to change them. The list reads from the copy, fetched from Pelican when the page opens; the filters change what shows, not what is fetched.

A ticket's address is its key in the path, such as `/support/PEL-1715`, so a link, a notification or the agent can name it. A key that is the ticket's id works too. A ticket that is not the user's shows nothing of it. Link to the pages from the app with `_module.pageId`; the ticket page takes the key as the `ticket_key` path param:

```yaml
- id: open_ticket
  type: Link
  params:
    pageId:
      _module.pageId:
        module: support
        id: ticket
    pathParams:
      ticket_key: PEL-1715
```

The ticket page holds the same live thread as the panel, and the layout keeps one subscription when the app also wires `global_subscriptions`. The pages use only the layout module's `page` component vars, so they work under a fork of the layout.

Add the module's `default` menu to the app's profile menu for a Support link:

```yaml
# menus.yaml
- id: profile
  links:
    _build.array.concat:
      - - id: profile
          type: MenuLink
          # ...
      - _ref:
          module: support
          menu: default
```

## The copy

One document per ticket in `support-tickets`:

| Field                | Holds                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `_id`                | The Pelican ticket id.                                                                                                     |
| `user_id`            | The user who reported the ticket, or whom the team logged it for.                                                          |
| `organization`       | `{ id, name }` the user filed it from, or null. A ticket first stored from a list or a webhook has null.                   |
| `read_at`            | When the user last had the thread open, or null.                                                                           |
| `view`               | The reporter view Pelican returned: `id`, `key`, `title`, `type`, `version`, `stage`, `created`, `updated` and `messages`. |
| `chat_files`         | Keys of the chat files the [agent tools](how-to/agent-tools.md) have sent on the ticket, so none goes again.               |
| `created`, `updated` | [Change stamps](../shared/change-stamps.md).                                                                               |

**A ticket belongs to its reporter**, not to an organisation. The connection stands outside the tenant wall (`tenant: shared`), and every read and write is filtered by the session user's id: a user in two organisations sees all their tickets in one list, each marked with its organisation.

**The copy only moves forward.** A view is written whole, and only over a stored view with a lower `version`, so two writes racing each other never roll a thread back.

The reporter is always the session user, sent to Pelican as `{ id, name, email }` from the `user` var. Nothing in a payload can name another user.

## Endpoints

Each answers `{ ok: true, ... }` or `{ ok: false, error, ... }` and never fails on Pelican's answer, so a form keeps its draft and an agent can say whether to try again. `error` is `{ kind, status, code, message, retry_after }`:

| `kind`        | When                                                             | What to do                                         |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `fix`         | Pelican refused the request (400, 404, 413, 415).                | Show `message`, Pelican's own.                     |
| `retry`       | Pelican was busy or failed (429, 500), or did not answer.        | Try again, after `retry_after` seconds when given. |
| `unavailable` | Pelican refused the key (401). Logged as an error on the server. | Support is unavailable until the key is fixed.     |

| Endpoint        | Payload                                    | Returns                                                                                                                           |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `create-ticket` | `{ type, title, message, context, files }` | `{ ok, ticket }`: files a ticket and returns its stored row.                                                                      |
| `post-message`  | `{ ticket, message, files }`               | `{ ok, ticket }`: posts the user's message and returns the stored row.                                                            |
| `sync-tickets`  | none                                       | `{ ok, error, tickets }`: the user's tickets newest first, each `{ id, key, title, type, stage, updated, organization, unread }`. |
| `sync-ticket`   | `{ ticket }`                               | `{ ok, ticket }`: the stored row, refreshed from Pelican and marked read. On failure, the stored row (or null) with the error.    |
| `mark-read`     | `{ ticket }`                               | `{ ok: true }`. Marks the ticket read.                                                                                            |

`ticket` is a ticket's id or its key.

`webhook` takes Pelican's deliveries, `{ event, at, delivery_id, user_id, ticket }`, hands `release.*` events on as [Release notes](#release-notes) says, and answers `users.lookup` as [User lookup](#user-lookup) says. Any other event that is not a ticket event answers 404 "Unknown event". Every ticket event (`ticket.created`, `ticket.message`, `ticket.message_deleted`, `ticket.stage`, `ticket.updated`) writes `ticket`, the reporter view, into the copy of the user `user_id` names, creating the row when there is none, so a ticket the team logs for a user shows in their list. A view no newer than the stored one changes nothing and still answers 200, so Pelican stops sending it. `ticket.message` also sends a [reply notification](#reply-notifications) for each team message the row did not have. To try it on a dev server, `apps/demo/scripts/support-webhook-check.mjs` posts signed deliveries and checks what they store and what a lookup answers; its last argument, `on` or `off`, is the app's `user_lookup`.

The app's own agent files and follows up tickets through four more endpoints. A ticket it files carries the same page, browser and error context as the form's when the app adds the `agent-context` component to its agent's shared state: see [Give the app's agent the support tools](how-to/agent-tools.md).

`create-ticket` and `post-message` check what the browser sent before Pelican is called: the type is one of the `types` var's values, the title is 1 to 120 characters, the message 1 to 4,000, there are at most five files, and each file key is under the user's own upload prefix: `{organization_id}/support/{user id}/`, or `support/{user id}/` for a user with no organization. A failed check answers a `fix` error. The server adds `app`, `environment`, `version` and `organization` to the ticket's context, over anything the browser sent for them.

Neither retries on its own. Pelican's create has no idempotency key, so a create repeated after a lost answer files a second ticket: let the user decide to try again.

## Files

Every file a reporter sends goes to the app's own files bucket first, through the `files` module:

1. The browser uploads it with the module's upload policy (`requests/upload_policy.yaml`), under `{organization_id}/support/{user id}/{uuid}/{file name}` (`support/{user id}/{uuid}/{file name}` for a user with no organization, who can still report), up to 10 MB, with the uploader metadata the `files` module's own policy sets.
2. `create-ticket` or `post-message` takes the uploaded files as `[{ key, name }]` and refuses any key outside the user's prefix.
3. The server signs a 15-minute GET link for each key and sends Pelican `files: [{ name, url }]`. Pelican copies each file into its own bucket within that time.

Pelican takes images and PDFs up to 10 MB, five per message. It refuses a larger file with `file_too_large` and another type with `file_type`, both `fix` errors.

The ticket's view then lists each message's files as Pelican's own links, valid for seven days. `sync-ticket` renews them when a thread opens.

`sync-tickets` asks Pelican for the user's tickets, the ones the team logged for them included, and fetches in full only those the copy lacks or holds at a lower version. Normally that is one call. A failed call keeps the copy and returns it with the error.

`unread` is true when the newest team message is later than `read_at`.

## Vars

See [the generated vars reference](reference/vars.md).

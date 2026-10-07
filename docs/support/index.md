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
  source: "github:lowdefy/modules-mongodb/modules/support@v0.44.1"
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

## The copy

One document per ticket in `support-tickets`:

| Field                | Holds                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `_id`                | The Pelican ticket id.                                                                                                     |
| `user_id`            | The user who reported the ticket, or whom the team logged it for.                                                          |
| `organization`       | `{ id, name }` the user filed it from, or null. A ticket first stored from a list or a webhook has null.                   |
| `read_at`            | When the user last had the thread open, or null.                                                                           |
| `view`               | The reporter view Pelican returned: `id`, `key`, `title`, `type`, `version`, `stage`, `created`, `updated` and `messages`. |
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

`create-ticket` and `post-message` check what the browser sent before Pelican is called: the type is one of the `types` var's values, the title is 1 to 120 characters, the message 1 to 4,000, there are at most five files, and each file key is under the user's own `support/{user id}/` prefix. A failed check answers a `fix` error. The server adds `app`, `environment`, `version` and `organization` to the ticket's context, over anything the browser sent for them.

Neither retries on its own. Pelican's create has no idempotency key, so a create repeated after a lost answer files a second ticket: let the user decide to try again.

## Files

Every file a reporter sends goes to the app's own files bucket first, through the `files` module:

1. The browser uploads it with the module's upload policy (`requests/upload_policy.yaml`), under `support/{user id}/{uuid}/{file name}`, up to 10 MB, with the uploader metadata the `files` module's own policy sets.
2. `create-ticket` or `post-message` takes the uploaded files as `[{ key, name }]` and refuses any key outside the user's prefix.
3. The server signs a 15-minute GET link for each key and sends Pelican `files: [{ name, url }]`. Pelican copies each file into its own bucket within that time.

Pelican takes images and PDFs up to 10 MB, five per message. It refuses a larger file with `file_too_large` and another type with `file_type`, both `fix` errors.

The ticket's view then lists each message's files as Pelican's own links, valid for seven days. `sync-ticket` renews them when a thread opens.

`sync-tickets` asks Pelican for the user's tickets, the ones the team logged for them included, and fetches in full only those the copy lacks or holds at a lower version. Normally that is one call. A failed call keeps the copy and returns it with the error.

`unread` is true when the newest team message is later than `read_at`.

## Vars

See [the generated vars reference](reference/vars.md).

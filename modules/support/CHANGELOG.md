# @lowdefy/modules-mongodb-support

## 1.2.0

### Patch Changes

- [#309](https://github.com/lowdefy/modules-mongodb/pull/309) [`7ed612d`](https://github.com/lowdefy/modules-mongodb/commit/7ed612d6f15f777a25b6d46ff411dbbe2b2e2dba) Thanks [@puffin-mrm](https://github.com/puffin-mrm)! - My tickets is centred on wide screens, and its rows keep their columns in line. The page passes `content_width: 960` to the layout page, so the title, filters and list sit in a centred 960px column rather than against the left edge. In each row the timestamp has a 128px right-aligned column, so "a few seconds ago" no longer runs into the row border, and the type, stage and organisation columns have fixed widths, truncating long values. Nothing to change in your app.

## 1.1.0

### Minor Changes

- [#302](https://github.com/lowdefy/modules-mongodb/pull/302) [`76ec282`](https://github.com/lowdefy/modules-mongodb/commit/76ec28225da70b5b43284ce01d5e246730fdb8a1) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Breaking: the release-notes module no longer renders `CHANGELOG.md`.** It now takes release notes the team announces from Pelican, which arrive on the support module's signed webhook. The support webhook hands `release.*` events to the module, and the module answers Pelican's `release.audience` with live counts of who an announcement would reach.

  - **release-notes:** the `content` var is removed. New vars: `audiences` (the groups Pelican can announce to, each a filter over the person's `user-members` row), `email_template` and `region` (required). The module now depends on `notifications`, `files` and `events`, declares three collections (`release-notes`, `release-notes-recipients`, `release-notes-preferences`) and read-only views of the auth `user-members`, `users` and `user-organizations`, and exports an internal `receive` endpoint.
  - **support:** new var `release_notes_endpoint`, the release-notes receiver's full endpoint id (such as `release-notes/receive`). With it null, the webhook answers `release.*` events 404. `app_version` is now described as the app's bare X.Y.Z version, which Pelican compares with the release it announces.

  Migration:

  - Remove `content` from the release-notes entry and set `region` (the public files bucket's region) and any `audiences`.
  - Add an `events` module entry if the app has none.
  - Set the support module's `release_notes_endpoint` to `{release-notes entry id}/receive`, and `app_version` from the build.
  - Create the two indexes on `release-notes-recipients` listed in the module's docs.

## 1.0.0

### Major Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

  To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

  - **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
  - **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
  - **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
  - **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
  - **Events:** `contact_page_url` is replaced by `contact_page_id`.
  - **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
  - **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.

### Minor Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **New `support` module: the reporter's side of the Pelican support desk.** A signed-in user reports a problem and chats with the team from inside the app; the team answers in Pelican. See `docs/support/`.

  - **Help button and panel.** The `launcher`, `requests`, `subscriptions` and `on-init` components go in the layout's `global_blocks`, `global_requests`, `global_subscriptions` and `global_events.onInit`. The button shows to a signed-in user in an app built with `SUPPORT_PELICAN_KEY`, and opens a panel that leaves the page usable.
  - **New report.** A type (the `types` var), a title, a description and up to five images or PDFs of 10 MB each: a screenshot of the page behind the panel (blurred or cropped first, with password inputs, `[data-support-mask]` elements and `mask_selectors` blanked), or files dropped, chosen or pasted. The ticket carries the page, the browser's details and the tab's last 20 errors; the server adds the app, environment, version and organisation. A refused or failed send keeps the draft and says why, and nothing is resent on its own.
  - **My tickets and the thread.** The panel and the full-width `support` page list the user's tickets, the ones the team logged for them included, as compact rows with key, title, type, stage label, last activity and an unread dot, with search, Open / Resolved / All and a type filter. Each ticket has its own page at `/{entry id}/{ticket key}`, such as `/support/PEL-1715`. An open thread is live through the module's `ticket-thread` websocket, a change stream filtered to the open ticket and the signed-in user, so it needs a replica set. The `default` menu adds a Support link to the profile menu.
  - **The copy.** The app keeps each user's tickets in its own `support-tickets` collection, filled from Pelican and written only forward by version. A ticket belongs to its reporter, not to an organisation: the connection is `tenant: shared` and every read and write is filtered by the session user, so the module installs under either organizations policy. Create the two indexes in `docs/support/index.md`.
  - **Webhook and reply notifications.** Pelican's signed webhook arrives at `support/webhook`, checked against `SUPPORT_WEBHOOK_SECRET` and a five-minute timestamp window, else 401. List `support/webhook` in `auth.api.public` and set the webhook address in Pelican. Each new team message sends the user the module's `support-reply` notification (bell and email, keyed per message), so the module needs the `notifications` module's unique index on `key`.
  - **Files.** Uploads go to the app's own files bucket under the user's `support/{user id}/` prefix, through the module's upload policy, and Pelican is sent a 15-minute link per file to copy.
  - **Endpoints.** `create-ticket`, `post-message`, `sync-tickets`, `sync-ticket` and `mark-read` answer `{ ok, error }` with an error `kind` of `fix`, `retry` or `unavailable` instead of failing on Pelican's answer, and check every payload before Pelican is called. None retries on its own.
  - **Agent tools.** `agent-tools` and `agent-instructions` give the app's own agent four tools (file a ticket, list my tickets, read a ticket, post a message) and a brief for them. The tools send the chat's images and PDFs, taken from the chat request and limited to the `chat_files_prefix` var, each once across all of the user's tickets, and name each ticket as a link to its page. Add the `agent-context` component to the agent's shared state under `support_context` and an agent-filed ticket carries the same page, browser and error context as the form's. See `docs/support/how-to/agent-tools.md`.

  The module needs the `layout`, `events`, `notifications` and `files` modules and the `@lowdefy/modules-mongodb-plugins` package.

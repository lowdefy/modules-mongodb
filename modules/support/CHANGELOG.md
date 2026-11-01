# @lowdefy/modules-mongodb-support

## 2.0.0

### Major Changes

- [#316](https://github.com/lowdefy/modules-mongodb/pull/316) [`397ac4e`](https://github.com/lowdefy/modules-mongodb/commit/397ac4e07cf28c81fa6ad1b8f565743f5d098130) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **The files components, and the modules that use them, now work through the files module's endpoints.**

  - **files:** `file-manager` and `file-card` list through `list-files` on mount and again after each save and delete, get each upload's policy from `upload-policy`, save with `save-file` (sending the key and the thumbnail) and delete with `delete-file`. `file-list` lists through `list-files` and downloads through `download-file` with the `FileDownload` block. A refused upload shows the endpoint's message and is dropped. The components need no page requests, and their vars are unchanged.
  - **events:** the `events-timeline` component's `s3GetPolicyRequestId` var is replaced by `download_endpoint_id` (default null). Set it to the files module's `download-file` to show download links for files on `event.files`; a file that is not a file record is refused. Unset, event files are not shown.
  - **support:** uploads land under `{organization_id}/support/{user id}/{uuid}/{name}`, or `support/{user id}/…` for a user with no organization, who can still attach files. `create-ticket` and `post-message` accept only files under the caller's own prefix. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
  - **deals:** the deal files panel lists through `list-files` when a deal is opened or switched and when the upload modal closes, and the upload modal lists the selected deal's files each time it opens.
  - **plugins:** `FileDownload` gives each file without a `uid` one from its `_id` or `key`, so a file is listed once.

- [#316](https://github.com/lowdefy/modules-mongodb/pull/316) [`e857039`](https://github.com/lowdefy/modules-mongodb/commit/e8570395614810b639ca73540b8aa6764fe3e854) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Breaking: v2 makes the files module safe for an app with many organizations.** Until now anyone signed in who held a file's key could get a download link for it, whatever organization or record it belonged to, and could save a record over another file's key. Every file operation now goes through a files module endpoint that loads the record and runs an access check the app can supply, and every download link is signed from a stored record. Every module and the plugin move to 2.0.0 together, on Lowdefy 7 as before; no framework upgrade is needed. Files already uploaded stay where they are and keep working, so there is no data migration.

  To upgrade an app:

  1. **Move off the removed files requests.** The `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export are gone. The `file-manager`, `file-card` and `file-list` components need no page requests now. An app that lists, uploads, saves, downloads or deletes files itself calls the endpoints `list-files`, `upload-policy`, `save-file`, `download-file` and `delete-file` (`files/<endpoint>` in app config). `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` with a key `upload-policy` minted, and `delete-file` and `download-file` take `{ file_id }`. See `docs/files/reference/endpoints.md`.
  2. **Decide who may work with a record's files.** Without config, every signed-in member of the organization may. To narrow it, write an app endpoint that answers `{ allowed: true }` or `{ allowed: false, message }` for `{ operation, entity_type, entity_id, file_id }` and name it in the files module's `access_check: { endpoint_id }` var. It may be asked about a record that is not saved yet (the activities module mints an activity's id before saving it).
  3. **Check the upload limits.** Uploads are capped at `max_file_size`, 25 MB by default; raise it if the app takes larger files. Set `allowed_content_types` to limit the types `upload-policy` accepts.
  4. **Rename the download property on blocks.** FileManager, EventsTimeline, DataDescriptions and SmartDescriptions take `downloadEndpointId` (and an optional `downloadPayload`) in place of `s3GetPolicyRequestId`; with only the old property set they show no download. Point it at the files module's `download-file` for files module records. An app that signs its own files writes an endpoint that takes `{ file_id, ...downloadPayload }`, loads the record the file belongs to, and returns `{ url }`, failing with a message (`:reject:`) to refuse.
  5. **Events timeline:** the `events-timeline` component's `s3GetPolicyRequestId` var is now `download_endpoint_id`, null by default. Set it to `files/download-file` to show downloads for files on `event.files`. A file there that is not a file record no longer downloads.
  6. **Workflows:** the `file_download` field's `s3GetPolicyRequestId` var is replaced by `download_endpoint_id` and `download_payload`, which default to the workflows module's `download-form-file` with the page's `{ workflow_id }`, so form files keep downloading with no app config. Drop `s3GetPolicyRequestId`; to show files module records in the field, set `download_endpoint_id: files/download-file`. The overview pages no longer pull in the files module's `download-policy`.
  7. **Workflow form uploads must carry the organization.** The app's `upload_files` request (the `file_upload` field's `s3PostPolicyRequestId`) must mint keys under `{organization_id}/workflows/`, for example `{organization_id}/workflows/{workflow type}/{uuid}/{name}`; see the `file_upload` field in `docs/workflows/reference/form-components.md`. Submitting a form refuses a new file under any other key, and `download-form-file` signs only those keys and keys from before the upgrade, so a form file with another organization's key, or a files module or support key, no longer downloads.
  8. **Support uploads** land under `{organization_id}/support/{user id}/`, or `support/{user id}/` for a user with no organization. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
  9. **Guard the app's own signing requests.** A page request that signs any key the browser sends gives anyone signed in every object in the bucket, including other organizations' files. An app that signs its own download links for other prefixes in the same bucket (chat attachments, for example) should sign only keys under the caller's own prefix and return a null key for any other, as `apps/demo/modules/ai-assistant/attachment_requests.yaml` does.

  New uploads land under `{organization_id}/files/{entity_type}/{entity_id}/`; older objects keep their keys and still download, because signing goes by the record rather than the key. The other entries in this release give each module's changes in full.

### Minor Changes

- [#317](https://github.com/lowdefy/modules-mongodb/pull/317) [`307c5ea`](https://github.com/lowdefy/modules-mongodb/commit/307c5eab32b88b10cb74051c4341235173704ccf) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **support:** a person can report a problem without the help button or an assistant.

  New for apps:

  - **`report-drawer` component** (for the layout's `global_blocks`) and **`open-report` action** (for any button's `onClick`): the report form in a drawer, opened with a draft filled in from `type`, `title`, `body` and `context` (each a value or a runtime operator; `context` is an object sent under the ticket's `context.extra`). Nothing calls a model, so it works with `launcher.show: false` and while an assistant is paused. `report-drawer` takes an optional `secondary` var: blocks shown under the composer, such as a link to the app's own assistant. Wire the `requests` and `on-init` components as for the help button, since the drawer declares an upload policy and resets its draft there.
  - **`get-awaiting-reply-count` component**: a request, `get_awaiting_reply_count`, counting the signed-in person's tickets in `needs_your_reply` in their organisation. Declare it on a page or among `global_requests`, fire it with a `Request` action and read `_request: get_awaiting_reply_count.0.total` for a menu item or badge.
  - **Replying on a ticket marks its `support-reply` notifications read**, change-stamped, so the bell stops asking once the person has answered.

  Changed:

  - **My tickets page**: a Report a problem button in the title row opens the report form in the page's own drawer. The list, its filters and the ticket page look as before.
  - **A failed check for replies** is one grey line, "Couldn't check for replies.", with a Try again button, on My tickets and in the thread, in place of the yellow banner.

  Nothing to change in an app that only uses the help button. The report form's ids, state keys and upload policy are now set per surface; the help button's panel keeps its own (`support_report.*`, `upload_policy_support_report_files`).

- [#317](https://github.com/lowdefy/modules-mongodb/pull/317) [`000bbf7`](https://github.com/lowdefy/modules-mongodb/commit/000bbf70fa91bc8e173a5f8e4a2f36ae00f5a901) Thanks [@Gervwyk](https://github.com/Gervwyk)! - The Support page's report drawer can show the app's own blocks under its composer, as the report-drawer component already can: set the new `report_secondary` var, such as a link to the app's assistant or a line saying it is unavailable. It defaults to none, so nothing changes for an app that does not set it.

### Patch Changes

- [#317](https://github.com/lowdefy/modules-mongodb/pull/317) [`e859586`](https://github.com/lowdefy/modules-mongodb/commit/e8595867d8a95779cfcb6f2b200fe8f51ec44423) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **support:** a closed report drawer no longer blocks a page's Save. The report form's required fields counted even while its drawer or the help panel was shut, so on a page that mounts `report-drawer` any `Validate` without `params` failed on the empty report and the page's own Save or Create did nothing. The form's checks now hold only while its drawer or panel is open.

## 1.4.1

## 1.4.0

## 1.3.0

### Minor Changes

- [#314](https://github.com/lowdefy/modules-mongodb/pull/314) [`d8fb717`](https://github.com/lowdefy/modules-mongodb/commit/d8fb71783bc2613139adb6e87035f56570f22543) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **support:** the webhook can tell Pelican who your app's active users are. Pelican reads which user ids used an app from its request logs, which name users only by id, and now asks the app for their details with a signed `users.lookup` event naming up to 200 user ids. The webhook answers `{ users: [{ id, email, name }] }` with the email and name from the user record of each id that is a member of your app (your pinned organisation, or any organisation under `tenant`). Anyone else is left out, and nothing else is shared.

  It is off by default. Turning it on shares the email and name of the members Pelican asks about:

  ```yaml
  # modules/support/vars.yaml
  user_lookup: true
  ```

  Left off, the event answers 404, "This app does not share user details". A malformed lookup answers 422.

  Webhook events the module does not know now answer 404 "Unknown event", where they used to answer the 400 a bad ticket delivery gets. Ticket, test and `release.*` deliveries answer as before. Nothing to change in your app unless you want the lookup on.

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

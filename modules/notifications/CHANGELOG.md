# @lowdefy/modules-mongodb-notifications

## 1.1.0

### Minor Changes

- [#306](https://github.com/lowdefy/modules-mongodb/pull/306) [`6006ed7`](https://github.com/lowdefy/modules-mongodb/commit/6006ed7645529afbcea0041edf4b50620ca7c3be) Thanks [@puffin-mrm](https://github.com/puffin-mrm)! - **A viewer can pick their notification sound.** The `NotificationSound` block takes `sounds`, a list of `{ id, title, description?, src? }`: the first is the default, a sound without `src` is the chirp, and a pick that is no longer offered falls back to the first. Sound files play through the same Web Audio context as the chirp, so the viewer's first click or key press unlocks them for live notifications too. With `picker: true` the block draws a dropdown of the sounds, each with a button to hear it; picking one stores it in the browser beside the on/off setting, turns the sound on and plays it. While the sound is off the dropdown reads `offLabel` ("Off"), and the Sound switch turns it off.

  Pass the list through the notifications module's new `sounds` var, which reaches the page-wide player and the inbox's Sound switch:

  ```yaml
  - id: notifications
    vars:
      sounds:
        _ref: sounds.yaml # [{ id: chirp, title: Chirp }, { id: bell, title: Bell, src: /sounds/bell.mp3 }]
  ```

  To let the viewer pick, draw the block on a page with the same list:

  ```yaml
  - id: notification_sound_picker
    type: NotificationSound
    properties:
      app:
        _build.app: slug
      picker: true
      sounds:
        _ref: sounds.yaml
  ```

  Without `sounds` nothing changes: the switch and the chirp, as before.

- [#302](https://github.com/lowdefy/modules-mongodb/pull/302) [`aeb1397`](https://github.com/lowdefy/modules-mongodb/commit/aeb1397c251322885efbefcf93d7ee424ecd7720) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **release-notes:** the release note email now shows the note's body, with its headings, lists, links and images, and a footer link to turn release emails off on What's new. A video in the note becomes a link to the note on What's new. Pelican's new `release.test` event sends that email to one address, so the team can check it before announcing; it writes nothing and rings no bell.

  **notifications:** a new exported `send-email` endpoint renders one notification and emails it to one address without storing it, for test sends.

  Migration:

  - An app that restyles the email with `email_template` adds the body to its copy of the template, as the module docs show. Without it, its email carries no body.

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

- [#127](https://github.com/lowdefy/modules-mongodb/pull/127) [`b8a2ef6`](https://github.com/lowdefy/modules-mongodb/commit/b8a2ef697323f432926ba784b2e49ff88a599140) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the `app_name` module var is replaced by Lowdefy's `_app` operator.** Apps now declare their identity once, as `slug:` on the root of `lowdefy.yaml`, and every module reads it directly with `_build.app: slug`.

  Migration for consumers:

  - Add `slug: <your-app-slug>` to the root of `lowdefy.yaml` if it isn't there already. It must be kebab-case (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) — Lowdefy validates it, and referencing an undeclared slug fails the build.
  - Remove the `app_name:` var from every module entry. `activities`, `companies`, `contacts`, `deals`, `notifications`, `user-account`, `user-admin` and `workflows` no longer declare it.
  - `events.display_key` is now optional, defaulting to the app's own slug. Drop it unless the app deliberately renders another app's event display strings.
  - If a `change_stamp` override baked in an app-attribution literal (`app_name: my-app`), change the value to `{ _build.app: slug }`. The stamp field keeps the name `app_name`.
  - Any shared config file that existed only to hold `app_name` (e.g. an `app_config.yaml`) can be deleted.

  No data migration is required — the slug produces the same string the `app_name` var did, and no stored field or key is renamed. `created.app_name` keeps its name on event and notification documents.

  Connection schema changes in `@lowdefy/modules-mongodb-plugins`: the `WorkflowAPI` connection property `app_name` is renamed to `slug`, and the `EventsTimeline` connection property `app_name` is renamed to `display_key` (it carries the events module's `display_key`, which may legitimately differ from the slug). Apps wiring these connections directly must rename the property keys.

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **The notifications module owns the dispatch pipeline around Lowdefy's notification render.** Lowdefy renders notification emails from the app's `notifications:` config through the `RenderNotification` step; the module composes the rest. See `docs/notifications/index.md`.

  - **`dispatch-notifications`** (exported InternalApi, payload `{ notification_id, items }`): per item it mints the record id, renders the app's template, inserts the record before sending (claiming the dedup `key`, so concurrent dispatches cannot double-send), sends, and records the result. A failed send never fails the dispatch: the record stays `sent: false` with `send_attempts` bumped. `send_routine` keeps its `{ event_ids }` contract and typically ends in a `CallApi` to `dispatch-notifications`.
  - **`drain-notifications`** (exported InternalApi) re-sends records a failed send left unsent, from their stored render, claiming each with an optimistic lock so overlapping runs cannot double-send. The module ships no schedule: call it from a cron-only endpoint of the app's own. Under `policy: tenant` it retries each record bound to its `organization_id`, which Lowdefy accepts only in a trusted system run, so call it from a schedule.
  - **Transports.** `transport: smtp` (default, the `notifications-email` connection, configured by the `email` vars with the `NOTIFICATIONS_SMTP_PASS` secret) or `sendgrid` (`notifications-email-sendgrid`, the `sendgrid` vars with `SENDGRID_API_KEY`). Either connection can be remapped to the app's own.
  - **Recipient filters.** `email.filter` and `sendgrid.filter` take `{ replaceAddress, allowlist, regex }`. Left null they fall back to the current Lowdefy environment's `email.filter`, and `server_url` (the origin of email links) falls back to the environment's `url`, so an app that declares `config.environments` can leave them unset. Types in the new `filter_exempt_types` var (default: the pre-auth invite types) always reach the real recipient. `email_result` on the record shows where the mail actually went.
  - **Links.** A notification link is `{ pageId, pathParams?, urlQuery?, input? }`; the landing page and the inbox's View button follow `pathParams`. `public_link_types` names the link types the `link` page resolves without a session.
  - **Public pages.** The manifest contributes `link`, `invalid` and `file-download` to `auth.pages.public`, so they can come out of the app's own list. The inbox (`all`) stays protected.
  - **Tenant wall.** Every notification write keeps the wall; none uses `tenant: none`.

  **Required index:** dedup needs a unique partial index on `key` (`notification_key_unique`, partial on `key: { $type: 'string' }`). Without it the guarantee does not exist. Two read indexes on `user_id` / `contact_id` with `created.app_name` and `created.timestamp` keep the inbox fast; see the module docs.

  Auth emails (verify, magic link, invitation) are sent by the auth engine through `auth.email`, not through this pipeline.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **The notifications inbox is redesigned, and notifications are live.**

  - **Inbox.** The `all` page fills the screen with a rail of views and types, each with its unread count, a list of up to 1000 notifications that scrolls on its own, and a reading pane. Filters are Unread / All / Read, a date range, a search over title and preview, and a view or type from the rail. The new `views` var groups notification types, such as Mentions, at the top of the rail. Below tablet width the rail becomes a View selector and the list and pane take turns.
  - **Mark all as read follows the filters.** It marks only the unread notifications the filters match, across all pages, and names the count whenever a view, type, search or date narrows it. A notification can be marked unread again from the pane.
  - **The reading pane shows the message, not the email.** The stored email's canvas, card, logo, sign-off and footer are hidden, and the message takes the app's typography. Emails themselves are unchanged.
  - **Appearance per type.** Each type takes its icon and colour from the app's `event_types` entry; a type with none gets a palette colour chosen consistently from its id. Every colour follows the app's theme, dark mode included.
  - **Live.** The bell, the toasts and the inbox update the moment a notification arrives or is read in another tab or device, through the module's `notifications-live` websocket. The `layout` page component subscribes on every page with a signed-in user, unless the page passes `hide_notifications: true`. Each signed-in user with a page open holds one change stream and one pooled MongoDB connection, so size `maxPoolSize` for concurrent users. Change streams need a replica set; where they cannot run, set the new `live` var to `false` and the bell and toasts update on navigation.
  - **Toasts.** A notification flagged `popup: true` toasts the moment it arrives. The toast is 360px wide under the header, with the type's icon, a one-line title, a two-line preview, the time, **Dismiss** and **Open** (now also for links stored at `data.links.button`). The dispatch pipeline stores `popup` from the item, default `false`.
  - **Sound.** An opt-in chirp plays once per batch of popup notifications, after the viewer turns on **Sound** in the inbox header; the setting is kept per device. The module now declares `@lowdefy/modules-mongodb-plugins` for the `NotificationSound` block.
  - **A record's type** reads `type` before `event_type` everywhere, so a record carrying both is filtered, counted and labelled under its notification id.

### Patch Changes

- [#250](https://github.com/lowdefy/modules-mongodb/pull/250) [`538d3cc`](https://github.com/lowdefy/modules-mongodb/commit/538d3cce7e10fbec78a50b794d8e705dc802b6f3) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Fix: a notification reaches its signed-in recipient when the app's contact id is not the user id.**

  The module found a caller's records by comparing the record's `contact_id` with `_user.id`, a contact id against an auth user id. Where an app keeps people as per-organization contact rows, those differ, so the inbox, bell, popups and mark-read never saw the record and the landing link sent it to the invalid page. Records now store `user_id`, from `item.contact.user_id`, and every session-scoped read and write matches the caller against `contact_id` or `user_id`. To use it, add `user_id` to each item's `contact`. Apps whose contact id is the user id, and records written before this, behave as before.

  The landing link also stops taking the caller's id from the request payload and reads the session on the server. With no session, a record addressed to a contact with no login is readable only through `public_link_types`.

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.2

## 0.44.1

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

## 0.40.0

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

### Minor Changes

- [#183](https://github.com/lowdefy/modules-mongodb/pull/183) [`6dad7a7`](https://github.com/lowdefy/modules-mongodb/commit/6dad7a7eb2f63b3a8acaef2f979e5c3d001dc23f) Thanks [@Saiby100](https://github.com/Saiby100)! - Add popup notification toasts. Notifications flagged `popup: true` now surface as dismissible toast cards in a fixed-position stack (top-right), mounted globally by the `layout` page component the same way the bell is wired. The notifications module gains two exports — `popup-notifications` (the toast `List` block) and `popup-notifications-requests` (fetch + mark-read requests) — plus a `popup_limit` var (default 3). The layout page component gains a `hide_popup_notifications` gate. Toasts fetch on page mount (no sockets/polling), scope to the current user and `app_name`, and mark the notification read on Acknowledge. When a notification carries `links.button` the toast also shows a View button that navigates there via a `Link` action and marks it read.

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.1

## 0.32.0

## 0.31.1

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.1

## 0.25.0

## 0.24.0

## 0.23.1

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.1

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.1

## 0.8.0

## 0.7.0

## 0.6.0

### Minor Changes

- [`ad80095`](https://github.com/lowdefy/modules-mongodb/commit/ad800955415ff9e5858a0ce3d8fc6ddd5b241046) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Bump `@lowdefy/community-plugin-mongodb` peer requirement from `^2` to `^3` across all modules that depend on it (`activities`, `companies`, `contacts`, `notifications`, `user-account`, `user-admin`). Consumer apps must update their plugin install to the v3 line; module config and exports are otherwise unchanged.

## 0.5.2

## 0.5.1

## 0.5.0

### Minor Changes

- [#52](https://github.com/lowdefy/modules-mongodb/pull/52) [`246c413`](https://github.com/lowdefy/modules-mongodb/commit/246c4134d747018dbd2fb014062321a9d16bd9d8) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Export the `file-download` page and `notifications-files-bucket-public` connection from the notifications module. Previously shipped as scaffolding in `0.4.2` but not consumable; the manifest now wires the page, the public S3 connection, and the supporting secrets so notification templates can link to `/{entryId}/file-download?_id={notification._id}&index={file_index}` to redirect recipients to a presigned S3 URL for an attachment without requiring them to be logged in.

  **Secrets to add:** `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY`, `FILES_S3_REGION`, `FILES_S3_BUCKET_PUB` — share with the `files` module by convention when both are installed.

  No new vars are required on the module entry.

## 0.4.2

### Patch Changes

- [#50](https://github.com/lowdefy/modules-mongodb/pull/50) [`d008df4`](https://github.com/lowdefy/modules-mongodb/commit/d008df4967f0d42b02fd6ec3fac7f478042f8303) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Add scaffold for a public file-download flow on notification attachments — new `file-download` Box page, `notifications-files-bucket-public` AwsS3Bucket connection (backed by `FILES_S3_ACCESS_KEY_ID` / `FILES_S3_SECRET_ACCESS_KEY` / `FILES_S3_BUCKET_PUB` secrets and the `s3_region` var), and `get_notification_file` / `download_notification_file` requests. The page resolves the indexed file from `$files` on a notification, generates a presigned S3 GET, and redirects the browser. Not yet exported via `module.lowdefy.yaml` — scaffolding only, not consumable until the manifest wires up the page and connection.

- [#50](https://github.com/lowdefy/modules-mongodb/pull/50) [`df408dc`](https://github.com/lowdefy/modules-mongodb/commit/df408dcbd9e09f71d75d6eb517f28c9e583c01c9) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Allow `resend-user-invite` notifications to be resolved by the link page. The `get_notification_for_link` aggregation now matches `event_type: resend-user-invite` in its `$or` filter alongside the existing `invite-user` branch, so resent invite emails can deep-link the recipient straight to the invite-acceptance page without requiring the contact to already be logged in as themselves.

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#28](https://github.com/lowdefy/modules-mongodb/pull/28) [`2c4aa70`](https://github.com/lowdefy/modules-mongodb/commit/2c4aa70f54840a33d5f21ea45539328a860d3525) Thanks [@Yianni99](https://github.com/Yianni99)! - Rename module pages from entity-prefixed IDs to semantic verbs to remove the redundant URL prefix (e.g. `/companies/companies` → `/companies/all`). Module pages now use `all`, `view`, `edit`, `new` consistently. Cross-module references via `_module.pageId:` and hardcoded scoped page IDs (`{entry-id}/{page-id}`) must be updated to the new IDs.

  Page ID changes per module:

  - `companies`: `companies` → `all`, `company-detail` → `view`, `company-edit` → `edit`, `company-new` → `new`
  - `contacts`: `contacts` → `all`, `contact-detail` → `view`, `contact-edit` → `edit`, `contact-new` → `new`
  - `user-admin`: `users` → `all`, `users-view` → `view`, `users-edit` → `edit`, `users-invite` → `new`, `check-invite-email` → `check`
  - `user-account`: `profile` → `view`, `edit-profile` → `edit`, `create-profile` → `new` (`login`/`logout`/`verify-email-request` unchanged)
  - `release-notes`: `release-notes` → `view`
  - `notifications`: `inbox` → `all` (`link`/`invalid` unchanged)

  Plugin defaults updated to match: `SmartDescriptions` now defaults `contactDetailPageId` to `contacts/view` and `companyDetailPageId` to `companies/view`; `EventsTimeline` schema example updated.

  Also includes two fixes to the contacts new page: removed a duplicate avatar render (the avatar block was included both directly and via `form_profile`), and fixed the post-create redirect that was navigating with a null `_id` because CallAPI return values are accessed at `_actions: <id>.response.response.<field>`, not `.response.<field>`. Same redirect fix applied to the companies new page.

## 0.1.1

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.

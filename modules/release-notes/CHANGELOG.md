# @lowdefy/modules-mongodb-release-notes

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

- [#302](https://github.com/lowdefy/modules-mongodb/pull/302) [`308e228`](https://github.com/lowdefy/modules-mongodb/commit/308e2281e862c001b6ec2748376b2e37eed0bc0b) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **release-notes:** an announced release note now reaches the app's members. `release.announced` stores the note and a recipient row per person the audience reaches, and answers `{ notified, emailed, opted_out }`. A detached `deliver` chain copies the note's images and videos into the public files bucket and sends each person one `release-note` notification per version, in the bell and by email. The new exported `sweep` endpoint restarts a chain that stalled.

  Migration:

  - Set `CRON_SECRET` in the app's environment, which detached endpoint calls need.
  - Add an app endpoint that calls `release-notes/sweep` every 10 minutes with a `schedules:` cron, as the module docs show.

- [#302](https://github.com/lowdefy/modules-mongodb/pull/302) [`aeb1397`](https://github.com/lowdefy/modules-mongodb/commit/aeb1397c251322885efbefcf93d7ee424ecd7720) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **release-notes:** the release note email now shows the note's body, with its headings, lists, links and images, and a footer link to turn release emails off on What's new. A video in the note becomes a link to the note on What's new. Pelican's new `release.test` event sends that email to one address, so the team can check it before announcing; it writes nothing and rings no bell.

  **notifications:** a new exported `send-email` endpoint renders one notification and emails it to one address without storing it, for test sends.

  Migration:

  - An app that restyles the email with `email_template` adds the body to its copy of the template, as the module docs show. Without it, its email carries no body.

- [#302](https://github.com/lowdefy/modules-mongodb/pull/302) [`9602441`](https://github.com/lowdefy/modules-mongodb/commit/960244158955c99253f0867f2a23e82346da0059) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **release-notes:** What's new lists the notes announced to the signed-in person, newest first, beside the one picked (`urlQuery.note`, else the newest). Images and videos embedded in a note load from the public files bucket; one not copied yet shows a placeholder. A New mark clears once the person has opened the note, in every organisation. A switch at the foot, **Email me about new releases**, saves the person's choice; `urlQuery.section=email` scrolls to it. The menu link now reads "What's new".

  The module now reads the `FILES_S3_BUCKET_PUB` secret.

  Migration: set `FILES_S3_BUCKET_PUB` (the files module's public bucket) for the app.

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

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

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

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.2

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

### Patch Changes

- [#31](https://github.com/lowdefy/modules-mongodb/pull/31) [`fcd328b`](https://github.com/lowdefy/modules-mongodb/commit/fcd328b031df108450147a91b87d85a508c1f008) Thanks [@Yianni99](https://github.com/Yianni99)! - Small UX fixes across modules and the EventsTimeline block:

  - `release-notes`: Empty-state fallback now triggers when `content` is null OR an empty/whitespace-only string. The previous `_if_none` only caught null, so consumers with an empty `CHANGELOG.md` saw a blank Card instead of the "No release notes available yet" message.
  - `companies` / `contacts` / `user-admin` table components: Added a conditional `overlayNoRowsTemplate` that renders "Loading…" while the `get_all_*` request is in flight and "No rows" once the request completes empty. Previously AG Grid's default "No Rows To Show" appeared during the initial load, indistinguishable from a genuinely empty result.
  - `EventsTimeline` (plugin): Avatar hover swapped from `<Popover>` to `<Tooltip>` so it matches the timestamp's TimeAgo style — same name-on-hover, lighter dark-tooltip styling.

## 0.1.1

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.

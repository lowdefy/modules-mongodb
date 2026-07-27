# @lowdefy/modules-mongodb-notifications

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

# @lowdefy/modules-mongodb-walkthroughs

## 1.3.0

## 1.2.0

## 1.1.0

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

## 0.48.0

## 0.47.0

### Minor Changes

- [#264](https://github.com/lowdefy/modules-mongodb/pull/264) [`63377c4`](https://github.com/lowdefy/modules-mongodb/commit/63377c45495cf0c95a5d50cbe98a3410910531e0) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: Unpublish, and let the consuming app gate Publish

  - An Unpublish button in the editor and an `unpublish-walkthrough` endpoint take a published walkthrough down. Its steps move back into the draft, so nothing is lost, and publishing again brings it back. A new `on_unpublished` var runs after it, like `on_published`. A walkthrough that was ever live carries an `unpublished` stamp and can't be deleted, since links to it may remain.
  - New `publish_blocked` and `publish_blocked_reason` vars on the `editor` component. While `publish_blocked` is true, Publish stays disabled and its tooltip gives the reason, so an app can require something, such as a category, before a walkthrough goes live.
  - New `publish_pending` var keeps Publish enabled when the walkthrough has no unpublished edits, for an app setting that goes live only when published.

## 0.46.0

## 0.45.0

## 0.44.2

### Patch Changes

- [#256](https://github.com/lowdefy/modules-mongodb/pull/256) [`ad8022d`](https://github.com/lowdefy/modules-mongodb/commit/ad8022d8995b48c4f4879fd9c8bb470042d9c8cb) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: Publish in the editor now saves before it publishes

  Publish moved the last save, not the screen, so an author who edited and clicked Publish without saving
  published the older version, or found Publish disabled. It now saves what is on screen first. It is
  enabled when there is a saved draft or an unsaved edit, and disabled in Preview.

## 0.44.1

### Patch Changes

- [#254](https://github.com/lowdefy/modules-mongodb/pull/254) [`ac11cc9`](https://github.com/lowdefy/modules-mongodb/commit/ac11cc9ed809c6f3738a0eccf0209ab4fae4cb6b) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: publishing now requires a title

  An untitled draft could be published, leaving a live walkthrough with no name to show. `publish-walkthrough`
  now refuses a draft whose saved title is blank, and the editor marks Title required and disables Publish
  while it is empty.

## 0.44.0

## 0.43.1

### Patch Changes

- [#239](https://github.com/lowdefy/modules-mongodb/pull/239) [`95c2cc3`](https://github.com/lowdefy/modules-mongodb/commit/95c2cc3108eb9040df3069c6c6696d4921a78e81) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: the editor now sets `walkthrough_missing`, which the player it mounts for Preview reads

  An app building the editor page on Lowdefy 5 failed its build with a warning that the page referenced
  `walkthrough_missing` but never set it. `load` now sets it to false when it resets the editor.

## 0.43.0

### Minor Changes

- [#237](https://github.com/lowdefy/modules-mongodb/pull/237) [`4ca9350`](https://github.com/lowdefy/modules-mongodb/commit/4ca9350cf1e467d17c5b70253f58e1ce6da45272) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: a new walkthrough is stored on its first save, not when the editor opens

  **Breaking:** `create-walkthrough` is removed. Open the editor with no `walkthrough_id` instead, and
  `load` starts a new walkthrough under an id it mints. Nothing is written until the author saves:
  `save-draft` with a null `updated_timestamp` inserts the walkthrough, and refuses an id that already
  exists. Before, every press of a New button stored an empty walkthrough whether or not anyone saved
  it.

  A walkthrough that has never been published can now be deleted: `delete-walkthrough`, and a Delete
  button in the editor with an `on_deleted` hook. It follows the `deleted` change-stamp soft delete
  used across the modules, and every read and update now skips a deleted walkthrough. A published one is
  still retired rather than deleted, since other records may point at it.

  `save-draft` now requires `walkthrough_id` to be a uuid on every save, as `presign-step-image`
  already did, since a first save inserts under it.

  To upgrade, an app that gives the authoring endpoints their own `auth.api.roles` entry removes
  `walkthroughs/create-walkthrough` from it and adds `walkthroughs/delete-walkthrough`. Left out, the
  new endpoint is open to any signed-in user.

  `get-walkthrough` now returns null for a walkthrough that is unknown, deleted or never published,
  where it used to return an empty one, and the player says the walkthrough is not available.
  `save-draft` also checks each step's screenshot key against the layout the module issues.

  Fixes:

  - Saving while in Preview stored a draft with no steps. Save is now disabled in Preview.
  - Discard on a walkthrough that was never published emptied it. It is disabled until the
    walkthrough has been published once; Delete covers the case before that.
  - A picked PNG was stored labelled as a JPEG. A picked file that is not a JPEG is now re-encoded.
  - A capture whose upload failed left an empty step behind. The step is now added only after the
    upload succeeds.
  - A new walkthrough starts with an empty title rather than the text "Untitled walkthrough".
  - Uploading over plain HTTP failed with a script error, and the capture block pointed authors at
    uploading. Both now say screenshots need HTTPS.
  - Double-clicking Share a screen could leave a screen share running after the editor closed.

  `load` also no longer throws when there is nothing to fetch. Lowdefy evaluates an action's params
  before its `skip`, so its seeding step used to run against a draft that was never loaded.

## 0.42.0

### Minor Changes

- [#234](https://github.com/lowdefy/modules-mongodb/pull/234) [`a52d4dd`](https://github.com/lowdefy/modules-mongodb/commit/a52d4dd5679334463076e94aa3f2c92ba226c8c8) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: a new module for step-by-step guides

  Step-by-step walkthroughs, stored and played in-app rather than at a third-party host. A
  walkthrough is a title, an overview and an ordered list of steps; a step is a caption with an
  optional screenshot and an optional focus point marking where the highlight belongs. The
  annotation is held as data, so a highlight can be moved without re-shooting the step.

  The module ships the data model, a player that renders one step at a time, and an editor that
  works on a draft and publishes it explicitly — what a reader sees changes only when the author
  says so. Authoring is off unless the app sets `writable`, which keeps both connections read-only
  and makes every authoring endpoint refuse outright.

  `WalkthroughCapture`, `WalkthroughImageTarget` and the `WalkthroughUploadStepImage` action are new
  in the plugins package. Capture shares a window or screen and returns a still frame; the upload
  action hashes the bytes, asks for a presigned policy and posts it.

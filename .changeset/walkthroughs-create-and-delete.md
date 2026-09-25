---
"@lowdefy/modules-mongodb-walkthroughs": minor
"@lowdefy/modules-mongodb-plugins": patch
---

walkthroughs: a new walkthrough is stored on its first save, not when the editor opens

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

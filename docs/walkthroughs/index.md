---
title: Walkthroughs
module: walkthroughs
type: index
---

# Walkthroughs

A walkthrough is a title, an overview and an ordered list of steps. A step is a caption, optionally
a screenshot, and optionally a focus point marking where on that screenshot the highlight belongs.
The module owns that data model and the player that renders one step at a time. Whether it also
authors them is decided per mount: the `writable` var defaults to `false`, which keeps the module
read-only — it plays what is in the collection and writes nothing. A consumer that sets
`writable: true` turns on write for the collection and the screenshot bucket, and unlocks its
authoring endpoints.

It owns no domain knowledge. What a walkthrough is about, which walkthroughs a surface carries, and
where they are linked from are all the consuming app's business — keep that in the app and pass
anything the module needs as a var.

## Dependencies

None. It owns no domain knowledge, so it depends on no other module — including `events`, whose
change stamp it keeps its own copy of (see [Change stamps](../shared/change-stamps.md)).

## When to use

Add `walkthroughs` when an app needs to show users how to do something inside it, and wants those
guides held in its own database and bucket rather than at a third-party host.

## Mounting

```yaml
- id: walkthroughs
  source: 'github:lowdefy/modules-mongodb/modules/walkthroughs@v0.42.0'
```

`source` can equally be a `file:` path against a local checkout. The module declares
`@lowdefy/community-plugin-mongodb` (`^3`), `@lowdefy/plugin-aws` (`^5`) and
`@lowdefy/modules-mongodb-plugins` (`^0.42.0`), which carries its blocks and its upload action, so
the app must list all three plugins, and it reads four secrets:
`MONGODB_URI`, `FILES_S3_BUCKET_PUB`, `FILES_S3_ACCESS_KEY_ID` and `FILES_S3_SECRET_ACCESS_KEY`.

## Vars

| Var          | Type    | Default        |                                                                  |
| ------------ | ------- | -------------- | ---------------------------------------------------------------- |
| `collection` | string  | `walkthroughs` | MongoDB collection holding walkthroughs.                        |
| `region`     | string  | required       | AWS region, used only to compose the screenshot URL.            |
| `writable`   | boolean | `false`        | Whether this app may author walkthroughs.                       |

## Secrets

| Secret                       |                                                                    |
| ---------------------------- | ------------------------------------------------------------------ |
| `MONGODB_URI`                | MongoDB connection URI.                                            |
| `FILES_S3_BUCKET_PUB`        | Bucket holding the screenshots; its objects are publicly readable. |
| `FILES_S3_ACCESS_KEY_ID`     | Access key id used to sign upload policies for that bucket.        |
| `FILES_S3_SECRET_ACCESS_KEY` | Secret access key used to sign upload policies for that bucket.    |

The bucket is a secret rather than a var because it differs per environment, and a var is fixed at
build time where one config builds every environment. The player's request composes
`https://{FILES_S3_BUCKET_PUB}.s3.{region}.amazonaws.com/{image.key}` server-side, so each
environment resolves its own bucket with nothing to remember at deploy.

**Two limits come with that, deliberately.** The URL is composed in the AWS bucket-hosted shape, so
serving the screenshots from a CDN, a path-style endpoint or a non-AWS store means changing the
module rather than a value. And Lowdefy remaps a module's connections but not its secrets, so a
consuming app must name its own variable `FILES_S3_BUCKET_PUB` exactly. Replacing both with a
single secret holding the whole origin would remove them; it was weighed and deferred, because the
gain is hypothetical until there is a second consumer and the cost is a new value in every
environment.

## Connections

`walkthroughs-collection`, a `MongoDBCollection` on `collection`, namespaced as
`walkthroughs/walkthroughs-collection` once mounted (`_module.connectionId: walkthroughs-collection`
from inside the module). Its write property is `{_module.var: writable}`, so it is read-only unless
the mounting app turns that on.

`screenshots-bucket`, an `AwsS3Bucket` on `region` and `FILES_S3_BUCKET_PUB`, carries the same
`{_module.var: writable}` gate — separately, since write is a property of each connection and
gating the collection does nothing for the bucket.

## Documents

```
_id        uuid
title      string | null                 published; null until first publish
overview   string | null                 published
steps      Step[]                        published; ordered, position is the array index
draft      { title, overview, steps }    null/absent = no unpublished changes
published  changeStamp | null            null = never published
retired    changeStamp | null            non-null hides the walkthrough from new use
created    changeStamp
updated    changeStamp
```

`title`, `overview` and `steps` are the **published** content — what the player renders and what a
consumer projects. `draft` is the working copy and the only thing editing writes; publishing copies
it up and clears it. That split is why the player and any consuming sync need no knowledge that
drafts exist.

`published: null` and `retired: null` are different facts. Never-published and withdrawn-after-a-life
are separate states, and a consumer deciding what to offer has to be able to tell them apart.

A step:

```
_id      uuid
caption  string                          markdown; a hard line break is meaningful
image    { key, width, height } | null   null = a caption with no screenshot
focus    { x, y, shape, scale } | null   null = no highlight on this step
```

A change stamp is `{ timestamp, user: { id, name } }`.

Steps are embedded rather than a second collection: a read always wants the whole walkthrough, and
reordering stays one atomic write.

### Screenshots

`image.key` is an object key, not a URL, so the serving decision stays changeable. The key is

```
walkthroughs/{walkthrough_id}/{step_id}-{content_hash}.jpeg
```

The hash earns its place three times over. A step keeps its `_id` when its screenshot is
re-captured, so a key without the hash would be byte-identical before and after an edit and nothing
downstream could tell the two apart. It also makes every object immutable, so the bucket can be
served with a far-future cache header and a re-capture is never a stale-CDN problem. And
re-capturing a step that has not actually changed on screen produces the same key, so nothing is
written and nothing republishes.

`image.width` and `image.height` are the screenshot's own pixel dimensions.

The module owns this upload path rather than leaving it to the app: `presign-step-image` (see
[Endpoints](#endpoints)) composes the key and returns a presigned POST against
`screenshots-bucket`. Because the policy fixes the key at issue time and the key carries the
content hash, the caller hashes the image bytes first and passes the hash in — the endpoint only
signs.

### Focus points

`focus.x` and `focus.y` are in **image pixel space** — the coordinate system of that step's own
`image.width` × `image.height` — never display space. That is the only convention that survives the
image being rendered at any size. `shape` is `circle`. `scale` multiplies the indicator's base size.

Zoom is **not** stored. The player derives it from the focus point and the image's dimensions, and
clamps at 1:1 — an image is never magnified past its natural resolution, which is what lets a
capture come from any screen without a quality gate.

### Retirement

A walkthrough is retired by stamping `retired`, never deleted. Anything that stored an `_id` — a
registry row, a link, a citation — keeps resolving, so a retired walkthrough reads as withdrawn
rather than as a broken reference.

## Endpoints

`get-walkthrough` serves the player and is available wherever the module is mounted. The other six
author, and every one of them refuses outright when `writable` is false — including the draft read,
because a draft is unpublished content and the connection's write flag would not have stopped it
being read.

| Endpoint              | Payload                                      | Returns                                                                           |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `get-walkthrough`     | `{walkthrough_id}`                           | Published content, image keys resolved to URLs                                    |
| `create-walkthrough`  | `{}`                                         | `{_id, updated_timestamp}`                                                        |
| `get-draft`           | `{walkthrough_id}`                           | `{_id, title, overview, steps, published, retired, updated_timestamp, has_draft}` |
| `save-draft`          | `{walkthrough_id, updated_timestamp, draft}` | `{updated_timestamp}`                                                             |
| `discard-draft`       | `{walkthrough_id, updated_timestamp}`        | `{updated_timestamp}`                                                             |
| `publish-walkthrough` | `{walkthrough_id, updated_timestamp}`        | `{updated_timestamp}`                                                             |
| `presign-step-image`  | `{walkthrough_id, step_id, content_hash}`     | `{url, fields, key}`                                                              |

Ids are namespaced by the mount, so an app calls them as `walkthroughs/save-draft`.

`get-draft` falls back to the published `title`/`overview`/`steps` where there is no draft, so opening
a never-edited walkthrough starts from what is live, and reports `has_draft` so a caller can show
whether there are unpublished changes.

**The draft is replaced wholesale.** `save-draft` sets it from the payload and never merges, which
makes reordering an ordinary save. A walkthrough is small enough that an editor holds all of it.

**Every write filters on `updated.timestamp` and returns the new one.** A caller passes the timestamp
it last received; a write that matches nothing is refused with a message saying the walkthrough
changed elsewhere. Authoring is a sequence of saves, so a caller that kept its original timestamp
would collide with its own previous write — it must replace the held value from each response.

Two gates are needed in an authoring app, not one. `writable` keeps authoring out of the apps that
should not have it; inside the app that should, the endpoints carry their own `auth.api.roles` entry.
A page role stops someone opening an editor and does nothing about a direct call, and
`auth.api.protected: true` on an endpoint matching no role means authenticated, not authorized.

## Components

Four, pulled in with a `_ref` naming the mount:

```yaml
- _ref:
    module: walkthroughs
    component: editor
```

| Component | Kind        |                                                               |
| --------- | ----------- | ------------------------------------------------------------- |
| `player`  | block       | Renders one step at a time from the `walkthrough` state key.  |
| `open`    | action list | Loads the walkthrough named by `walkthrough_id` and plays it. |
| `editor`  | block       | Authors one walkthrough's draft. Needs `writable`.            |
| `load`    | action list | Loads the draft named by `walkthrough_id` into the editor.    |

Neither block loads itself: `player` is loaded by `open`, and `editor` by `load`. A modal's blocks
mount with the page rather than when it opens, so a load inside the player would fire once against
no id and never again; and a page context is memoized on the page id alone, so an editor that
loaded itself went on showing the first walkthrough when a second was opened without a full reload.

A consumer sets `walkthrough_id` and then runs the matching action list. **Set it from the page's
`onMount`, not its `onInit`** — `onInit` is latched once it has run, so returning to the same page
with a different id never re-runs it, while `onMount` re-fires because the block tree is remounted.
Place the editor on a page rather than in a modal.

It holds the draft in `walkthrough_draft`, the selected position in `walkthrough_edit_index` and the
concurrency token in `walkthrough_updated`, and replaces the token from every write's response — the
endpoint contract above only works if the caller does.

**`on_published` is an action list run after a publish succeeds**, empty by default. What a newly
published walkthrough should trigger elsewhere — a search index, a sync, anything — is the
consuming app's business, so the editor takes it as a `_ref` var rather than calling anything by
name:

```yaml
- _ref:
    module: walkthroughs
    component: editor
    vars:
      on_published:
        - id: sync_after_publish
          type: Request
          params: some_app_request
```

Its frame is the player's, with `WalkthroughImageTarget` from `@lowdefy/modules-mongodb-plugins` in
place of the player's `Img`: same dimensions, same focus point, same ring, so what an author lines
up is what a reader sees. Preview goes further and mounts `player` itself against the draft, which
is why the editor must not be placed on a page that also mounts `player` separately — the block ids
would collide.

**Screenshots are uploaded by the editor, not by the block that picks them.** The key carries a
SHA-256 of the bytes and the presigned policy fixes the key, so the bytes are hashed before the
policy is asked for. `S3UploadButton` cannot do that — it asks a page request for a policy given
only the file's name, size and type, and never sees the bytes — so it is used as a file picker
whose upload is cancelled, and the `WalkthroughUploadStepImage` action hashes, presigns and posts.
That action is in the plugin rather than in this YAML because `_js` operators are synchronous while
`crypto.subtle.digest` is not, and because `_state` and `_actions` deep-copy through JSON, which
turns a Blob into `{}` between one action and the next.

**Capture is the same path, entered differently.** `WalkthroughCapture` shares a window or a screen —
never the tab being documented — shows it live, and returns a still frame as an object URL, which is
what `WalkthroughUploadStepImage` already takes as its `source`. So a captured frame and a picked
file hash, presign and post identically, and both end in `actions/apply-step-image.yaml`. Capture is
offered as a new step as well as over the selected one, because a walkthrough is shot as a run.
Clicks are not detected: the author presses Capture at each step and then clicks the image to place
its highlight. A browser without `getDisplayMedia` — or an insecure origin, which amounts to the same
thing — gets no Share control and a line saying to upload instead.

**The editor rebuilds each image key on load.** `get-draft` resolves keys to URLs and drops the key,
and `save-draft` stores keys, so the key is rebuilt from the `walkthroughs/{walkthrough_id}/{file}`
layout above — from this module's own invariant, not by stripping the URL's origin, which belongs to
the app's bucket. A freshly uploaded step is shown from the local file until the next load, because
the origin is composed server-side and the editor never learns it.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI`, `FILES_S3_*` connection secrets

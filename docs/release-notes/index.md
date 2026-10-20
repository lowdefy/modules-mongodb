---
title: Release Notes
module: release-notes
type: index
concepts: [release-notes, announcements, audiences, pelican]
---

# Release Notes

Release notes the team writes and announces from [Pelican](https://pelican.lowdefy.app). Pelican sends each announcement, with who it goes to, through the [support](../support/index.md) module's signed webhook; this module answers it from the app's own members. The module ships the What's new page and its menu link.

Before anyone announces, Pelican asks the app who an announcement would reach: the module answers live counts for each audience the app declares, each organisation, and the whole selection, with the version the app runs.

When the team announces, the module stores the note and who is owed it, copies the note's images and videos into the public files bucket, and sends each person one `release-note` notification per version: in the bell, and by email unless the announcement or the person turned email off.

## Dependencies

| Module                                     | Why                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- |
| [layout](../layout/index.md)               | Page wrapper                                                     |
| [notifications](../notifications/index.md) | The bell notification and email an announcement sends            |
| [files](../files/index.md)                 | The public files bucket a note's images and videos copy into     |
| [events](../events/index.md)               | Change stamps on notes and on each person's release email choice |

The app also needs the [support](../support/index.md) module, wired to Pelican with its key, webhook secret and webhook address. Release events arrive on its webhook; this module has no secret or address of its own.

## Installing

```yaml
# modules.yaml
- id: release-notes
  source: "github:lowdefy/modules-mongodb/modules/release-notes@v1.0.0"
  vars:
    region: eu-west-1
    audiences:
      - id: dispatchers
        label: Dispatchers
        query: { app_roles: dispatcher }
      - id: technicians
        label: Field technicians
        query: { app_roles: technician }
- id: support
  source: "github:lowdefy/modules-mongodb/modules/support@v1.0.0"
  vars:
    app_version: 1.4.0 # the app's bare X.Y.Z version
    release_notes_endpoint: release-notes/receive
    # ...the support module's other vars
```

- **The support module's `release_notes_endpoint`** names this module's receiver by its full endpoint id: `{entry id}/receive`. With it null, the support webhook answers every release event 404, "This app does not take release notes", which Pelican shows on the announce form.
- **The support module's `app_version`** is the version Pelican compares with the release it announces, so it can warn while a deploy is still running. Set it from the app's build, such as `_build.env: APP_VERSION`.
- **The files module's public bucket**, `FILES_S3_BUCKET_PUB`, and its region in `region`.
- **`CRON_SECRET`** in the app's environment. Delivery runs as a chain of detached endpoint calls, which Lowdefy refuses without it.
- **A scheduled call to `release-notes/sweep`** every 10 minutes, from a small app endpoint with a `schedules:` cron, registered in the app's `api:` section:

```yaml
# api/release-notes-sweep.yaml
id: release-notes-sweep
type: InternalApi
schedules:
  - cron: "*/10 * * * *"
routine:
  - id: sweep
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: sweep
          module: release-notes
      payload: {}
```

- **The notifications module's unique index on `key`** (see its docs). It is what stops a person getting a second notice for a version.
- **The What's new link**, from the module's `default` menu:

```yaml
links:
  _ref:
    module: release-notes
    menu: default
```

## What's new

The module's `view` page lists the notes announced to the signed-in person, newest first, with a New mark until they open one. Beside the list it shows one note: version and date, headline, preview and body. On a phone the list stacks above the note.

- **Which note**: `urlQuery.note`, a note's `_id` (`{repository}@{version}`). An unknown note, or one the person was not announced, shows their newest. The bell notification and the email link here with `{ pageId: release-notes/view, urlQuery: { note } }`.
- **New**: showing a note sets `opened_at` on the person's own recipient row. Its mark clears once they move to another note or come back, in every organisation.
- **Embeds**: each `[[file:name]]` in the body becomes the file's plain public URL (`https://{FILES_S3_BUCKET_PUB}.s3.{region}.amazonaws.com/{key}`), built on the server: an image shows inline, a video as a player and any other file as a link. A file not copied yet, or not on the note, shows a placeholder line rather than a broken image.
- **Email me about new releases**: a switch at the foot that writes the person's `release-notes-preferences` row. `urlQuery.section=email` scrolls to it, for the email footer's link.

## Audiences

`audiences` lists the groups of the app's members Pelican can announce to. Everyone is always offered besides them. Each is `{ id, label, query }`, where `query` is a MongoDB filter over the person's row in the auth `user-members` collection: `app_roles`, `attributes`, or any other field the row holds.

```yaml
audiences:
  - id: managers
    label: Managers
    query:
      app_roles: manager
  - id: team-alpha
    label: Team Alpha
    query:
      attributes.team: alpha
```

## Who the app's members are

The app's members are its rows in `user-members`, one per person per organisation. The auth `users` collection can span several apps, so it is never the source of a count or a recipient: it is read only for the name and email of people a member row matched.

- **Pinned policy**: the rows of the app's one organisation. Pelican gets no organisations to pick from, and a selection's `organizations` is ignored.
- **Tenant policy**: the rows of every organisation. Pelican picks from the organisations that have members, by name from `user-organizations`.

A selection is `{ audiences, organizations: { mode, ids } }`. `audiences` is null for everyone, or a list of audience ids (one person in two audiences counts once). `mode` is `all`, `only` (the organisations in `ids`) or `except` (all but those). A person in several organisations counts once, in their earliest membership among the rows matched. A member row whose user is gone reaches nobody.

## Release events

The support webhook checks Pelican's signature, then calls the module's `receive` endpoint with `{ delivery, app_version }` and answers with what it returns. `receive` is an `InternalApi`, so nothing else can reach it.

### `release.audience`

`{ event, at, selection }`. Answers, well within Pelican's five seconds:

```json
{
  "version": "1.4.0",
  "audiences": [{ "id": "managers", "label": "Managers", "count": 12 }],
  "organizations": [{ "id": "org-1", "name": "Acme", "count": 40 }],
  "totals": { "app": 52, "email": 49, "opted_out": 2 }
}
```

- `version`: the support module's `app_version`.
- `audiences`: each declared audience counted alone over the selection's organisations.
- `organizations`: under tenant, each organisation with members, counting the people the selection's audiences reach in it, by name. `[]` under pinned.
- `totals`: for the whole selection, the people reached in the app, the people who would be emailed (with an address, and not opted out), and the people who turned release emails off.

A bad selection answers 400 naming the field: an audience id the app does not declare, or a `mode` other than the three. Any other release event answers 400, "Unknown release event".

To try it on a dev server, `apps/demo/scripts/release-audience-check.mjs` posts signed deliveries to the support webhook and checks the counts, under either policy.

### `release.announced`

`{ event, at, delivery_id, release, audience, email }`. `release` is `{ id, repository, version, released_at, title, preview, body, media: [{ name, content_type, url }] }`, each media `url` a presigned link; `audience` is a selection as above; `email: false` sends no email. The module does only quick database writes before it answers, then hands the rest to `deliver`, detached:

1. Stores the note, keyed `{repository}@{version}`. The first release announced for a version keeps its note; a later delivery for the same version, from the same release or another Pelican space's, changes nothing but the source links and content types of media not yet copied.
2. Writes a recipient row for every person the audience reaches, one per person per version. A person who already has one keeps it, so they are told about a version once.
3. Answers `{ notified, emailed, opted_out }`, counted from the rows this delivery added: the people who will get a notice, those of them who will be emailed, and those who turned release emails off. A repeated delivery answers zeros.

A release without its repository and version, or a media file without a name, answers 400. A media file sent with no `url` or `content_type` is stored as not copied, so What's new shows its placeholder, and `deliver` leaves it until a later delivery for the version brings both.

To try it on a server, `apps/demo/scripts/release-announced-check.mjs` posts signed announcements to the support webhook and checks the rows, the notifications and the sweep, under either policy.

## Delivering

`deliver` runs in its own function call, does one bounded piece of work and calls itself, detached, while work remains:

1. **Media.** Copies one file not yet copied from its source link into the public files bucket at `release-notes/{repository}@{version}/{name}`, and marks it copied. A file already in the bucket is not fetched again. A copy that fails is logged and left for the sweep.
2. **Notices.** Takes up to 100 recipient rows not yet notified, all in one organisation, and dispatches the `release-note` notification to them through the notifications module. Under the tenant policy the dispatch is bound to that organisation, so the notice lands in its bell; a person in several organisations gets it in their earliest membership's. Each item's key is `release-note:{note id}:{user id}`, so a repeat never notifies twice. The email is left out when the announcement had `email: false` or the person turned release emails off. A person whose user is gone is skipped.

A detached call runs once and is not retried. `sweep` restarts any note no `deliver` call has worked on for 10 minutes that still has recipient rows not notified, written more than 10 minutes ago, or media not copied, with a source link and content type, whose source links are under 7 days old.

## The notification

The module ships the `release-note` NotificationEmail: the headline as title and subject, the preview, and a button to the note on What's new. To restyle it, copy it into the app's own `notifications:` config and set `email_template` to its id. The template gets `title`, `preview`, `version`, `note_id` and `links.button`.

## Collections

All three collections hold a row per app or per person, not per organisation, so their connections stand outside the tenant wall (`tenant: shared`), and every read and write filters by `user_id` or the note key. Their change logs go to `log-changes-system`.

### `release-notes`

One per announced version.

| Field           | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| `_id`           | `{repository}@{version}`                                                               |
| `release_id`    | Pelican's release id                                                                   |
| `repository`    | The repository the release is of                                                       |
| `version`       | The version                                                                            |
| `released_at`   | The release date                                                                       |
| `title`         | The headline                                                                           |
| `preview`       | The preview line                                                                       |
| `body`          | The note's markdown, with its `[[file:name]]` embeds                                   |
| `media`         | `[{ name, content_type, key, source_url, copied }]`: each file's public key and source |
| `created`       | Change stamp                                                                           |
| `updated`       | Change stamp                                                                           |
| `delivering_at` | When a `deliver` call last worked on the note                                          |

### `release-notes-recipients`

One per person per note.

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| `_id`             | `{note_id}:{user_id}`                                    |
| `note_id`         | The note's `_id`                                         |
| `user_id`         | The person                                               |
| `organization_id` | The organisation their notice goes to; null under pinned |
| `email`           | The announcement's email flag                            |
| `notified`        | Whether their notice has been dispatched                 |
| `opened_at`       | When they first opened the note on What's new, or null   |
| `created`         | When the row was written                                 |

### `release-notes-preferences`

One per person who changed their choice.

| Field     | Value                                   |
| --------- | --------------------------------------- |
| `_id`     | The user id                             |
| `email`   | false once they turn release emails off |
| `updated` | Change stamp                            |

### Required indexes

The module cannot create indexes. Create these on `release-notes-recipients` with the app's index tooling (e.g. splice-actions):

```js
db["release-notes-recipients"].createIndex({
  note_id: 1,
  notified: 1,
  created: 1,
});
db["release-notes-recipients"].createIndex({ user_id: 1, created: -1 });
```

`release-notes` and `release-notes-preferences` need none beyond `_id`.

## Reference

- [Vars](reference/vars.md): all module vars with types, defaults, and descriptions

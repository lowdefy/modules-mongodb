# Reporting ownership: visibility, favourites, retirement, and the endpoints over them

A sub-design of [`reporting/ux`](../design.md) — read its [data model](../design.md#data-model) and [cross-cutting invariants](../design.md#cross-cutting-invariants) first.

Today a saved report is readable only by its author, retirable only by its author, and that is the whole model: `list-reports` matches `owner.user_id`, `resolve-report` matches `_id` **and** `owner.user_id`, and there is no notion of a report anyone else can see. This sub-design gives reports an audience and a life cycle — private by default, publishable to the whole app by a role-holder, favouritable per user, retired by one soft delete, recoverable — and puts every one of those acts behind a server-side check.

**This sub-design is server-side only, and it ships first.** No page changes. The reports data model, the scope semantics and the authorization checks land with tests, so the four UI sub-designs build against a fixed contract instead of co-evolving with one. The three surfaces that read this model are [reports-list](../reports-list/design.md), [report-page](../report-page/design.md) and [save-as-report](../save-as-report/design.md); none of them decides anything here.

Conversation documents already carry `owner`, `created` and `updated`; the `deleted` stamp they still need belongs to the rail that needs it — see [chat](../chat/design.md). The report ownership model has nothing to say about conversations.

## Proposed change

1. Reports are **private to their author** by default. A `visibility: private | shared` field opens one to the whole app, settable only by a user holding one of the roles listed in a new **`share_roles`** var (a string array — more than one role can carry the privilege). Unset means no publishing at all.
2. **Publish and unpublish are one reversible act** via a single `set-report-visibility` endpoint, with exactly two states: only me, or everyone in the app. No per-user grants, no groups, no share links.
3. Every mutation is **owner-checked server-side** — rename, publish, unpublish, delete, restore, fix-a-section, continue-in-chat — and every read-only act (open, favourite, download a section, duplicate) is not. **Duplicate** is the non-owner's path to a version they control.
4. Add **per-user favourites** (`favourite_of: [user_id]`, projected to a boolean for the caller) so one user's ★ is not everyone's, and they work on shared reports you do not own.
5. Keep **soft delete as the only retirement** — no archive state. Deleting a published report drops it from everyone's Shared scope for free, because every read filters the stamp.
6. **Restore returns a report to private**, in the same update that clears the marker. There is no purge endpoint.
7. Rewrite **`list-reports`** to take a server-side `scope` (mine / shared / favourites / deleted) plus search, sort and cursor, and open **`resolve-report`** to shared reports while telling the page whether the viewer is the owner.

## Current state

- `modules/reporting/api/generate-report.yaml` — inserts `{ _id, owner, title, description, spec, conversation_id: null, deleted: null, created, updated }`. The `conversation_id: null` carries a comment recording why: tool endpoints receive only the tool input, so the agent context (conversation id) does not reach them.
- `modules/reporting/api/list-reports.yaml` — own-only (`owner.user_id` match), `deleted.timestamp: { $exists: false }`, sort `updated.timestamp: -1`, `limit: 200`, projection `title/description/created/updated`. No scope, search, sort or cursor parameters.
- `modules/reporting/api/delete-report.yaml` — already a correct soft delete: owner-scoped, writes a `deleted` change stamp from `defaults/change_stamp.yaml`, and excludes already-deleted docs so a repeat delete reports 0 modified rather than overwriting the original who/when.
- `modules/reporting/api/resolve-report.yaml` — loads the report matched on `_id` **and** `owner.user_id`, so today a report is readable only by its author; rejects on not-found (the `Dynamic` block renders its fallback), runs each query section through `AnalyticsPipeline` inside `:try`, compiles server-side.
- `modules/reporting/defaults/` — two fragments every endpoint composes from: `owner.yaml` (`{ user_id, name }`) and `change_stamp.yaml` (`{ timestamp, user: { name, id } }`). Both take the id from `_user: id`, the repo-wide identity key — see [the identity key](#the-identity-key-is-_user-id-not-sub--id) below for why reporting no longer derives its own. Reporting declares no dependencies, so it does not consume the events module's exported `change_stamp` component — but the shape is identical, and that is a deferred choice rather than a limit.
- `docs/shared/soft-delete.md` — the repo idiom: field `deleted`, shape `{ timestamp, user: { name, id } }`, initialised `null`, read predicate `deleted.timestamp: { $exists: false }`. No module in this repo has an archive state.

## Key decisions and rationale

### Private by default; publishing is role-gated, binary, and reversible

Most users should only ever see their own reports. A user holding any role in `share_roles` may publish one to the **whole app** — the same shape an existing app already uses for its saved exports (per-user documents matched on the creator's id, plus a curated set everyone can read).

Publishing is binary and reversible: `private` or `shared`, toggled in one place, with no per-person or per-team grants and no share links. Anything finer needs an access model this module does not have, and inventing one here would mean owning it forever. `share_roles` is plural because more than one role can legitimately carry the privilege; unset means the app has no publishing at all, and the control is then **absent** rather than disabled — a disabled toggle teaches a capability the user cannot have.

**Publish is independent of everything else.** Unpublishing does not archive, delete, unfavourite or move a report; it changes exactly one field. Conversely a deleted report cannot be published, because a deleted report is not readable at all.

### Ownership is enforced server-side, on every write

The menus differ between owner and non-owner, but the menu is not the boundary. Every write — rename, publish, unpublish, delete, restore, fix-a-section, and the continue-in-chat hand-back, which exposes the author's conversation — matches the caller against the report's owner in its own endpoint. A hidden menu item is a UX affordance; the match is the authorization.

Likewise the list's **scope match is the authorization boundary**, which is exactly why the scope has to be a server parameter rather than a client-side filter over an "everything" response. A single endpoint returning everything and letting the client pick would make Shared and Mine cosmetic.

### Non-owners get read-plus-duplicate

Open, favourite, download a section, duplicate — and the edit actions are _absent_, not disabled. **Duplicate** is the escape hatch that makes this comfortable: rather than a request-access dance, copy a shared report into your own and change it freely. The copy is always private and owned by the copier, with `favourite_of` reset; the original is untouched.

### Favourites are per-user

A ★ on a shared report must not be everyone's ★, so favourites are stored as `favourite_of: [user_id]` on the report doc and projected to a boolean for the caller. They are a read-side marker, so they work on reports you do not own, and they drive both the Favourites scope and the default sort.

The array is the right shape at module scale — the Favourites query is a single `favourite_of: <user_id>` match. If an app ever has hundreds of users favouriting one report, the array becomes a hot document and the answer is a `report_favourites` join collection; that is a mechanical swap behind the same two endpoints.

### Soft delete is the only retirement

The wireframes originally carried both archive and delete. They collapsed to one because no module in this repo has an archive state, and the established idiom is a `deleted` change stamp with reads filtering `deleted.timestamp: { $exists: false }`. Two retirement acts would mean two states to reconcile against visibility (is an archived-but-published report visible? to whom?), a fourth list scope to explain, and a second thing to test.

One soft delete also buys a consequence for free: because every read filters the stamp, deleting a published report removes it from everyone's Shared scope without a separate unpublish step.

**Nothing in this module hard-deletes.** The delete confirm says so — "nothing is queried again and no data is touched" — because "Delete" over a data tool reads as destructive and the reassurance is true: the module never writes to the source collections at all.

### Restore returns a report to private

**Restore always writes `visibility: private`** in the same update that clears the marker. Silently re-publishing something deleted months ago would hand it back to the whole app before anyone re-read the numbers. Republishing is one deliberate click afterwards. (Reversing this — restoring the previous audience exactly — is a one-line change if a real case argues for it.)

The recovery surface itself — a quiet page rather than a fourth list scope — is [reports-list](../reports-list/design.md#recovery-is-a-page-not-a-scope)'s decision. What belongs here is that its read is `list-reports` with `scope: deleted`, **still owner-matched**: you never see anyone else's deleted reports, including ones that were published to you.

There is no permanent-delete action anywhere, and adding one would be the single irreversible act in an otherwise recoverable system.

### The identity key is `_user: id`, not `sub ?? id`

Reporting briefly derived its ownership key as `_if_none: [_user: sub, _user: id]`, in a `defaults/user_id.yaml` fragment `_ref`'d by eleven sites. That is now plain `_user: id`, matching every other module in the repo — events' exported `change_stamp` (`modules/events/module.lowdefy.yaml:49`), `deals/api/create-deal.yaml:33`, `files/requests/upload-policy.yaml:35`, all seven notifications requests.

The `sub ?? id` form was never a decision. It arrived with the conversation writers and spread when a later commit noticed reporting held two identity keys and standardised reports onto the conversations one rather than the other way round. Three reasons to undo it:

**Its recorded rationale was false.** The fragment claimed `sub ?? id` was "what the agent framework derives when it invokes an onFinish hook". It isn't: `handleAgentChat.js` runs hooks through `context.callEndpoint(endpointId, { payload })` with the request context, so `_user` inside a hook resolves exactly as in a browser-invoked endpoint. Where the framework does express a precedence — `createSessionCallback.js`, for `session.hashed_id` — it is `id ?? sub`, the reverse order, and it never touches `_user`.

**It is dead weight in the normal case.** `createSessionCallback.js` builds `session.user` from the standard OIDC claim set on the JWT, which always carries both `id` and `sub`; `auth.userFields` then sets its mapped fields on top. Auth.js sets `token.sub = user.id` at sign-in, so in any adapter-backed app that maps `userFields: { id: user.id }` — as `apps/demo/lowdefy.yaml:79` does — `sub` and `id` hold the same value.

**Where it is not dead, it is harmful.** The divergent case is an app that deliberately maps `userFields.id` to something other than the JWT subject — an employee number, a contact id. `_if_none` prefers `sub`, so in exactly that case reporting would key ownership on the provider subject while events, notifications, files and deals key on the app's chosen id: one person, two identities, and reporting rows that can never be joined to any other module's data.

The case the `sub ?? id` form was defending against — an app that declares no `userFields.id` — is already broken repo-wide for that app: events would write `id: null` stamps and every notifications filter would match nothing. `userFields.id` is a de-facto host-app contract, and reporting hedging against its absence bought nothing while breaking joins for apps that had chosen a different id deliberately.

`defaults/user_id.yaml` is deleted rather than reduced to `_user: id`. Its stated purpose was to stop a non-trivial derivation drifting between readers and writers; with a bare `_user: id` there is nothing to drift, and no other module wraps the operator. (The drift argument was already only half-true in practice — six sign-in guards spelled `sub ?? id` inline while the fragment sat beside them.)

Migration is a non-issue anywhere `sub == id`, which is every adapter-backed app.

### Reporting writes its own change stamp, for now

Reporting declares no module dependencies, so it writes the stamp shape from its own `modules/reporting/defaults/change_stamp.yaml` — a within-module `_ref` needs no dependency, and five endpoints write a stamp, so the shape lives in one file rather than being copied into each of them. `restore-report` and every other new writer `_ref` the same fragment.

**Note — the events module already exports a `change_stamp` component, and reporting could use it.** This is a choice, not a limitation, and earlier revisions of this design stated it as though reporting "cannot" reuse it. It can: `modules/events/module.lowdefy.yaml` exports `change_stamp` (:14) whose component resolves to `_module.var: change_stamp` (:88), and every other module in the repo consumes it as

```yaml
updated:
  _ref:
    module: events
    component: change_stamp
```

The gain is more than deduplication. Because the component resolves to the **events entry's var**, an app that adds a field to its audit stamps — a tenant id, an app name, a request id — sets it once on the events module entry and every consuming module picks it up. Reporting's local fragment is invisible to that, so an app doing this today would end up with reporting stamps that differ from the rest of its collections.

The cost is that reporting stops being dependency-free. Every app installing reporting would also have to install and wire `events`, and reporting is the module most likely to be dropped into an app standalone — it is an analytics surface, not part of the entity graph the other modules share. That is the whole of the trade-off, and it is why the local fragment stands for now.

**Not implemented here.** Deliberately deferred rather than resolved: it is a manifest change plus five `_ref` swaps, it is independent of everything else in this sub-design, and it wants a view on whether reporting should be allowed to depend on events at all — which is a module-graph question, not an ownership one.

## Data model

The table is in the [parent](../design.md#data-model). What this sub-design adds is the semantics:

- **`visibility`** — absent is read as `private`, so existing documents need no migration. Only `set-report-visibility` writes it, and `restore-report` forces it to `private`.
- **`favourite_of`** — absent is read as empty. `$addToSet` / `$pull` only; never overwritten wholesale. Projected out of every list and read response as a boolean `is_favourite` for the caller, so a caller never learns who else favourited a report.
- **`owner`** — `{ user_id, name }`. `owner.user_id` is the authorization key every scope filter and every mutation matches; `owner.name` is carried so a list row or report header can name the owner without a lookup. `duplicate-report` writes the copier as owner of the new document; nothing rewrites it on an existing one, though the shape does not preclude a transfer later — which is the point of it not being the `created` stamp (see the [parent](../design.md#data-model)). The id is `_user: id` — see [the identity key](#the-identity-key-is-_user-id-not-sub--id).
- **`created` / `updated` / `deleted`** — change stamps, all three. `created` is written once on insert; `updated` on every spec change; `deleted` by the soft delete, which refuses to overwrite an existing one. Reads filter on `deleted.timestamp`, and the list sorts on `updated.timestamp`. Because `created` carries `user.name`, the [report page](../report-page/design.md)'s provenance line needs no extra lookup to say who made a report.

## Endpoints

| Endpoint                | Status  | Shape                                                                                                                                                                                                                   |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-reports`          | rewrite | `{ scope: mine \| shared \| favourites \| deleted, search?, sort?, cursor? }`; scope match is the authz boundary. Returns display fields plus section-type counts, filter count, visibility, publisher, `is_favourite`. |
| `set-report-visibility` | new     | `{ report_id, visibility }` — owner-checked **and** role-checked, both directions.                                                                                                                                      |
| `set-report-favourite`  | new     | `{ report_id, favourite }` — `$addToSet` / `$pull` on `favourite_of`. Readable-report check, not owner.                                                                                                                 |
| `set-report-title`      | new     | `{ report_id, title }` — owner-only.                                                                                                                                                                                    |
| `duplicate-report`      | new     | `{ report_id }` → new doc, `visibility: private`, owner = caller, `favourite_of: []`. Readable-report check.                                                                                                            |
| `restore-report`        | new     | `{ report_id }` — owner-only; clears `deleted` and sets `visibility: private` in one update.                                                                                                                            |
| `delete-report`         | keep    | Already a correct owner-scoped soft delete.                                                                                                                                                                             |
| `resolve-report`        | change  | Read match becomes `_id` + not-deleted + (`owner.user_id` = caller **or** `visibility: "shared"`); returns whether the viewer is the owner so the page can render owner-only actions.                                   |

**"Readable-report check"** means the same predicate `resolve-report` uses: not deleted, and owned by the caller or shared. Favourite and duplicate use it because both are read-side acts on something you are already entitled to see.

`create-report` is the fifth writer of this model and is specified in [save-as-report](../save-as-report/design.md) — it is the one endpoint whose shape is driven by the sheet rather than by the model.

## Vars

`share_roles` — string array, no default. Unset means the app has no publishing: `set-report-visibility` rejects every call, and the Shared scope is always empty. Full `description` / `type` in `modules/reporting/module.lowdefy.yaml`, then `pnpm docs:gen`.

## Files changed (anticipated)

- `modules/reporting/api/list-reports.yaml` — rewritten with the scope parameter, search, sort, cursor, and the richer projection.
- `modules/reporting/api/resolve-report.yaml` — read match opened to shared; returns the owner flag.
- New `modules/reporting/api/set-report-visibility.yaml`, `set-report-favourite.yaml`, `set-report-title.yaml`, `duplicate-report.yaml`, `restore-report.yaml`.
- `modules/reporting/api/generate-report.yaml` — insert shape gains `visibility: "private"` and `favourite_of: []`. (`conversation_id` is already on the document, still null on this path.)
- `modules/reporting/module.lowdefy.yaml` — `share_roles`, plus the new endpoint exports.
- `docs/reporting/` — a concepts page for ownership / visibility / retirement, and regenerated `reference/vars.md`.

## Demo consumers

These are the shared fixtures the UI sub-designs all build on, so they are seeded here:

- Seeded reports covering **private, shared, and favourited**, with at least one owned by a **second user** so the non-owner view (read-plus-duplicate, absent edit actions, "Published by") is actually exercised.
- `share_roles` set on the demo module entry, and a demo user holding the role plus one who does not.
- At least one soft-deleted report so the recovery page renders with a real stamp.

Verify with `pnpm ldf:b` from `apps/demo`.

## Resolved questions

Resolved 2026-07-29, carried over from the parent design.

1. **Archive or delete?** Delete only. No module in this repo has an archive state, and the soft-delete stamp is the established idiom.
2. **Does reporting already soft-delete correctly?** Reports yes (`delete-report` writes the stamp, owner-scoped, and won't overwrite an existing one). Conversations have no delete at all, so that endpoint is new — see [chat](../chat/design.md).
3. **Can reporting reuse the events module's `change_stamp` component?** Yes, technically — the earlier "no" was wrong. Events exports it and every other module consumes it; reporting doesn't only because it declares no dependencies and that is worth keeping for now. See [Reporting writes its own change stamp, for now](#reporting-writes-its-own-change-stamp-for-now) for the trade-off and why it is deferred rather than settled.
4. **Where does the publish capability come from?** A `share_roles` string array var, checked server-side on `set-report-visibility`. Modelled on an existing app's saved-exports pattern: per-user documents matched on the creator's id, plus a set everyone can read.

## Deviations from the wireframes

1. **The read predicate is `deleted.timestamp: { $exists: false }`**, not `deleted: null` as the plates' notes phrase it. The plates describe the idiom loosely; `docs/shared/soft-delete.md` is canonical, and it treats a document as live whether `deleted` is absent, null, or an object without a timestamp.

## Risks

- **The list endpoint carries the authorization boundary.** Scope, search, sort and paging all now happen server-side, which is correct, but it means a bug in the scope match is a confidentiality bug rather than a display bug. It needs tests per scope, including "shared" excluding deleted and "deleted" being owner-only.
- **`favourite_of` on the report doc** is a shared-document write per favourite. Fine at module scale, hot at hundreds of users per report; the join-collection swap is known but unbuilt.
- **Restore-to-private will occasionally annoy** someone who deliberately deleted a published report and wanted it back exactly as it was. Accepted: the failure mode in the other direction is republishing to the whole app without anyone re-reading the numbers.

## Non-goals

- **Per-user or per-team sharing, groups, share links, or request-access flows.** Two states, plus duplicate.
- **A purge / permanent delete.**
- **An archive state.**
- **Conversation ownership.** Conversations are already own-only and stay that way; their delete and `updated` field belong to [chat](../chat/design.md).

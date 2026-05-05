# Review 3 — Second pass against existing modules

Focus: claims and shapes that review-1 verified at the surface level but
which break when checked against the actual files / actions involved.
Six findings, all with concrete fixes.

## Factual errors

### 1. Files-module integration shape is wrong on every detail

> **Resolved.** Attachments section rewritten: files keyed by `(entity_type: 'activity', entity_id: <uuid>)`, activities ships a local `tile_files.yaml` wrapping `files.file-card` (mirroring companies/contacts), no typed `activity_id` field on file records. File tree gains a `tile_files.yaml` entry under `components/`. Drops the false `tile_files` import from the files module and the `reference_field`/`reference_value` vars that don't exist.

**Design section:** "Data model → Attachments" (`design.md:92-101`).

The design says:

> "The file record carries an `activity_id` reference; the activity's
> detail page queries the files collection to list them. This matches
> how `companies` handles attachments…"
>
> "`tile_files` (from the `files` module) is embedded in the activity
> detail page's sidebar with `reference_field: activity_id`."

Three things are wrong:

1. **There is no `tile_files` export from the `files` module.**
   `modules/files/module.lowdefy.yaml:39-48` exports `file-manager`,
   `file-card`, `file-list`. `tile_files` lives _inside_ each entity
   module that wants attachments — `modules/companies/components/tile_files.yaml`
   is a 7-line wrapper that refs `files.file-card`.
2. **The vars are `entity_type` + `entity_id`, not `reference_field` /
   `reference_value`.** See `modules/files/components/file-card.yaml:13-16`:
   the card forwards `entity_type` and `entity_id` to `file-manager`. The
   `companies` wrapper at `modules/companies/components/tile_files.yaml:5-7`
   passes `entity_type: company` plus `entity_id: { _url_query: _id }`.
3. **Files don't carry a typed `activity_id` field.** They store the
   tuple `(entity_type, entity_id)` — that's the indexing surface.

**Fix:** rewrite the section as a one-line wrapper plan, mirroring
companies:

- Add `modules/activities/components/tile_files.yaml` ref'ing
  `files.file-card` with `entity_type: activity` and
  `entity_id: { _url_query: _id }`.
- Drop the prose about a typed `activity_id` reference field — files are
  keyed by `entity_type: activity` + `entity_id: <activity uuid>`.
- The detail-page sidebar embeds the new local `tile_files`, not a
  cross-module one.

The file tree at `design.md:113-167` already correctly omits a
`tile_files` from `modules/activities/components/` — the prose at
L92-101 is the part that needs to align.

### 2. "Matches how `companies.update-company` handles `removed`" — companies doesn't handle it

> **Resolved (Option A — dedicated endpoint).** Replaced "Soft delete (no dedicated endpoint)" section with a `delete-activity` API spec — single-purpose endpoint that sets `removed: change_stamp + updated: change_stamp` under optimistic concurrency, emits `delete-activity` with full references. Mirrors `change-activity-status` and the files module's `delete-file`. `delete-activity.yaml` added to the file tree under `api/`. Drops the false "matches `companies.update-company`" claim and removes the contradiction with `update-activity`'s editable-fields list.

**Design section:** "Soft delete (no dedicated endpoint)"
(`design.md:512-514`).

> "it's a button on the detail page calling `update-activity` with
> `removed: change_stamp`. The `delete-activity` event is emitted by the
> update API when it sees `removed` move from `null` to a stamp.
> (This matches how `companies.update-company` handles `removed`.)"

`modules/companies/api/update-company.yaml` does not handle `removed` at
all. The only mention of `removed` in the companies API tree is
`create-company.yaml:45` setting `removed: null` on insert. Nothing
sets it later, nothing detects the transition, no `delete-company`
event exists in `modules/companies/enums/event_types.yaml`.

Compounding the issue: `update-activity` is described two paragraphs up
(`design.md:482`) as touching "title, description, contact_ids,
company_ids, attributes" — `removed` isn't in the editable-fields list
the API would accept. So the design simultaneously says
`update-activity` accepts `removed` and that it doesn't.

**Fix:** pick one shape and write it through cleanly:

- **A. Dedicated `delete-activity` API.** New endpoint that sets
  `removed: change_stamp`, emits `delete-activity`. Follow the
  `change-activity-status` precedent — single-purpose endpoints make
  the event-emission contract obvious.
- **B. Extend `update-activity` to accept `removed` AND specify the
  pre-load + diff.** Routine becomes: load → run update → if
  `pre.removed === null && post.removed !== null` emit `delete-activity`
  else emit `update-activity`. Spell out the load step, the optimistic
  concurrency filter (see #3), and add `removed` to the editable-fields
  prose.

Either way, drop the "matches `companies.update-company`" claim — it's
the same kind of false-continuity framing review-1 #1 and #7 already
caught. There's no existing pattern here to lean on.

### 3. `removed: null` filter convention isn't what the codebase uses

> **Resolved.** Step 2 of the `create-activity` routine now spells out that list and detail requests exclude soft-deleted docs via `removed.timestamp: { $exists: false }` (the `get_all_companies.yaml` shape), not the literal `{ removed: null }` filter that nothing in the repo uses.

**Design section:** `create-activity` routine, step 2
(`design.md:469`).

> "Insert activity doc with … `removed: null` (matches
> `create-company.yaml`; consumers downstream filter `{ removed: null }`
> on list queries)."

The insert side is right. The consumer-filter claim isn't:

- `modules/companies/requests/get_all_companies.yaml:20-21` filters
  `mustNot: exists: path: removed.timestamp` (correct — checks the
  nested timestamp's existence).
- `modules/companies/requests/get_company.yaml:13-14` filters
  `removed: { $ne: true }` — which is actually buggy (a soft-deleted doc
  has `removed: { timestamp, user }`, an object that is also `≠ true`,
  so this matches deleted docs too). Worth flagging upstream but not
  this design's problem.

No request anywhere filters `{ removed: null }` literally.

**Fix:** rephrase the parenthetical as: _"and `removed: null`
(matching `create-company.yaml`); list / detail requests exclude
soft-deleted docs via `removed.timestamp: { $exists: false }`, the
shape used by `get_all_companies.yaml`."_ The lock-in matters because
`get_activities.yaml` and `get_activities_for_entity.yaml` both have to
pick one and a single sentence in the design saves a copy-paste of the
buggy `$ne: true` form from `get_company.yaml`.

## Under-specified behaviour

### 4. `change-activity-status` has no concurrency control and forgets to bump `updated.timestamp`

> **Resolved.** `change-activity-status` step 3 now `$set`s `updated: change_stamp` alongside the `$push`, with an optimistic-concurrency filter on `status.0.stage` and `updated.timestamp` (both must still match at write time). Prevents simultaneous "Mark done" clicks from double-writing and keeps default sort reflecting status flips. `update-activity` got the same treatment — its prose-only description is now a routine sketch mirroring `update-company.yaml` (concurrency filter + `updated` bump).

**Design section:** `change-activity-status` routine
(`design.md:494-509`).

Two bugs in the same routine.

**Concurrency.** The routine reads `status[0].stage`, branches on it
("if `current === stage`, no-op"), then `$push`es. Two simultaneous
"Mark done" clicks on a still-`open` activity both pass the branch and
both push a `done` entry — `status[0]` ends up `done`, `status[1]`
also `done`, history shows the same transition twice with two slightly
different timestamps.

`modules/companies/api/update-company.yaml:9-13` solves the same class
of problem with optimistic concurrency:

```yaml
filter:
  _id:
    _payload: _id
  updated.timestamp:
    _payload: updated.timestamp
```

`change-activity-status` has the doc loaded already (step 1) — it can
filter on `status.0.stage: <current>` and `updated.timestamp:
<loaded stamp>` at update time. If either has moved, the update misses
and the API returns a stale-state error.

**Default sort breakage.** The routine only `$push`es `status` —
nothing updates `updated`. But decisions.md §3 (`decisions.md:55-69`)
explicitly says lists default-sort by `updated.timestamp desc` so that
"a status flip" surfaces alongside content edits. As written, marking
something done leaves it at its old position; the only way it surfaces
is via someone editing it.

**Fix:** turn step 3 into an `$set` + `$push` with the concurrency
filter, e.g.:

```yaml
filter:
  _id: { _payload: activity_id }
  status.0.stage: { _step: load.0.status.0.stage }
  updated.timestamp: { _step: load.0.updated.timestamp }
update:
  $set:
    updated:
      _ref: { module: events, component: change_stamp }
  $push:
    status:
      $each: [{ stage, created: change_stamp }]
      $position: 0
```

Same treatment applies to `update-activity` — it needs the
`updated.timestamp` filter, just like `update-company`. The design
prose at `design.md:481-484` doesn't show a routine, so this constraint
isn't visible.

### 5. `current_stage` / `completed_at` derived-field "syntax" is JS, not aggregation

> **Resolved (partial — finding overstated).** `current_stage: $arrayElemAt: ["$status.stage", 0]` is actually valid: Mongo projects fields through arrays, so `$status.stage` produces an array of stage strings and `$arrayElemAt` picks index 0. Only `completed_at` was broken (JS dot-access on an aggregation expression). "Derived values (pipeline)" section now keeps the simple form for `current_stage` and uses `$let` + `$arrayElemAt` for `completed_at` / `cancelled_at` / `opened_at`.

**Design section:** "Data model → Derived values (pipeline)"
(`design.md:74-83`).

```yaml
- current_stage: $arrayElemAt: [$status.stage, 0]
- completed_at: $arrayElemAt:
    [{ $filter: { input: $status, cond: { $eq: [$$this.stage, 'done'] } } }.created.timestamp, 0]
```

`current_stage` reads OK (modulo `status.stage` needing a
`$map`-then-`$arrayElemAt` since `status` is an array of objects, not
an array of stage strings — `$arrayElemAt: ["$status.stage", 0]` does
not return the stage of the first entry).

`completed_at` is invalid aggregation — `{...}.created.timestamp` is
JavaScript dot access, not a Mongo expression. To pull the
`created.timestamp` off the first matching entry you need either
`$let` + `$arrayElemAt` + `$$var.created.timestamp`, or a `$map` to
pre-project the timestamp before `$arrayElemAt`.

A reader implementing this from the design will write it three
different wrong ways before getting it right.

**Fix:** spell out the actual expressions. Shape that works:

```yaml
current_stage:
  $let:
    vars:
      first: { $arrayElemAt: ["$status", 0] }
    in: "$$first.stage"
completed_at:
  $let:
    vars:
      done:
        $arrayElemAt:
          - $filter:
              input: "$status"
              cond: { $eq: ["$$this.stage", "done"] }
          - 0
    in: "$$done.created.timestamp"
```

The decision to extract this into
`requests/stages/add_derived_fields.yaml` is right — but the design
prose has to be implementable as written, since the whole point of the
shared stage is that nobody re-derives it.

### 6. `tile_activities` "View all" filter mechanism unspecified

> **Resolved.** "Linking → Forward" now spells out the URL contract: `Link → pageId: { id: all, module: activities }` with `urlQuery: { contact_id }` or `urlQuery: { company_id }` driven by `reference_field`, mirroring `tile_contacts.yaml`'s pattern. The list page section adds a "URL param hydration" paragraph specifying that `pageId: all`'s `onInit` reads `_url_query: contact_id` / `_url_query: company_id` into filter state — same query-string-only convention as `pageId: new`'s URL prefill.

**Design section:** "Linking → Forward" (`design.md:294-300`) and
list-page section (`design.md:520`).

The tile lists "View all" link navigates to the activities list page
"with a pre-applied filter" — but nothing in the design specifies the
URL contract or where the filter state hydrates.

The existing pattern is concrete and copyable —
`modules/companies/components/tile_contacts.yaml:14-24`:

```yaml
events:
  onClick:
    - id: go_contacts
      type: Link
      params:
        pageId: { _module.pageId: { id: all, module: contacts } }
        urlQuery:
          company_id: { _url_query: _id }
```

… and the contacts list page reads `_url_query: company_id` into its
filter state on `onInit`. (`modules/contacts/pages/all.yaml`'s onInit
does this — same place activities' list page would need to.)

For activities, the tile is parameterised by `reference_field`
(`company_ids` or `contact_ids`), so the URL param has to vary too —
either `?company_id=…` or `?contact_id=…`. The list page hydrates both,
narrowing the filter to whichever was passed.

**Fix:** add a paragraph under "Linking → Forward" specifying:

- "View all" link: `pageId: { id: all, module: activities }` with
  `urlQuery: { contact_id }` or `urlQuery: { company_id }` depending on
  the tile's `reference_field`.
- `pages/all.yaml` `onInit` (or `onMountAsync`): `SetState` on `filter`
  with `contact_id`, `company_id` from `_url_query`, falling back to
  the page's existing filter shape.

This also lets the deep-link contract on `/activities` mirror what
`/activities/new` already specifies (`design.md:407-417`).

## Convention nit

### 7. Page IDs and file names diverge from the entity-module convention

> **Resolved.** File tree renamed: `pages/all.yaml`, `view.yaml`, `edit.yaml`, `new.yaml`, with the page IDs annotated in line comments (`pageId: all`, etc.). Matches companies/contacts and aligns with the Pages section headers Sam's URL fix already moved to `pageId: ...`.

**Design section:** file tree (`design.md:128-132`).

Design lists:

```
pages/
├── activities.yaml              # list
├── activity-detail.yaml         # view
├── activity-edit.yaml           # edit existing
└── activity-new.yaml            # create
```

Both companies and contacts use semantic, entity-free names:

- `modules/companies/pages/`: `all.yaml`, `view.yaml`, `edit.yaml`,
  `new.yaml`. Page IDs inside: `id: all`, `id: view`, `id: edit`,
  `id: new` (`pages/all.yaml:5`, `pages/view.yaml:5`).
- `modules/contacts/pages/`: identical layout.
- Cross-module navigation uses
  `_module.pageId: { id: all, module: contacts }` (e.g.
  `tile_contacts.yaml:18-21`) — works because every entity module has
  the same four IDs.

The activities tree's entity-prefixed names break the shorthand.
`tile_activities`'s "View all" link (#6) and the cancel/back buttons on
edit/new pages would all need entity-aware ID strings.

**Fix:** rename to `pages/all.yaml`, `view.yaml`, `edit.yaml`,
`new.yaml`; page IDs to `all`, `view`, `edit`, `new`. Activities then
slots into the existing `_module.pageId: { id: all, module: activities }`
pattern uniformly.

Mechanical, but #6's URL contract assumes this is fixed first.

---

## Summary

Two are design-breaking:

- **#1** — files integration as written can't be implemented (no
  `tile_files` export, wrong vars, wrong reference shape).
- **#2** — soft-delete contradicts itself and leans on a
  `companies.update-company` pattern that doesn't exist.

Two are routine bugs that bake in once implementation starts:

- **#4** — `change-activity-status` will double-write under
  concurrency and won't bump default-sort timestamps.
- **#5** — derived-field expressions aren't valid aggregation.

Two are tighten-the-spec items:

- **#3** — pick the actual `removed.timestamp` filter shape, not the
  literal `removed: null` one nothing in the repo uses.
- **#6** — URL-param contract for "View all" filter is missing.
- **#7** — page filenames / IDs diverge from the convention #6 implicitly
  relies on.

Net: review-1 cleaned up the surface ("does this YAML quote the right
operator names"), and the design's structure is sound. This pass surfaces
the next layer down — claimed continuity with the existing modules that
isn't there, and routines that don't survive the second read.

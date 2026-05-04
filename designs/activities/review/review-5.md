# Review 5 — Manifest, event-emission shape, cross-module export surface

Focus: third pass against the actual `companies` / `contacts` / `events`
module manifests and `update-company.yaml`'s emit sequence. Reviews 1, 3
and the two consistency passes covered file naming, soft-delete, derived
fields, capture flow, and URL contracts. This pass surfaces what's left:
how the design participates in the **manifest schema**, the **event-emit
call shape**, and the **cross-module export topology** — three areas the
prior passes treated lightly.

## Factual errors

### 1. "Filter shape used by `get_all_companies.yaml`" — it's Atlas Search, not `$match $exists`

> **Resolved.** `create-activity` routine step 2 now distinguishes the two shapes: list requests use Atlas `compound.filter.mustNot: exists: path: removed.timestamp` (matching `get_all_companies.yaml`); detail and tile requests use plain `$match: { 'removed.timestamp': { $exists: false } }`. Inline warning added against copying `get_company.yaml`'s buggy `removed: { $ne: true }` form. Indexes section gains an Atlas Search index entry covering the list-page filter fields, mirroring companies' `$search` pattern.

**Design section:** `create-activity` routine, step 2
(`design.md:529`).

> "List and detail requests exclude soft-deleted docs via
> `removed.timestamp: { $exists: false }`, the shape used by
> `get_all_companies.yaml` — not `{ removed: null }` literally."

`modules/companies/requests/get_all_companies.yaml:18-21` doesn't filter
that way. It uses Atlas `$search`:

```yaml
- $search:
    compound:
      filter:
        - compound:
            mustNot:
              - exists:
                  path: removed.timestamp
```

This is an Atlas Search `exists` operator on the search index, **not** a
`$match` with `$exists`. Activities' list will be a `MongoDBAggregation`
on the `activities` collection — whether it uses Atlas `$search` (and
therefore needs an Atlas index covering `removed.timestamp`, plus
search-side filter clauses) or `$match` (no Atlas dependency, simpler
indexes) is the actual decision the design implies but doesn't make.

For-entity-tile lookups (`get_activities_for_entity`) almost certainly
won't use Atlas Search — they're keyed by `contact_ids`/`company_ids`
membership and want the cheap btree. So you'll end up with two filter
shapes: Atlas `mustNot exists` on the list page, `$match` on the tile.

**Fix:** rewrite the parenthetical to:

> "List requests filter via Atlas Search `compound.filter.mustNot:
> exists: path: removed.timestamp` (matching `get_all_companies.yaml`).
> Detail and tile requests use plain `$match: { 'removed.timestamp': {
> $exists: false } }`. Don't copy `get_company.yaml`'s `removed: { $ne:
> true }` form — it's a known bug that matches deleted docs (the
> `change_stamp` object is also `≠ true`)."

### 2. `target.type_label` in `event_display` template — derivation unspecified

> **Resolved.** "Events emitted" now spells out the `target` object built at each emit site, including the `target.type_label` lookup via `_get` over the merged `activity_types` enum (build-time `from`, runtime `key` from `_payload.type`). Falls back to the raw type string if the lookup misses. Factored into a shared `defaults/event_target.yaml` `_ref` so the six emit sites don't duplicate the snippet. Resolves the implementer-facing gap left by the original prose-only mention.

**Design section:** "Events emitted" (`design.md:302`).

> "The `event_display` default provides Nunjucks titles like
> `{{ user.profile.name }} logged a {{ target.type_label }} with
> {{ target.title }}`."

`modules/companies/api/update-company.yaml:128-138` shows the `target`
object is built explicitly at the API call site:

```yaml
target:
  name:
    _payload:
      _module.var: name_field
```

Companies only need `target.name`, derived by reading the
`name_field`-keyed value off the payload. Activities' template needs
both `target.title` (trivial — `_payload: title`) **and**
`target.type_label`, which is the human label from the
`activity_types` enum (e.g. type=`call` → label=`"Call"`).

The design doesn't say how `target.type_label` is computed at the
emit site. Three reasonable options, all with tradeoffs:

- **(a) Resolve at the API call site** by indexing the merged
  `activity_types` enum: `_build.object.get` (or equivalent build-time
  operator chain) on `_module.var: activity_types` keyed by the
  payload's `type` field, picking the `.title`. Build-time-only, no
  runtime cost — but couples the API to the enum's shape.
- **(b) Pass the raw `type` string and resolve in Nunjucks** —
  requires the Nunjucks context to carry the full enum, which the
  events module's `_nunjucks` invocation at
  `update-company.yaml:128-132` doesn't currently do.
- **(c) Make `event_display` per-type** — one template per event_type,
  with the type label hardcoded into the template prose (e.g.
  `"logged a Call"` for `complete-activity-call` events). Forces an
  event-type explosion (`complete-call`, `complete-meeting`, …); a bad
  fit.

Recommend **(a)**, and show the resolved snippet in the design so the
implementer doesn't pick (b) and find out at runtime that the enum
isn't in scope. Roughly:

```yaml
target:
  title: { _payload: title }
  type:  { _payload: type }
  type_label:
    _build.object.get:
      on:
        _build.object.assign:
          - _ref: enums/activity_types.yaml
          - _module.var: activity_types
      key: { _payload: type }
      key_chain: ".title"
```

(Or whichever build-time operator chain matches the codebase's actual
`_build.object.get` shape — verify against existing usage. The point is
to anchor the implementer.)

### 3. `change-activity-status` "Load activity" step is novel — and avoidable

> **Accepted.** Load step kept. The novelty vs `update-company.yaml` is real but deliberate — it buys idempotent UX on concurrent same-direction status flips (user A marks done, user B clicks Mark done before refetching → B silently succeeds in step 2 rather than getting a stale-state error). The cost is one extra Mongo round-trip per status change, acceptable for an interactive multi-user CRM button. Step 1 of the routine now carries an inline note explaining this so a future reader doesn't read the load as accidental.

**Design section:** `change-activity-status` routine
(`design.md:524-560`).

Step 1 says "Load activity, read `status[0].stage` and
`updated.timestamp`," then step 3 filters on
`_step: load.0.status.0.stage` and `_step: load.0.updated.timestamp`.

`modules/companies/api/update-company.yaml:9-13` doesn't load. It
takes `updated.timestamp` from the payload (pre-loaded by the form's
detail request) and uses it directly in the filter:

```yaml
filter:
  _id: { _payload: _id }
  updated.timestamp: { _payload: updated.timestamp }
```

Same race protection (optimistic concurrency); no extra round-trip; no
`_step` reference coupling the update to the load step's `id`. The
client already has `current_stage` and `updated.timestamp` — they came
back from `get_activity` or `get_activities`.

**Fix:** drop the load step. Take `expected_stage` and
`updated_timestamp` in the payload alongside `activity_id` and
`stage`, filter on both at write time:

```yaml
filter:
  _id: { _payload: activity_id }
  status.0.stage: { _payload: expected_stage }
  updated.timestamp: { _payload: updated_timestamp }
```

Match-count check determines the no-op case (if `result.matchedCount
=== 0` because `status.0.stage` already equals the requested stage,
return without erroring; if it's 0 for any other reason — concurrent
write — return stale-state). Mirrors `update-company`'s shape, removes
the prior round-trip, removes the only `_step` use in the routine.

### 4. `tile_activities` as a cross-module export departs from the existing tile/timeline pattern

> **Resolved (Option A — match convention).** Cross-module export renamed from `tile_activities` to `activities-timeline` (content-only: list, filters, View-all link; no card, no embedded capture button). Each consuming module ships a local `tile_activities.yaml` wrapper parallel to its `tile_events.yaml` — sets the `layout.card` title, embeds `capture_activity` in `header_buttons` with entity-specific prefill and an `on_created` that refetches the embedded timeline, and embeds `activities.activities-timeline` as the body. File tree updated. "Linking → Forward" rewritten to show the local-wrapper YAML. "Built-in placements" `tile_activities` header bullet updated. "Files changed / Touched modules" gains the two new local wrappers in companies + contacts. Integration section updated. Mirrors the `events.events-timeline` ↔ `tile_events.yaml` pattern already used by every entity module.

**Design section:** "Linking → Forward" (`design.md:308-344`).

The design exports `tile_activities` as a cross-module component and
expects companies/contacts to embed it directly:

```yaml
- _ref:
    module: activities
    component: tile_activities
    vars:
      reference_field: company_ids
      reference_value: { _url_query: _id }
```

The repo's actual pattern is the opposite. `events` exports
`events-timeline` (the content block); each consuming module ships a
**local** `tile_events.yaml` wrapper. See
`modules/companies/components/tile_events.yaml`:

```yaml
_ref:
  module: layout
  component: card
  vars:
    title: Activity              # consumer-set
    blocks:
      - _ref:
          module: events
          component: events-timeline
          vars:
            reference_field: company_ids
            reference_value: { _url_query: _id }
```

The consumer wraps the cross-module timeline in its own
`layout.card`, sets the title locally, can add header buttons (see
`modules/companies/components/tile_contacts.yaml:6-24` —
`header_buttons` are set in the wrapper, not the cross-module
component), and slots into `components.sidebar_slots` as the
**wrapper**, not the timeline.

The design's `tile_activities` collapses both layers: it's the card
+ the content. Consumers can't change the title without forking the
component (which means losing the ability to update centrally), and
header buttons baked into `tile_activities` (the embedded
`capture_activity` button) are non-overridable.

Two paths:

- **A.** Match the existing pattern: rename the cross-module export
  to `activities-timeline` (content-only — list + filters, no card,
  no embedded capture button). Each consumer ships a local
  `tile_activities.yaml` wrapper that sets `title: Activity`, adds
  the `capture_activity` to `header_buttons`, and embeds
  `activities-timeline`. Companies and contacts each get a 12-line
  wrapper, parallel to the `tile_events.yaml` they already have.
- **B.** Acknowledge the departure, justify it (consumer
  uniformity? fewer wrappers? both?), and add `title` /
  `header_buttons` / `extra_blocks` vars to `tile_activities` so
  consumers can override per placement.

Recommend **A**. The repo has 5 entity modules already shipping
`tile_*.yaml` wrappers around cross-module timelines — adding a 6th
that inverts the topology means downstream consumers have to learn
two patterns. The wrapper duplication is real but small (the same
"future cleanup — `tile_files` consolidation" note already in the
design at L119-126 is the right place to bundle this).

If you take **A**, the file tree changes:

- `modules/activities/components/tile_activities.yaml` becomes
  `activities-timeline.yaml` (cross-module export, content-only).
- Add `tile_activities.yaml` to `companies/components/` and
  `contacts/components/` (local wrappers, set `title: Activity` and
  embed `capture_activity` in header).

This also resolves the "auto-wired refetch" mechanism cleanly:
each consumer's local `tile_activities.yaml` knows its own list
request id and wires `on_created` to it directly — no hidden
auto-wiring inside the cross-module export.

### 5. Cross-module export surface is wider than any existing module — and unspecified in the manifest

> **Resolved.** Added a new "Exports" subsection under "Module surface" listing the explicit `module.lowdefy.yaml` exports (pages, connections, api, components, menus) — matches companies' shape. Components list pins the four cross-module exports (`activity-selector`, `activities-timeline`, `capture_activity`, `open_capture`) and names the rest as internal. The subsection also explains why the export surface is wider than companies/contacts (timeline export mirrors `events.events-timeline`; `capture_activity` codifies a modal flow page navigation can't deliver; `open_capture` provides the page-nav equivalent for consumers who want it).

**Design section:** "Module surface" file tree
(`design.md:139-194`); no explicit `module.lowdefy.yaml` exports
section.

Companies' manifest exports exactly **one** component
(`company-selector` — `module.lowdefy.yaml:119-121`). Contacts
exports two (`contact-selector`, `basic-contact-selector` —
`module.lowdefy.yaml:141-145`). The other ~10 components in each
module (form_*, tile_*, table_*, view_*, fields/*, …) are
internal — referenced by the module's own pages, not exported.

The activities design wants to export at least **four**
cross-module components (`tile_activities`, `capture_activity`,
`open_capture`, `activity-selector`) plus a wider surface implied
by the file tree. Two issues:

- **The manifest's `exports.components` list isn't shown.** Future
  reviewers (and the implementer) have no anchor. Worse, the
  decision of which to export bleeds into the cross-module
  consumption story (capture_activity placed by consumers, tiles
  placed by consumers, vs. internal-only).
- **The wider export surface is a real change in convention** that
  isn't called out. `capture_activity` in particular: companies'
  equivalent is `button_new_company.yaml` — internal,
  page-navigating, not cross-module-exposed. Each consumer that
  wants a "New Company" button references companies' page via
  `_module.pageId: { id: new, module: companies }` and styles their
  own button. The activities design proposes the inverse:
  pre-baked button + modal as a cross-module export. Different
  convention, defensible (the modal flow is harder to replicate
  per-consumer), but should be named.

**Fix:** add an explicit `module.lowdefy.yaml` exports section to
the design (companies' shape:
`exports: { pages, connections, api, components, menus }`), list
the cross-module exports, and add a short note in the "Capture
entry points" section explaining the convention shift from
"internal `button_new_*.yaml` + cross-module page nav" to "exported
`capture_activity` modal bundle." One paragraph; pre-empts a future
reviewer asking "why is `capture_activity` cross-module when
`button_new_company` isn't?"

## Under-specified

### 6. `vars` table is markdown-only — manifest needs structured shape

> **Resolved.** Added a one-line note under the "Module vars" heading clarifying that the table is shorthand and pointing at `modules/companies/module.lowdefy.yaml:15-99` as the canonical structured form (`type:`, `default:`, `description:`, nested `properties:` for object-typed vars). Names which flattened keys (`request_stages.*`, `components.*`) expand to nested `properties:` blocks. Implementer cross-references companies' manifest for the actual shape.

**Design section:** "Module vars" table (`design.md:203-220`).

Companies' and contacts' manifests use structured YAML for vars,
not flat key-value:

```yaml
# modules/companies/module.lowdefy.yaml:35-66
fields:
  type: object
  description: ...
  properties:
    attributes:
      default: []
      description: >- ...
components:
  type: object
  description: ...
  properties:
    table_columns:
      default: []
      description: ...
    main_slots:
      default: []
      description: ...
```

The activities design's table flattens `request_stages.write`,
`components.main_slots`, etc. into single rows. An implementer
will need to translate to nested `properties:` blocks; the design
should either:

- show one nested var (e.g. `components.*` or `request_stages.*`)
  expanded into the structured form to confirm intent, or
- add a one-line note: "vars table is shorthand; manifest follows
  the structured `type: object, properties: { … }` shape used by
  `modules/companies/module.lowdefy.yaml:35-100`."

Mechanical, but the unsignalled translation is the kind of thing
that drifts during implementation — a new var added directly to
the table won't reproduce the right manifest shape.

### 7. `excel_download.yaml` missing from the file tree

> **Resolved.** Added `components/excel_download.yaml` and `requests/get_activities_excel_data.yaml` to the file tree, mirroring `modules/companies/components/excel_download.yaml` + `modules/companies/requests/get_company_excel_data.yaml`. The list-page spec already mentions Excel download; the file tree now lists the supporting files.

**Design section:** file tree (`design.md:160-176`); list-page
spec (`design.md:609`).

The list-page spec says: "Standard list page: AgGridBalham table,
filters panel (…), **Excel download**, pagination."

Both companies and contacts ship a dedicated
`components/excel_download.yaml` for this. The activities file
tree omits it. Either:

- The Excel download lives elsewhere (a shared layout block?) — if
  so, name where; or
- Add `excel_download.yaml` under `components/` to match
  companies/contacts.

Likely just a tree omission — `components.download_columns` in
the vars table already implies an Excel exporter exists.

### 8. `actions/` files are CallApi wrappers — call this out

> **Resolved.** Added one paragraph at the top of the "API surface" section listing the four endpoints and explicitly framing the three `actions/` files as CallApi wrappers around `change-activity-status` with the target stage hardcoded. Resolves the API-vs-actions count mismatch a first-pass implementer would otherwise pause on.

**Design section:** file tree `actions/` subtree
(`design.md:189-192`); API surface (`design.md:506-616`).

API surface lists 4 endpoints:
`create-activity`, `update-activity`, `change-activity-status`,
`delete-activity`. The file tree's `actions/` lists three:
`complete_activity.yaml`, `cancel_activity.yaml`,
`reopen_activity.yaml`. There's no "complete-activity" or
"cancel-activity" API.

Implication: the action files are CallApi wrappers around
`change-activity-status` with `stage` hardcoded
(`complete_activity.yaml` calls `change-activity-status` with
`stage: 'done'`, etc.). The design implies this but doesn't say
it. An implementer reading the API surface and the actions list
side-by-side will pause on the mismatch.

**Fix:** one sentence under the API surface intro: "The
`actions/` files are CallApi wrappers around `change-activity-status`
with the target stage hardcoded — they let UI elements (Mark done,
Reopen, Cancel buttons) trigger the transition without rebuilding
the call site each time."

## Convention nit

### 9. `dependencies` `required:` is convention only

> **Resolved.** Added a paragraph under "Dependencies" clarifying that the required/optional distinction is editorial — the manifest's `dependencies:` list (per `modules/companies/module.lowdefy.yaml:5-13`) carries no `required` flag, runtime treats all deps the same. Spells out the failure modes: omitting `contacts`/`companies` produces build-time errors on cross-module refs; omitting `files` only loses the attachment tile.

**Design section:** "Dependencies" (`design.md:223-238`).

The design says contacts/companies are "deliberately required
rather than optional" and `files` is "genuinely auxiliary." But
`modules/companies/module.lowdefy.yaml:5-13` and
`modules/contacts/module.lowdefy.yaml:5-13` declare deps without
any `required:` flag — all four deps in each manifest are listed
uniformly. The runtime treats them all the same; the
required/optional distinction is a design-doc concept only.

**Fix:** add a one-line note under "Dependencies" — "the
required/optional distinction is editorial; the manifest's
`dependencies:` list doesn't carry a `required` flag. The choice
documented here is which deps the module assumes present at
runtime; a consumer omitting `contacts` or `companies` from its
`modules.yaml` will get build-time errors when the activities
module tries to ref `contacts.contact-selector` etc."

Useful for an app developer who reads "files: optional" and
expects a config flag.

---

## Summary

Two findings are design-shape issues worth resolving before
implementation:

- **#3** — `change-activity-status` introduces a load-then-update
  pattern that doesn't appear elsewhere in the repo and isn't
  needed for race protection. Drop the load.
- **#4** — `tile_activities` as a cross-module export inverts the
  existing `tile_events` / `events-timeline` topology. Either
  match the convention (rename to `activities-timeline`, add local
  wrappers) or own the inversion explicitly with the right
  consumer-override vars.

Two are missing-spec items the implementer will guess wrong on:

- **#1** — "filter shape used by `get_all_companies.yaml`" is
  Atlas Search, not `$match $exists`. Spell out the two filter
  shapes the activities requests will use (Atlas for list, plain
  `$match` for tile/detail).
- **#2** — `target.type_label` in the event_display template has
  no derivation path; show the API-call-site target shape with
  the enum lookup.

The rest are editorial nits or anchoring fixes
(manifest exports list, vars structured shape, excel_download
omission, action-file semantics, dependency convention).

Net: the design's structure is sound and the prior reviews tightened
the surface. This pass surfaces the next layer down — places where
"matches existing" was too coarse a claim, and places where the
manifest / event-emission shape will hand the implementer a
half-spec'd task.

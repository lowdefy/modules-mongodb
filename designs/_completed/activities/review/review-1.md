# Review 1 — Verification against existing modules

Focus: checking the design's claims about "existing patterns" against the
actual `companies`, `contacts`, and `events` modules, plus file-convention
and cross-module-ref correctness. Several claims don't match what's in
the codebase.

## Factual errors

### 1. "Existing modules emit events with previous + new linked IDs on re-link" — false

> **Resolved (Option A — drop).** The false "matches existing" claim is removed. `update-activity` now explicitly emits `references` with post-update linked IDs only, matching `update-contact` / `update-company`. A "Future consideration — delink visibility" note is left inline under `update-activity` so we can revisit if silent-unlink confuses users; keeping it out of v1 avoids event-timeline churn from future automated re-linking channels.

**Design section:** `update-activity` API and "Linking" key decisions.

The design says: _"If the update touches linked contacts/companies, the
previous and new linked IDs both go into the event's references so the
event shows up on unlinked entities too (matches how `events` module
handles company-contact re-links)."_

No existing API does this:

- `modules/companies/api/update-company.yaml:117-122` — event `references`
  only contain `company_ids: [_payload: _id]`. Not the current or previous
  linked contact IDs.
- `modules/contacts/api/update-contact.yaml:103-110` — `references` contain
  `contact_ids: [_payload: _id]` and `company_ids: _payload:
global_attributes.company_ids` (the _current_ value only, no previous).

So the stated "matches existing" is wrong, and the delink-visibility
behaviour the design promises (an unlinked contact sees the delink event
on its own timeline) does not actually fall out of copying either
existing update routine.

**Fix:** either (a) drop the claim and the behaviour — match existing
update-X routines which only emit `references` with _current_ linked IDs;
or (b) keep the behaviour as a genuinely new pattern, note explicitly
that it departs from existing modules, and spell out the step that loads
the pre-update linked IDs before writing (Load → merge prev+new →
$set+$pull+$addToSet → emit event with union).

### 2. Cross-module action reference (`_ref: { module: …, action: … }`) isn't a Lowdefy thing

> **Resolved.** Renamed to `open_capture`, moved to `components/open_capture.yaml`, and the cross-module ref now uses `component:`. Noted in the design that there is no `action:` key on `_ref`. File tree updated; the `actions/` section no longer lists this export.

**Design section:** "Capture entry points → `open-capture` action".

The design shows:

```yaml
_ref:
  module: activities
  action: open-capture
  vars: { … }
```

There is no `action:` key on cross-module `_ref`. Grepping the repo for
any `_ref` with a `module:` plus a non-`component`/`path`/`page`/`menu`
key returns nothing. All cross-module reuse in the existing modules goes
through `component:` (e.g., `tile_events`, `change_stamp`,
`events-timeline`, `page`), `path:` (for config-fragment refs), `page:`,
or `menu:`.

**Fix:** export the action sequence as a component (YAML list that
happens to be an action sequence — Lowdefy allows a component to be any
config fragment). File lives at `components/open_capture.yaml` (snake
case), referenced as:

```yaml
_ref:
  module: activities
  component: open_capture
  vars: { … }
```

### 3. `capture_activity` prefill uses `_request: get_contact.0._id` — not the idiomatic path

> **Resolved.** Prefill example now uses `_url_query: _id`, with an inline comment referencing how `tile_events` resolves the same context. Consumers can still pass other operator values; the default matches the detail-page pattern.

**Design section:** "Capture entry points → `capture_activity`" code
example.

The existing detail-page tiles read the entity ID from the URL, not
from a resolved request:

- `modules/contacts/components/tile_events.yaml:10-12` — `reference_value: { _url_query: _id }`.
- `modules/companies/components/tile_events.yaml` — same pattern.
- `modules/companies/pages/company-detail.yaml:44`, `modules/contacts/pages/contact-detail.yaml:54` — both use `_url_query: _id` to resolve the detail-page entity.

`_request: get_contact.0._id` is legal but couples the tile to the
specific request ID of the hosting page, and fails if the host page
happens to name its request differently.

**Fix:** prefer `_url_query: _id` for the default host-page usage in the
design. Consumers who have the ID in state/request can still override.

## Naming collision

### 4. `tile_events` is already labelled "Activity" in the UI

> **Resolved (Option A — rename `tile_events` title).** Both `modules/companies/components/tile_events.yaml` and `modules/contacts/components/tile_events.yaml` will rename `title: Activity` → `title: History`. The new `tile_activities` keeps "Activity". Updated the "Files changed / Touched modules" list in design.md to include both renames, and updated the key-decisions bullet that previously claimed `tile_events` was unchanged.

**Design section:** "Linking → Forward: list of activities on company /
contact detail" and the file tree (`tile_activities.yaml`).

Both `modules/companies/components/tile_events.yaml:5` and
`modules/contacts/components/tile_events.yaml:5` set `title: Activity`
on the layout card. The existing system-events timeline is already
presented to end users as _"Activity"_.

Adding `tile_activities` means a company/contact detail page will have
two cards both plausibly labelled "Activity" — the new one
(user-created activities) and the existing one (system events, already
called "Activity" in production). Users will not be able to tell them
apart.

**Fix:** pick one of:

- **A.** Rename `tile_events`'s user-facing title from "Activity" to
  "History" or "Audit" in both companies and contacts (small, mechanical
  change). Keep `tile_activities` titled "Activity". This matches the
  design's intent — activities are what the user thinks of as
  "activity", events are the system audit trail.
- **B.** Rename the new component to something unambiguous:
  `tile_crm_activities`, `tile_activity_log`, or similar, and keep
  `tile_events` as-is. Less invasive but leaves the naming ambiguity in
  place.

A goes with the design's user-model framing ("activities are what was
done"). Recommend A.

## Inconsistencies with existing module conventions

### 5. Request file names — design uses kebab-case, modules use snake_case

> **Resolved.** File tree renamed: `get_activities.yaml`, `get_activity.yaml`, `get_activity_options.yaml`, `get_activities_for_entity.yaml`, and the `stages/` subtree (`add_derived_fields.yaml`, `match_filter.yaml`, `lookup_contacts.yaml`, `lookup_companies.yaml`). Matches actual convention in contacts/companies and CLAUDE.md.

**Design section:** file tree, `requests/` subtree.

Design lists:

```
requests/
├── get-activities.yaml
├── get-activity.yaml
├── get-activity-options.yaml
└── get-activities-for-entity.yaml
```

Actual modules:

- `modules/contacts/requests/`: `get_contact.yaml`, `get_all_contacts.yaml`, `get_contacts_for_selector.yaml`, `get_contact_companies.yaml`, `get_contact_excel_data.yaml`.
- `modules/companies/requests/`: `get_company.yaml`, `get_all_companies.yaml`, `get_companies_for_selector.yaml`, `get_company_contact_ids.yaml`, `get_company_contacts.yaml`, `get_company_excel_data.yaml`.

All existing module request files are snake*case. This also matches
CLAUDE.md ("Use snake_case for component files, **request files**,
action files, and enum files") and the verb-prefix rule (`get*`, not
`get-`).

**Fix:** rename in the file tree to `get_activities.yaml`,
`get_activity.yaml`, `get_activity_options.yaml`,
`get_activities_for_entity.yaml`, and the corresponding request IDs
inside those files follow the same convention.

### 6. Action file names — same kebab vs snake issue

> **Resolved.** `complete_activity.yaml`, `cancel_activity.yaml`, `reopen_activity.yaml`. `open_capture` moved to `components/` per finding #2, so it no longer appears under `actions/`.

**Design section:** file tree, `actions/` subtree.

Design lists:

```
actions/
├── open-capture.yaml
├── complete-activity.yaml
├── cancel-activity.yaml
└── reopen-activity.yaml
```

Actual modules: `modules/contacts/actions/search.yaml`,
`modules/companies/actions/search.yaml` (snake / single-word). CLAUDE.md
says snake_case for action files.

**Fix:** `open_capture.yaml`, `complete_activity.yaml`,
`cancel_activity.yaml`, `reopen_activity.yaml`. (And, per finding #2,
`open_capture.yaml` likely belongs in `components/` since it's consumed
cross-module.)

### 7. "No reverse denormalization" is a real departure — not a continuation

> **Resolved.** Reworded the key decision in design.md and the entry in decisions.md. Now explicitly frames this as a deliberate departure from `update-company`'s `$pull`/`$addToSet` pattern, with the ingestion-channel multi-collection-write cost as the reason.

**Design section:** key decisions ("Typed linking arrays …, no reverse
denormalization") and decisions.md.

The existing `companies` + `contacts` linking _does_ denormalize:
`modules/companies/api/update-company.yaml:76-101` explicitly
`$pull`s `global_attributes.company_ids` from previously-linked contacts
and `$addToSet`s the new ones. `modules/companies/api/create-company.yaml`
(earlier read) does the same on insert.

The design's "matches the existing pattern" framing is wrong. The repo
_does_ denormalize the parent relationship. Choosing not to denormalize
activity IDs onto contacts/companies is a deliberate and defensible
departure (indexes suffice; sync cost on automated-ingestion write paths
would be non-trivial) — but the design should present it as such
rather than as continuity.

**Fix:** in the decisions.md entry and the "Typed linking arrays" key
decision, reword to: _"Unlike the contact ↔ company relationship
(which denormalizes `company_ids` onto contacts), activities are **not**
denormalized onto contacts/companies. Reason: …"_. Keep the reasoning.

## Under-specified behaviour

### 8. `change-activity-status` routine uses `$push ... $position: 0` without `$each`

> **Resolved.** Step 3 of the routine now shows the full MongoDB update operator (`$push: { status: { $each: [{...}], $position: 0 } }`) with an inline note that `$each` is required whenever `$position` is used.

**Design section:** "`change-activity-status`" API.

The routine says: _"`$push` new `{ stage, created: change_stamp }` to
the front of the status array via `$position: 0`."_ MongoDB's `$push`
requires `$each` when `$position` is specified:

```js
{ $push: { status: { $each: [newEntry], $position: 0 } } }
```

Without `$each`, MongoDB rejects the update. This is implementation-
level but the design's prose is misleading enough that a first-pass
implementer will get it wrong.

**Fix:** correct the shorthand to the `{ $each: [entry], $position: 0 }`
form in the design prose.

### 9. `open-capture` ↔ `capture_activity` interaction isn't specified

> **Resolved (always navigate).** `open_capture` now always navigates to `/activities/new` with prefill as URL params — no modal-targeting logic, no cross-instance state. `capture_activity` remains the export for in-context modal flows. Added a "Future consideration — modal-from-link triggers" note for the table-link / inline-link case so we have a clean path if it surfaces (probably a new export like `capture_activity_link` bundling its own modal, rather than re-introducing the targeting problem).

**Design section:** "Capture entry points → `open-capture` action".

The design says:

- `capture_activity` is a button + modal bundle, placed once per
  instance; multiple instances carry independent state.
- `open-capture` opens "the capture modal" if `capture_activity` is
  present on the page; else falls back to navigation.

When more than one `capture_activity` exists on the page (header button
_and_ a tile header button), which modal does `open-capture` open?
If it's keyed by shared state, either all modals open or they conflict.
If it's keyed by instance, `open-capture` has no way to target a
specific instance.

**Fix:** simplest — drop the "opens the modal if present" behaviour.
`open-capture` always does `mode: page` (navigates to
`/activities/new` with prefill query params). Consumers wanting
modal-in-context use `capture_activity` directly. That keeps each export
single-purpose and avoids the coordination problem.

### 10. `tile_activities` refetch after create — contract vs convenience

> **Resolved.** `tile_activities` description now explicitly states it auto-wires its own list refetch as the embedded `capture_activity`'s `on_created`, with a pointer for consumers placing `capture_activity` elsewhere to mirror the pattern.

**Design section:** "`capture_activity` → `on_created` var" and
"Capture entry points → built-in placements".

The design says `capture_activity` accepts `on_created` as a
consumer-provided action sequence, and that `tile_activities` embeds
`capture_activity` in its header. But the design never says
`tile_activities` passes its own refetch as `on_created` — meaning the
out-of-the-box experience is: user captures an activity from the tile,
modal closes, tile list _does not update_ until a page refresh.

**Fix:** explicitly specify that `tile_activities` wires its own
list-refetch action as `on_created` on the `capture_activity` it
embeds. Document it so consumers placing `capture_activity` elsewhere
(e.g., in a custom panel with its own list) know to mirror the pattern.

### 11. Activity-event payload fields under-specified — `metadata`, `removed: null`

> **Resolved.** `create-activity` routine now explicitly lists `removed: null` on the insert doc and `metadata: { activity_id }` on the emitted event, with a trailing note that the same `metadata` shape applies to every other emitted event (`update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity`).

**Design section:** "`create-activity`" routine, "Events emitted".

Existing modules emit events with both `references` and `metadata`
fields:

- `update-contact.yaml:107-110`: `metadata: { contact_id: _payload: _id }`.
- `update-company.yaml:128-130`: `metadata: { company_id: _payload: _id }`.
- `create-company.yaml` (seen in earlier read): same pattern.

The design specifies `references` but omits `metadata`. Similarly, the
design's create-activity routine lists the fields it inserts but omits
`removed: null` — which `create-company.yaml:38` explicitly sets on
insert and which consumers downstream rely on for `{removed: null}`
filtering.

**Fix:** spell out `metadata: { activity_id: <id> }` on every emitted
event, and add `removed: null` to the `create-activity` insert doc.

## Type-specific concerns

### 12. `meeting`'s `default_stage: open` relies on a field the design defers

> **Resolved (flip to `done`).** `meeting.default_stage` is now `done` for v1, matching the other logged-after-the-fact types (`call`, `email`). Inline comment on the enum entry notes to flip back to `open` once `scheduled_at` lands. No pre-implementation decision needed.

**Design section:** "Activity types enum (built-in)" — meeting block,
and "Deferred → scheduled / due dates".

`meeting` has `default_stage: open` with the rationale _"scheduled for
future"_. But `scheduled_at` is deferred in v1. A meeting created with
`default_stage: open` has no scheduled-for timestamp, nothing on the
list or tile surfaces "when is this meeting", and the only way the
stage ever moves is a manual "Mark done" click.

Worse, the list page's planned `status=open` filter preset will surface
every half-logged meeting indefinitely, with no sort signal to
distinguish "scheduled for tomorrow" from "logged three weeks ago and
forgotten".

**Fix:** either

- **A.** In v1, set `meeting.default_stage: done` (meetings are logged
  after the fact, like calls and emails). Flip back to `open` when
  `scheduled_at` lands. Consumers wanting to log future meetings in v1
  override via the form.
- **B.** Drop `meeting` from the v1 built-in type set and reintroduce it
  with `scheduled_at`.

Recommend A — smaller footprint, keeps the built-in set round, and the
"flip to open later" is a one-line enum change, not a migration.

## Index / performance

### 13. `source.channel + source.external_ref` — use `partialFilterExpression`, not `sparse`

> **Resolved.** Index entry in design.md now reads `partialFilterExpression: { 'source.external_ref': { $exists: true } }` with an inline explanation of why `sparse` would be wrong on a compound index when one leg is always present.

**Design section:** "Indexes".

The design specifies the compound as "sparse". For a compound index,
`sparse` only skips documents where **all** indexed fields are missing.
Since `source.channel` is always present (even manual creations set
`channel: 'manual'`), the "sparse" qualifier does nothing useful.

For the idempotency use case (dedupe on `external_ref`), a partial
index is correct:

```js
{ 'source.channel': 1, 'source.external_ref': 1 },
{ partialFilterExpression: { 'source.external_ref': { $exists: true } } }
```

Small but actively misleading as written.

### 14. `status.0.stage` index deserves a justification in the design

> **Resolved.** Index entry now states "Fixed-position, not multikey — we only query current stage; multikey on `status.stage` would incorrectly match 'has ever been in stage X'." Folded in with the #13 index edit.

**Design section:** "Indexes".

`{'status.0.stage': 1}` indexes the _fixed first array position_, not
the multikey-across-all-positions index a reader might assume. This is
the right choice (we only ever query current stage, not historical
stages), but it's unusual enough that the design should state it
explicitly so nobody "fixes" it to the multikey variant later.

**Fix:** one-line note next to the index entry: _"Fixed-position, not
multikey — we only query current stage; multikey on `status.stage`
would incorrectly match 'has ever been in stage X'."_

## Minor / nits

### 15. Required `contacts`/`companies` deps

> **Resolved (keep required).** Dependencies section now explicitly states the choice is deliberate: the module's value proposition is CRM activities linked to contacts and companies, and a project-management consumer without either entity is better served by a separate `tasks` module than by layering conditional wiring across this one. `files` stays optional because attachments are genuinely auxiliary; contacts/companies aren't.

**Design section:** "Dependencies".

Both are marked required. An app wanting activities without CRM
entities (plausible for a project-management-flavoured consumer) can't
use the module. Given the module's whole linking story is about these
entities, this is probably fine — but worth explicitly deciding rather
than inheriting from companies' pattern. Parallel: `files` is optional.

### 16. Home-page placement hand-wave

> **Resolved.** "Files changed / added → Demo app" now lists a home-page `capture_activity` (no prefill) as a working reference for consumers.

**Design section:** "Capture entry points → Built-in placements".

_"Home-page placement is left to the consuming app"_ is correct, but
the demo app should ship with one prominent `capture_activity` on its
home page so consumers have a working reference. Add to "Files changed
/ added → Demo app".

---

## Summary

Two findings are design-breaking and need resolution before
implementation:

- **#2** — `_ref: { module, action }` isn't valid Lowdefy syntax; the
  action has to be a component export.
- **#4** — `tile_activities` title collides with `tile_events`'s
  existing "Activity" title in both companies and contacts.

One is a substantive behavioural claim that needs to be either
implemented or dropped:

- **#1** — "previous + new linked IDs in event references" isn't how
  any existing update routine works; pick "drop the feature" or
  "implement it and own that it's new".

The rest are convention fixes, missed copy-paste of the existing
patterns (`metadata`, `removed: null`, `_url_query: _id`, snake-case
request/action files), and one MongoDB syntax correction
(`$push` + `$each` + `$position`).

Net: the design is structurally sound — entity-module surface mirrors
companies/contacts correctly, data model is coherent, capture entry
points are a good addition. The findings are mostly about matching the
actual codebase rather than a repo-of-your-imagination.

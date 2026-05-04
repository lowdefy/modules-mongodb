# Activities — Decision Log

Resolutions to the open questions raised during the initial design pass.
This log records the choice made and the reasoning, so a future reviewer
doesn't have to re-derive why the design looks the way it does.

## 1. `scheduled_at` — field, status stage, or deferred?

**Decision:** Defer.

No `scheduled_at` in v1. Revisit when a concrete need lands — most
likely when calendar-channel ingestion is built, since planned times
become unavoidable there.

**Options considered:**

- **A. Top-level `scheduled_at: ISODate` field on the activity.** Simple
  to query, sort, display. Status tracks lifecycle, schedule tracks
  planned time — clean separation.
- **B. `scheduled` stage inside the status array**, with the timestamp
  embedded on the entry. Single history structure, but mixes "current
  state" and "planned time" semantics and forces downstream filters to
  special-case `scheduled`.
- **C. Defer.** (chosen)

**Why defer rather than pick now:** v1's real use is manual capture of
completed work. Users _could_ want a due-date for tasks, but we don't
yet know whether they want a single `scheduled_at`, a distinct `due_at`
for tasks vs a `starts_at` for meetings, or something richer. Picking
the wrong shape and later migrating is more work than adding a field
when the requirement is real.

**Lean when we revisit:** A. B unifies two things that aren't the same
— a planned time and a lifecycle stage — and every filter/sort would
then branch on `scheduled` as a pseudo-state.

**Migration path:** status-array history is preserved either way;
adding a scalar field or a new stage type doesn't invalidate v1 docs.

## 2. Consecutive human-readable IDs (`A-0001`)?

**Decision:** UUIDs only.

No `MongoDBInsertConsecutiveId`, no `id_prefix` / `id_length` vars.

**Why:** Activities are high-volume and rarely referenced by humans
individually (unlike companies, where "C-0042" comes up in
conversation). The cost of maintaining a counter collection and
coordinating monotonic IDs across concurrent ingestion from future
automated channels (calendar webhooks, email forwards) outweighs the
readability win. If we ever need a human-visible reference, we can
derive a short code from the UUID without schema change.

## 3. Default sort on list page and tiles

**Decision:** `updated.timestamp` desc.

Across the list page, the detail-page sidebar tiles
(`tile_activities`), and the activities-for-entity requests.

**Why:** "Most recent activity" is the CRM-default expectation — it
surfaces whatever a user last touched, whether that was a newly logged
call, a status flip, or an edit to an existing activity.
`created.timestamp` would hide edits; `status[0].created.timestamp`
would privilege status churn over content edits.

**Follow-up:** once `scheduled_at` exists (see #1), the list page can
offer a filter preset ("open work, next up") that switches sort to
`scheduled_at` asc. No work needed now.

## 4. File attachments — inline or via the `files` module?

**Decision:** Via the `files` module. Activities' detail page refs
`files.file-card` directly — no local wrapper.

Files are stored in the `files` module's own collection, keyed by
`(entity_type: 'activity', entity_id: <activity uuid>)` — the same
indexing surface every other entity uses. The detail page sidebar
embeds `files.file-card` inline, passing `entity_type: activity` and
`entity_id: { _url_query: _id }` as vars. No local
`tile_files.yaml` wrapper, no `files: []` array on the activity doc.

**Why:** Consistency with `companies`, `contacts`, and any other
entity that attaches files. S3 lifecycle (uploads, signed URLs,
deletion, orphan cleanup) lives in one place. Inlining (a `files: []`
array on the activity doc) would be a micro-optimisation (one fewer
request on detail) but forks from the codebase pattern — every
other module that grows attachments would then face the same choice.

**Why no local `tile_files.yaml` wrapper:** the previous convention
(used by companies and contacts) was a one-line ref-forward
component that hardcoded `entity_type` per consumer. Sam flagged
this on PR #32 as dead indirection — `file-card` already takes
`entity_type` as a var, so the wrapper added no behaviour. Same PR
deletes the unused `tile_files.yaml` files in companies and
contacts. Activities never adds one. If a consumer later needs a
real wrapper (header buttons, custom card title, additional
sidebar blocks alongside the file card), they create it THEN —
mirroring how `tile_events.yaml` wraps the cross-module
`events-timeline` with a `layout.card` because there is something
to wrap.

**Consequence:** `create-activity` and `update-activity` payloads do
not carry files. File upload is a separate flow handled by the `files`
module's own API, with the activity ID passed as the reference. A
brand-new activity therefore has to be inserted first, then files
attached — which matches the UX in `companies` already.

## 5. `task` as a built-in activity type?

**Decision:** Not in v1. Tasks belong in a separate module.

Built-in `activity_types` ships only past-tense external interactions:
`call`, `meeting`, `email`. No `task` type. (Notes also dropped — see
§6.)

**Why:** Activities are records of work done — calls made, meetings
held, emails sent. Tasks are forward-looking work items — "send the
proposal", "follow up Friday." Folding both into the activity
grammar is convenient because the status array carries both "already
done" and "still open" states, but the supporting features that
make tasks actually useful — `scheduled_at` / due-date, `assigned_to`,
`priority` — are all explicitly out of scope for v1. A task without
a due date or assignee is a thin entity. Sam's PR-32 review:
*"Tasks should be actions, not an activity"* — directional pushback we
agreed with after surfacing the v1-thinness of the current model.

**Where tasks belong:** A separate `tasks` (or `actions`) module,
designed alongside scheduling and assignment so the data model has
real legs. The dependencies discussion in `design.md` already named
this as the architectural alternative for project-management-flavoured
consumers; that line now reflects v1 reality, not an aspirational
non-choice.

**v1 stop-gap:** Consumers needing task-shaped activities before the
separate module lands can extend the enum:

```yaml
# in the consuming app's modules.yaml entry for activities
vars:
  activity_types:
    task:
      title: Task
      color: "#fa8c16"
      icon: AiOutlineCheckSquare
      default_stage: open
```

They get the same thin-task feature set the v1 design originally
shipped, with the explicit understanding that the proper task module
will replace this when it lands.

**Priority field follow-on:** Priority was previously called out as
not-in-v1 because it only mattered for tasks. Tasks being out of v1
moots the discussion. If a consumer adds `task` via the extensibility
hook and wants priority, they layer it on via `attributes` — same
treatment as before.

## 6. `note` as a built-in activity type?

**Decision:** Not in v1. Notes belong in the existing event-based
comments pattern.

Built-in `activity_types` ships only past-tense external interactions:
`call`, `meeting`, `email`. No `note` type.

**Why:** Notes (text jotted against an entity) structurally resemble
events more than activities — append-only, immutable, attached to
entities via `references`. Activities exist to capture work with
multi-entity linking, lifecycle, rich-text descriptions, and forward
compatibility with auto-ingestion channels (calendar, email, WhatsApp,
voicenote) — none of which apply meaningfully to notes. A note is
just text someone wrote about a contact/company; the event-shape
(append-only, immutable, multi-keyed `references`) is the natural fit.

**Existing precedent.** Production apps in the monorepo already
implement notes-as-events through per-entity `*_comment` event
types (e.g. `discussion_comment`, `order_comment`) registered
alongside their other event-types. The pattern works: comment text +
author + timestamp + entity reference, surfaced in the events
timeline. Activities consumers continue using
this pattern for note-taking; activities lives alongside, owning
past-tense external-interaction logs only.

**Sam's PR-32 review:** *"Don't know if notes are events (like
comments currently) - think they should be. But not sure of that."*
The "comments currently" pointer is to the existing production-app
pattern. Confirmed on inspection — directional pushback we agreed
with after surfacing that activities' three motivations (lifecycle,
multi-entity linking, ingestion-channel forward-compatibility) all
apply weakly or not at all to notes.

**v1 stop-gap:** Consumers needing an editable activity-shaped note
before any future notes-as-events design lands can extend the enum:

```yaml
# in the consuming app's modules.yaml entry for activities
vars:
  activity_types:
    note:
      title: Note
      color: "#8c8c8c"
      icon: AiOutlineFileText
      default_stage: done
```

They get the same activity-shaped notes the original design shipped,
with the explicit understanding that the proper home for notes is
the event-comments pattern.

**Why drop rather than implement notes-as-events here:** notes-as-events
has its own design questions (rich-text body? edit affordance vs
strict immutability? attachments? threading? where in the UI?). A
proper notes-as-events design — generalising the existing
production-app `*_comment` pattern into a reusable shape — is a
separate piece of work. Activities v1 stays focused.

## 7. Activities-on-companies/contacts — required dep or optional + app-wired?

**Decision:** Optional. Companies and contacts do not declare
`activities` as a dependency. Apps that want activity tiles on
companies/contacts wire `tile_activities` into the parent module's
sidebar slots from app config.

The activities module exports a self-contained, parameterised
`tile_activities` (`layout.card` + `activities-timeline` content +
`capture_activity` in header). Apps drop it into companies' or
contacts' `components.sidebar_slots` from their own `vars.yaml`
overrides; companies/contacts' module manifests are unchanged, no
new files in their `components/` folders, no embeds in `view.yaml`.

**Sam's PR-32 review:** *"Do these modules get a dependancy on
activities now? Do we want this to be optional? I'm not sure."*
Pointed at the previous design which baked activities into
companies/contacts as a required dep with local wrapper files
(review-5 #4's resolution). After surfacing that not every consumer
of companies/contacts is doing CRM (a company-directory app
shouldn't have to ship activities just to use companies), we
agreed: optional.

**Existing precedent:** files. Companies declares `files` as a dep
but doesn't bake `tile_files` into its view (we just confirmed —
and deleted the unused `tile_files.yaml` wrappers as part of this
PR's `tile_files` consolidation, see §4). Apps that want files on
companies wire it themselves. Activities now follows the same
shape, except we drop the dep declaration too — companies/contacts
genuinely don't need to know about activities at module level.

**What partially reverses from review-5 #4:** The cross-module
export topology. Review-5 #4 said `activities-timeline` is
content-only and consumers ship local `tile_activities.yaml`
wrappers (mirroring `events.events-timeline` ↔ `tile_events.yaml`).
With activities optional + app-side wiring, there are no
consumer-side files to wrap in. So the activities module exports
both:

- `tile_activities` — self-contained tile, the integration surface
  for apps. Drop into companies/contacts sidebar slots.
- `activities-timeline` — content-only block, kept as a
  power-user export for apps wanting fully custom wrappers.

Pattern mirrors files' `file-card` (drop-in card) plus
`file-manager` (content-only) — primitives for power users plus a
convenient drop-in for the common case.

**Why drop the consumer-wrapper pattern for activities:** because
there's no consumer to wrap in. With activities required and the
wrapper in companies, the wrapper file made sense. With activities
optional and wiring at app level, the wrapper would have to live
in the app — multiplying per-app boilerplate. Better to push the
self-contained tile into the activities module so apps wire one
ref, not a card-wrapping wrapper.

**Asymmetry with events:** events stays a required dep for
companies/contacts because **every** consumer needs the event log
(create/update events fire on every entity mutation; without
events the audit trail breaks). Activities is genuinely optional —
a non-CRM consumer can skip it.

**Files changed scope:** Companies and contacts are unchanged
beyond the `tile_events` "Activity" → "History" rename — retained
for collision protection if apps wire activities, and a better
label for the system-audit log regardless. The demo app gains slot
overrides for both companies and contacts to show consumers the
wiring pattern.

---

## Non-questions worth recording

Decisions locked in during drafting that weren't framed as open
questions but shape the design materially:

- **Dedicated `change-activity-status` API, separate from
  `update-activity`.** Lets the UI expose one-click "Mark done" /
  "Reopen" / "Cancel" buttons, emits the correct event type per
  transition, and saves the API from diffing input against stored
  state to figure out what happened.
- **Dedicated `delete-activity` API for soft-delete, not a flag on
  `update-activity`.** Mirrors `change-activity-status` (single-purpose
  endpoint) and the files module's `delete-file`. Sets `removed:
  change_stamp` + bumps `updated`, emits `delete-activity` with full
  references. Keeps `update-activity`'s editable-fields list clean and
  the event-emission contract obvious from the call site.
- **No reverse denormalization of activity IDs onto parent entities.**
  Contact ↔ company linking in this repo _does_ denormalize
  (`update-company` maintains `company_ids` on contact docs via
  `$pull`/`$addToSet`). Activities deliberately don't follow that
  pattern — indexes on `contact_ids` / `company_ids` on the activity
  doc serve reverse lookups, and future automated ingestion channels
  would otherwise each need to coordinate multi-collection writes.
  Framed explicitly as a departure, not as "matching existing".
- **No `deal_ids` field written into v1 schema.** Reserved in design
  prose, but not materialised in YAML, indexes, or pipelines until the
  `deals` module exists. Avoids shipping dead schema.

## 8. Capture entry points — one component or many?

**Decision:** One reusable `capture_activity` component (button + modal),
driven entirely by prefill vars. Plus an `open_capture` action sequence
for non-button triggers, plus URL query-param support on `pageId: new`
for deep-links.

**Options considered:**

- **A. Per-context buttons.** Separate exports like
  `button_new_activity_for_contact`, `button_new_activity_quick`, etc.
  Each knows its own prefill shape.
- **B. One component with prefill vars.** (chosen)
- **C. Action-only export, no UI.** Consumer builds its own trigger UI,
  gets only the action sequence.

**Why B:** keeps the capture flow consistent across every entry point
(tile header, contact page, company page, home dashboard, main nav,
deep-link). When the form grows a field or the submit logic changes, it
changes in exactly one place. Consumers pass prefill vars — they don't
choose between N similarly-named buttons.

**Why also expose the action (B + a sliver of C):** buttons aren't the
only trigger. Menu items, command-palette entries, list row actions, and
keyboard shortcuts all want to open capture. Exposing `open_capture` as
a raw action sequence lets those triggers reuse the same flow without
wrapping a button.

**Why support URL query params on `pageId: new`:** deep-links from
emails, chat messages, calendar notifications, and Slack unfurls need
to land users on a pre-filled create flow. This also becomes the
fallback target when `capture_activity` is used in `mode: page`
(dedicated page, not modal) — single URL-prefill surface, no
duplicate prefill logic. (Lowdefy URLs don't carry path params, so the
contract is purely the query string; the actual path is set by the
consuming app's page config.)

**Modes:** `mode: modal` (default) stays in context; `mode: page` links
to `pageId: new` with prefill in `urlQuery`. Consumers pick per
placement — tiles and mid-page actions lean modal, main-nav links lean
page.

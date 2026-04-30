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
surfaces whatever a user last touched, whether that was a new note, a
status flip, or an edit to an existing activity. `created.timestamp`
would hide edits; `status[0].created.timestamp` would privilege status
churn over content edits.

**Follow-up:** once `scheduled_at` exists (see #1), the list page can
offer a filter preset ("open work, next up") that switches sort to
`scheduled_at` asc. No work needed now.

## 4. File attachments — inline or via the `files` module?

**Decision:** Via the `files` module.

Files are stored in the `files` module's own collection, keyed by an
`activity_id` reference. The activity detail page embeds the existing
`tile_files` in its sidebar wired with `reference_field: activity_id`.
No `files: []` array on the activity doc.

**Why:** Consistency with `companies`, `contacts`, and any other
entity that attaches files. S3 lifecycle (uploads, signed URLs,
deletion, orphan cleanup) lives in one place. Inlining would be a
micro-optimisation (one fewer request on detail) but forks from the
codebase pattern — every other module that grows attachments would
then face the same choice.

**Consequence:** `create-activity` and `update-activity` payloads do
not carry files. File upload is a separate flow handled by the `files`
module's own API, with the activity ID passed as the reference. A
brand-new activity therefore has to be inserted first, then files
attached — which matches the UX in `companies` already.

## 5. `priority` field on tasks?

**Decision:** Not in v1.

No built-in `priority` enum, no priority column, no priority filter.

**Why:** A priority field only matters for `task`-type activities and
is easy to layer on later via `attributes` for consumers who need it
immediately. Adding it as a first-class field across all types pollutes
the schema for notes/emails/calls/meetings, and baking it into the
table/filter UI commits to a specific priority scale (low/med/high?
P0/P1/P2?) without a real use case to anchor the choice.

**Promotion path:** If usage proves out, promote from `attributes` to
a first-class top-level field. Since `attributes` is a consumer-owned
object, we avoid coupling the module to a scheme that might be wrong.

---

## Non-questions worth recording

Decisions locked in during drafting that weren't framed as open
questions but shape the design materially:

- **Dedicated `change-activity-status` API, separate from
  `update-activity`.** Lets the UI expose one-click "Mark done" /
  "Reopen" / "Cancel" buttons, emits the correct event type per
  transition, and saves the API from diffing input against stored
  state to figure out what happened.
- **Soft delete via `update-activity` with `removed: change_stamp`,
  not a dedicated delete API.** Matches the `companies` pattern.
  `delete-activity` event fires when the API sees `removed` move from
  `null` to a stamp.
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

## 6. Capture entry points — one component or many?

**Decision:** One reusable `capture_activity` component (button + modal),
driven entirely by prefill vars. Plus an `open_capture` action sequence
for non-button triggers, plus URL-param support on `/activities/new` for
deep-links.

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

**Why support URL params on `/activities/new`:** deep-links from emails,
chat messages, calendar notifications, and Slack unfurls need to land
users on a pre-filled create flow. This also becomes the fallback
target when `capture_activity` is used in `mode: page` (dedicated page,
not modal) — single URL surface, no duplicate prefill logic.

**Modes:** `mode: modal` (default) stays in context; `mode: page` navs
to `/activities/new` with params. Consumers pick per placement — tiles
and mid-page actions lean modal, main-nav links lean page.

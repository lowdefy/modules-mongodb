# Consistency Review 2

## Summary

Scanned `design.md`, `decisions.md`, and `review/review-1.md` for drift
between the resolved review findings and the current state of the design
files. Found 6 inconsistencies — all review-vs-design drift (earlier
resolutions that hadn't fully propagated) or internal contradictions.
All 6 auto-resolved. No user-resolved items.

## Files reviewed

**Design:**

- `designs/activities/design.md`

**Supporting:**

- `designs/activities/decisions.md`

**Reviews:**

- `designs/activities/review/review-1.md` (source of truth for the
  decisions propagated)

No task files, plan files, or deep dives exist yet — those haven't been
created.

## Inconsistencies found

### 1. `add-derived-fields.yaml` vs `add_derived_fields.yaml`

**Type:** Internal Contradiction (file tree vs prose reference)
**Source of truth:** review-1 finding #5 resolution (snake_case request
files) + file tree at `design.md:157`.
**Files affected:** `design.md:83`.
**Resolution:** Updated the "Lives in …" prose reference from
`add-derived-fields.yaml` to `add_derived_fields.yaml` to match the file
tree and the convention established by the #5 resolution.

### 2. `_request: get_company.0._id` in tile_activities embed example

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #3 resolution (use `_url_query: _id`
for host-page entity resolution, matching `tile_events`).
**Files affected:** `design.md:291`.
**Resolution:** The `capture_activity` prefill example had already been
corrected, but the same pattern in the `tile_activities` embed example
still used `_request: get_company.0._id`. Updated to `_url_query: _id`
with the same inline comment about matching `tile_events`'s resolution
pattern.

### 3. `open-capture` (kebab) in "Built-in placements"

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #2 resolution (renamed to
`open_capture`, snake_case, exported as component).
**Files affected:** `design.md:428`.
**Resolution:** The main-nav placement described the trigger as
`open-capture`. Updated to `open_capture`.

### 4. "indexed sparsely" contradicts the partial-index choice

**Type:** Internal Contradiction
**Source of truth:** review-1 finding #13 resolution + the Indexes
section at `design.md:72` that uses
`partialFilterExpression: { 'source.external_ref': { $exists: true } }`.
**Files affected:** `design.md:569`.
**Resolution:** The "Future channels" section still described
`source.external_ref` as "indexed sparsely". Rewrote as "covered by a
partial index (see 'Indexes' above) to enable idempotent ingestion",
referencing the correct index definition rather than restating it.

### 5 & 6. `open-capture` (kebab) in decisions.md

**Type:** Review-vs-Design Drift
**Source of truth:** review-1 finding #2 resolution.
**Files affected:** `decisions.md:141`, `decisions.md:162`.
**Resolution:** Section 6 ("Capture entry points — one component or
many?") still referenced `open-capture` in two places. Both renamed to
`open_capture` via a replace-all.

## No issues

Areas checked where everything was consistent:

- File tree (`design.md:113-173`) — all snake_case for requests, actions,
  components; matches CLAUDE.md and the #5/#6 resolutions.
- `update-activity` routine (`design.md:480-484`) — emits `references`
  with post-update IDs only, matching #1 resolution. Forward-looking
  delink-visibility note preserved.
- `change-activity-status` routine — uses `$push` with `$each` +
  `$position: 0`, matching #8 resolution.
- Indexes section (`design.md:66-72`) — fixed-position note (#14),
  `partialFilterExpression` (#13) both present and correct.
- `create-activity` routine (`design.md:462-478`) — sets `removed: null`
  and emits `metadata: { activity_id }`, matching #11.
- Meeting enum entry (`design.md:215-218`) — `default_stage: done`,
  matching #12.
- `open_capture` section (`design.md:378-414`) — always-navigate
  behaviour with the "Future consideration — modal-from-link" note,
  matching #9.
- `tile_activities` description (`design.md:294-299`) — auto-wires its
  own refetch as `on_created`, matching #10.
- Dependencies section (`design.md:192-212`) — contacts/companies are
  deliberately required, with rationale; matches #15.
- Key-decisions bullet on `tile_activities` vs `tile_events` — reflects
  the "History" rename (#4).
- "Files changed / Touched modules" (`design.md:580-585`) — includes
  both `tile_events.yaml` renames in companies and contacts (#4).
- "Demo app" files-changed list — includes the reference
  `capture_activity` on the home page (#16).
- `decisions.md` — "No reverse denormalization" entry reworded as
  departure rather than continuation, matching #7.

## Files modified

- `designs/activities/design.md` (lines 83, 291, 428, 569)
- `designs/activities/decisions.md` (lines 141, 162)

## Remaining open questions

None from this consistency pass. The design's own "Deferred" section
(scheduled_at) and the forward-looking notes (delink visibility,
modal-from-link triggers) are tracked inline — not open questions
pending consistency resolution.

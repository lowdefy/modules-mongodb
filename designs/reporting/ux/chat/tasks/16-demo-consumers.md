# Task 16: Demo consumers — partial `welcome` config and a seeded conversation set

## Context

Every new consumer-facing capability needs at least one real example consumer in `apps/demo/`, in
the same change — that is how a capability gets a build-verified reference and a worked example
authors can copy.

The demo's reporting module entry lives in `apps/demo/modules.yaml:68-80` and takes its vars from
`apps/demo/modules/reporting/vars.yaml`, which today sets `catalog`, `share_roles` and
`app_context`. Its connections are remapped onto MONGODB_URI-backed app connections
(`reports-store` → `reporting-reports`, `conversations-store` → `reporting-conversations`,
`reporting-data` → `reporting-analytics`).

Seed fixtures are demo `api/` endpoints invoked by hand, registered in `apps/demo/lowdefy.yaml`'s
`api:` list: `reporting-seed-orders`, `reporting-seed-example-report`, `reporting-seed-ownership`.
`reporting-seed-ownership.yaml` is the pattern to follow — idempotent, deterministic per-user ids,
cleared then reinserted so re-seeding never duplicates, with a header comment saying what the
fixture is _about_ and why it is separate from its neighbours.

Three capabilities need consumers: the `welcome` var's per-leaf default resolution, recency
grouping (which needs conversations in all three buckets), and the table part's truncation copy
(which only ever appears on a truncated part).

## Interfaces

- **Consumes:** the `welcome` var (task 11); the rail's grouping and delete (task 13); the table
  part and its row cap (tasks 6, 14).

## Task

**`apps/demo/modules/reporting/vars.yaml`** — add a `welcome` block set **partially**, as
overrides of the shipped defaults:

- `data_scope` — a real sentence in the demo dataset's own vocabulary (orders, companies,
  contacts, activities, workflow actions), matching the words `app_context` already teaches the
  agent;
- **one track only** — set that track's label and starters, and **leave the other track entirely to
  its defaults.**

Comment why it is partial: per-leaf default resolution is what makes partial configuration safe,
and an untested partial entry is exactly where that would fail unnoticed. This one entry
build-verifies both paths.

Write the starters against the demo's actual data so they resolve to real answers when clicked.

**A new seed endpoint, `apps/demo/api/reporting-seed-conversations.yaml`**, registered in
`apps/demo/lowdefy.yaml`'s `api:` list. Header comment on
`reporting-seed-ownership.yaml`'s model: what this fixture is about (the rail's recency grouping
and the panel's truncation copy), and why it is separate from the other two seeds (they are about
the presentation contract and about ownership; this one is about the chat surface's own state).

It seeds conversation documents into the `reporting-conversations` connection for the signed-in
user, **owner-scoped from `_user`**, idempotent on deterministic per-user ids, cleared then
reinserted:

- **conversations spanning all three recency groups** — at least one with an `updated.timestamp` of
  today, one within the last 7 days, and one older than that, so the rail renders Today,
  Previous 7 days and Older;
- each carrying the **full live shape** the two writers now insert between them (task 7):
  `owner`, `created`, `updated`, `title`, `messages`, `data_parts`, `deleted: null`. A fixture in
  the old shape would sort or filter wrongly and read as a module bug;
- **one conversation carrying a `data-report-table` part** in `data_parts`, in the shape task 6
  persists — `{ type: "data-report-table", data: { id, created, title, rows, row_count, spec: { query, columns } } }`
  — with `rows` holding 200 entries and `row_count` set above 200, so the panel's
  _first 200 of N rows_ copy is exercised. That copy only ever appears on a truncated part and
  would otherwise ship unread.
- **one soft-deleted conversation** (a `deleted` change stamp rather than `null`), so the rail's
  exclusion filter is exercised against a real stamp rather than only against absence.

Generate the 200 rows in the routine rather than typing them — `_mql.expr` with `$range` and `$map`
over the `demo_orders`-shaped columns the seeded table's `spec.columns` declares, so the grid has
real-looking values and the declared column keys are actually present in the rows.

**Wire the seed into the demo's reporting page** the way the other seeds are, so it can be run by
hand from the app rather than only by URL — check `apps/demo/pages/reporting/reporting-demo.yaml`
for how `reporting-seed-ownership` is triggered and follow it.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds, and the generated
  `.lowdefy/server/build/pages/reporting/chat.json` shows the demo's `data_scope` and the one
  configured track's copy alongside the **module's shipped defaults** for the other track's label
  and starters. Both paths visible in one artefact is the point of the partial entry.
- Running the seed twice leaves the same number of conversations, with the same ids and the same
  URLs.
- The rail renders all three group headings from the seeded set, and does not show the soft-deleted
  one.
- The seeded table conversation opens with a table card showing 200 rows and the
  _first 200 of N rows_ line.

## Files

- `apps/demo/modules/reporting/vars.yaml` — modify — the partial `welcome` override
- `apps/demo/api/reporting-seed-conversations.yaml` — create
- `apps/demo/lowdefy.yaml` — modify — register the new seed in `api:`
- `apps/demo/pages/reporting/reporting-demo.yaml` — modify — a way to run the seed by hand

## Notes

Do not put client names in the fixtures or the copy — the demo's synthetic CRM vocabulary
(companies, contacts, activities, orders, workflow actions) is what the seeds and the starter
prompts use.

The demo's `reporting-analytics` connection points at the app's read-write `MONGODB_URI`, so the
demo does **not** exercise the read-only principal production must use. That is already recorded in
`modules.yaml`; do not change it here.

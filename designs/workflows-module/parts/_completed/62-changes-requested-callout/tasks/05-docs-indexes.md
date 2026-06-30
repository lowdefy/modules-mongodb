# Task 5: Document the events-collection index

## Context

The Task 1 envelope read is the first reader to match the events collection (`log-events`, the collection backing the `WorkflowAPI` `eventsCollection`) by `action_ids` — the existing timeline reads match by `reference_field`/`reference_value`. Per the module's index pattern, the module creates no indexes; host apps add them, and `docs/workflows/reference/indexes.md` documents the indexes each read expects.

`docs/workflows/reference/indexes.md` currently documents an `actions` collection section (`{ workflow_id: 1 }`) and a `workflows` collection section (`{ "entity.connection_id": 1, "entity.id": 1 }`), plus an `actions` validator-constraint note. There is no events-collection section yet.

This is a hand-authored reference page (not a generated file — `vars.md` is the only generated page under `reference/`), so it is edited directly. After editing, regenerate the docs index so `llms.txt` stays in sync.

## Task

Add a new events-collection section to `docs/workflows/reference/indexes.md`, alongside the existing `actions` / `workflows` sections, documenting the `{ action_ids: 1 }` index the Part 62 read expects.

Suggested content:

```markdown
## `log-events` collection (events)

### Index: `{ action_ids: 1 }`

Serves the changes-requested callout read added in Part 62:

| Query site                    | Operation                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GetWorkflowAction` (Part 62) | `find({ type: "action-request_changes", action_ids }, { sort: { date: -1 }, limit: 1 })` on each `changes-required` action-page load |

`action_ids` is highly selective — a single action has only a handful of events — so the leading-field match narrows to a tiny set and the residual `type` filter + `date` sort + `limit 1` run in-memory over a few docs (the same reasoning the `{ workflow_id: 1 }` entry uses for the `actions` collection). A plain `{ action_ids: 1 }` therefore suffices. Without **any** index on `action_ids`, this query is a collection scan on a perpetually-growing log on every changes-required page load — the failure mode this entry exists to prevent.
```

Match the heading level, table format, and prose style of the existing sections. Place it after the `workflows` collection section (and before or after the `actions` validator-constraint note — keep collection sections grouped).

## Acceptance Criteria

- `docs/workflows/reference/indexes.md` has a `log-events` collection section documenting `{ action_ids: 1 }`, with a query-site table and the selectivity rationale.
- Section style (headings, table, prose) matches the existing `actions` / `workflows` sections.
- `pnpm docs:check` passes (front-matter valid, `llms.txt` in sync — run `pnpm docs:gen` first if `llms.txt` needs regenerating, then commit it).

## Files

- `docs/workflows/reference/indexes.md` — modify — add the `log-events` collection / `{ action_ids: 1 }` section.
- `docs/llms.txt` — modify (regenerated via `pnpm docs:gen`) — only if the index page change affects it.

## Notes

- Independent of all other tasks; can be done in parallel.
- This is a docs-only, hand-authored reference page — do not run a generator over `indexes.md` itself (only `vars.md` is generated). `pnpm docs:gen` regenerates `vars.md` and `llms.txt`; re-run it and commit any resulting `llms.txt` delta.

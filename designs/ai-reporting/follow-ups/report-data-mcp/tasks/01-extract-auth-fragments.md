# Task 1: Extract the readable-scope predicate and the signed-in guard into `_ref` fragments

## Context

`ai-reporting`'s authorization boundary is currently copy-pasted. The **readable
predicate** — "a report you own, or one published to the app" —

```yaml
$or:
  - owner.user_id:
      _user: id
  - visibility: shared
```

appears **five times across four files**: `api/duplicate-report.yaml:36`,
`api/list-reports.yaml:98` (the `favourites` branch) and `:112` (the `all`
branch), `api/resolve-report.yaml:42`, `api/set-report-favourite.yaml:56`. Two
new MCP-facing endpoints would make seven copies of a match whose own comment
says "a bug in it is a confidentiality bug rather than a display bug"
(`list-reports.yaml:4-5`).

The **signed-in reject** is a second duplication of the same kind
(`resolve-report.yaml:17-22`, `list-reports.yaml:23-28`).

The module already has the mechanism: `defaults/*.yaml` fragments pulled in with
`_ref`, as `change_stamp.yaml` and `owner.yaml` are today (see
`api/duplicate-report.yaml:55,82`).

**Note the mechanism carefully — this is not a pipeline stage.** The predicate is
a fragment **spliced inside** larger `$match` objects that add different sibling
conditions: `favourite_of` plus `deleted.timestamp: {$exists: false}` in the
favourites branch, `deleted.timestamp` alone in the all branch, `_id` plus
`deleted.timestamp` in `resolve-report`. So the fragment returns the `$or`
**value**, spliced into each match — not a file referenced as a stage.

## Interfaces

- **Produces:**
  - `modules/ai-reporting/defaults/readable_scope.yaml` — referenced as
    `$or: { _ref: defaults/readable_scope.yaml }`, resolving to the two-element
    `$or` array.
  - `modules/ai-reporting/defaults/signed_in_guard.yaml` — a routine step,
    referenced as
    `- _ref: { path: defaults/signed_in_guard.yaml, vars: { message: "You must be signed in to …" } }`,
    resolving to the `:if`/`:then`/`:reject` step with `_var: message` as the
    reject text.

  Tasks 5, 6 and 7 consume both.

## Task

1. Create `modules/ai-reporting/defaults/readable_scope.yaml` containing just the
   `$or` array value (owner match, or `visibility: shared`). Carry a comment
   stating what it is and that it is the module's readable boundary.

2. Create `modules/ai-reporting/defaults/signed_in_guard.yaml` containing the
   `:if` / `_eq [_user: id, null]` / `:then` / `:reject` step, with the reject
   message read from `_var: message`. The message stays per-caller — the existing
   rejects are specific ("to list reports", "to open a report") and that
   specificity is worth keeping.

3. Replace the five readable-predicate copies with the `_ref`, splicing it as the
   `$or` key's value so each site keeps its own sibling conditions unchanged.

4. Replace the signed-in guard in the **four files this task already touches**
   (`duplicate-report.yaml:22`, `list-reports.yaml:23-28`,
   `resolve-report.yaml:17-22`, `set-report-favourite.yaml:30`) with the
   `_ref` + `message` var. Preserve each existing message verbatim.

5. Leave the comments that explain _why_ each site is scoped the way it is. In
   `resolve-report.yaml:11-16` and `list-reports.yaml:82-85,99-101` those
   comments carry reasoning the fragment cannot: keep them at the call site.

## Acceptance Criteria

- `grep -rn "visibility: shared" modules/ai-reporting/api/` returns only
  `list-reports.yaml:79` (the `shared` scope's own branch, which is deliberately
  not the readable predicate) and comment lines — no remaining inline copies of
  the `$or`.
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.
- `pnpm e2e` passes. The existing suite covers all five sites:
  `report-scopes.spec.js` (the `favourites` and `all` branches),
  `report-resolve-shared.spec.js` (`resolve-report`),
  `report-favourite-duplicate.spec.js` (`set-report-favourite`,
  `duplicate-report`).
- The `mine`, `shared` and `deleted` branches of `list-reports.yaml` are
  **unchanged** — see Notes.

## Files

- `modules/ai-reporting/defaults/readable_scope.yaml` — create — the `$or` value
- `modules/ai-reporting/defaults/signed_in_guard.yaml` — create — the guard step,
  message via `_var`
- `modules/ai-reporting/api/list-reports.yaml` — modify — 2 predicate sites, 1 guard
- `modules/ai-reporting/api/resolve-report.yaml` — modify — 1 predicate site, 1 guard
- `modules/ai-reporting/api/duplicate-report.yaml` — modify — 1 predicate site, 1 guard
- `modules/ai-reporting/api/set-report-favourite.yaml` — modify — 1 predicate site, 1 guard

## Notes

- **Do not widen the extraction to the `mine`, `shared` or `deleted` scopes.**
  Their selectivity is deliberate: `mine` is owner-matched at **any** visibility
  (publishing a report does not remove it from Mine), and `deleted` inverts the
  stamp test and is owner-only (you never see anyone else's deleted reports).
  Neither uses the readable predicate and neither should start.
- **The signed-in guard appears 21 times across the module**, not twice — every
  endpoint that reads app data carries one, each with its own message. This task
  converts only the four files it already touches for the predicate work.
  Converting the remaining 17 is a module-wide refactor outside this design's
  scope; leave them alone rather than half-migrating adjacent files.
- `resolve-report.yaml` is `InternalApi` and stays that way. It is touched here
  only as a consumer of the fragments.

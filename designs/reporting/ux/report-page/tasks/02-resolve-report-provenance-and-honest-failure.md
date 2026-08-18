# Task 2: Resolver returns provenance + threads `is_owner`/`conversation_id`; logs whole-spec failure; honest page fallback

## Context

`modules/reporting/api/resolve-report.yaml` is the `Dynamic` block's resolver. It already (from
shipped ownership work) loads the report readable-scoped (`owner.user_id` OR `visibility: shared`,
not-deleted), rejects when not found, runs each query section through `AnalyticsPipeline` inside a
per-section `:try`, and returns `{ is_owner, blocks }` where `blocks` is `_analytics.compileReport`
over the spec + results. It currently passes `compileReport` only
`{ spec, results, catalog, roles, endpointId }`.

Two gaps this task closes:

1. **Provenance inputs.** The compiler (Tasks 3–4) will emit a provenance line and owner-only
   chat affordances, but the facts they need are not on `spec` (which holds `{ sections }` only)
   and are not currently passed: `created`, `updated`, `owner`, `visibility`, `conversation_id`,
   `is_owner`, and a **resolve-time timestamp** for "when these numbers were computed" (the one
   fact that isn't on the document — a `_date: now`).
2. **Honest whole-report failure.** The stored spec is re-validated on every open inside the
   resolver's `:for … :in`, which `@lowdefy/api`'s `controlFor` evaluates _before_ iteration and
   _outside_ the per-section `:try`. So a spec-level (grammar) validation failure rejects the
   whole routine and the page renders its fallback slot — today reading
   "The report does not exist or you do not have access to it.", which lies to an owner looking at
   their own report, and is unlogged. (Per-section/catalog-drift failures are unaffected: those
   fail inside the `:try` and render as one Alert card.)

See the design's "Provenance is three facts" and "A spec that no longer validates is not a
missing report".

## Interfaces

- **Produces (consumed by Tasks 3, 4):** the `_analytics.compileReport` call gains inputs
  `created`, `updated`, `owner`, `visibility`, `resolvedAt` (the `_date: now` timestamp),
  `is_owner`, and `conversation_id`. Exact key names here are the contract Tasks 3/4 read — keep
  them stable.

## Task

In `modules/reporting/api/resolve-report.yaml`:

1. **Return + thread provenance.** Add to the `_analytics.compileReport` args (and, where the page
   needs them directly, to the top-level `:return` alongside `is_owner`/`blocks`):
   - `created`, `updated`, `owner`, `visibility` — from `_step: load_report.*`.
   - `conversation_id` — from `_step: load_report.conversation_id` (may be absent/null; the
     compiler treats absence as no chat affordance).
   - `is_owner` — already computed at the top-level return (`_eq [load_report.owner.user_id, _user.id]`);
     pass the same expression into `compileReport`.
   - `resolvedAt` — a `_date: now` evaluated in the return, for "when these numbers were computed".
2. **Log a whole-spec re-validation failure.** Before the `:for` step (which is where `controlFor`
   triggers the un-caught spec validation), add a bounded pre-validate step wrapped in a `:try`
   that runs `validateReportSpec` over the composed spec (`title`/`description`/`sections` the same
   way the `:for`/`:return` compose it) and, on failure, `:log`s enough to identify the report
   (report_id, and that it was a whole-spec validation failure) and then rejects to the fallback.
   This must not change the success path and must not turn a genuine per-section failure into a
   whole-report failure — only grammar-level spec failures reach here. Keep it a diagnostic log +
   reject; **no** cause-naming payload to the page (the fallback slot is static).

In `modules/reporting/pages/report.yaml`:

3. Change the fallback `Result` `subTitle` (lines 71-72) to exactly **`This report couldn't be loaded`**.
   Leave `status: 404` and `title` as-is or adjust `title` to match the honest phrasing if it
   reads better with the new subtitle — but the subtitle copy is fixed by the design. Do not touch
   `properties.types` here (that's Task 4).

## Acceptance Criteria

- The resolver's `:return` and its `compileReport` call carry `created`, `updated`, `owner`,
  `visibility`, `conversation_id`, `is_owner`, and `resolvedAt`. Passing keys the compiler does not
  yet read is harmless (Tasks 3/4 add the readers).
- A report whose stored spec fails grammar validation: the resolver emits a `:log` identifying the
  report and rejects; the page shows "This report couldn't be loaded". A genuinely missing /
  no-access report still rejects to the same fallback (shared slot, expected).
- A normal report resolves unchanged — same `blocks`, plus the new return fields.
- `pnpm ldf:b` from `apps/demo` is clean; inspect `.lowdefy/server/build/pages/**` for the report
  page to confirm the resolver endpoint compiles.

## Files

- `modules/reporting/api/resolve-report.yaml` — modify: thread provenance/`is_owner`/`conversation_id`/`resolvedAt` into the return and the `compileReport` call; add the pre-validate `:try` + `:log`.
- `modules/reporting/pages/report.yaml` — modify: fallback subtitle copy only.

## Notes

- `conversation_id` absence is the normal-but-not-guaranteed case (never-linked / legacy / the
  sub-second window before the turn-end backfill fires). Pass it through as-is; do not coerce.
- Do not restructure the resolver beyond the bounded pre-validate `:try` — the design is explicit
  that this state is a code bug, not user data drift, so the response is deliberately minimal (log
  - honest message), not a recovery flow.
- Follow-up flagged in the design (not this task, but adjacent): `restore-report.yaml`'s no-stamp
  comment still says the provenance line means "when the SPEC last changed"; the wording should
  become "last edited, which a restore does not touch." Reword only if you're already in that file.

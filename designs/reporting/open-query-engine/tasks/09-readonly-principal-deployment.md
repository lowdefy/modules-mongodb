# Task 9: Read-Only MongoDB Principal — Provisioning + Deployment Docs

## Context

The engine's second safety layer is executing all pipelines as a MongoDB principal granted only `read`. This is a deployment change, not a code change: the `ReportingData` connection's `databaseUri` (a secret, resolved via `_secret` in `modules/reporting/connections/reporting-data.yaml`) is repointed at the read-only user. This task documents the provisioning so an operator can do it correctly — and understands precisely what the principal does and does not defend against.

Cross-cutting secret documentation lives in `docs/shared/secrets.md`; reporting-specific security context lives in the task-8 concept page (link, don't duplicate).

## Task

Write the deployment documentation (extend `docs/shared/secrets.md` and/or the reporting security docs — follow where the existing `MONGODB_URI`-style secrets are documented):

1. **Provisioning:** create a MongoDB user with only the `read` role on the reporting database (the one the catalog's collections live in — the design's non-goal fixes all touched collections to a single database). Include the `db.createUser` / Atlas-role snippet.
2. **Wiring:** point the reporting module's database-URI secret at the read-only user's connection string; note the secret name as declared in `modules/reporting/module.lowdefy.yaml`.
3. **What the principal stops:** `$out`/`$merge` writes and privileged/introspection commands, regardless of validator correctness.
4. **What it does NOT stop (explicit caveats):** server-side JS (`$where`/`$function` run fine under a read-only user — the validator is the sole defense there), CPU/DoS, and reading any collection the user has `read` on — the catalog, not the principal, is the confidentiality boundary. Per-collection grants are possible extra depth but ops-heavy and not required.
5. **View-leak audit responsibility:** a cataloged MongoDB view whose definition `$lookup`s into an undeclared collection leaks past the catalog boundary; operators must audit view definitions when declaring views in the catalog (or narrow the principal to per-collection grants).
6. **Minimum server version:** persisting raw pipelines stores nested `$`-prefixed field names inside saved-report documents — the **app database that holds saved reports must be MongoDB ≥ 5.0**. (The reporting-data database is unaffected by this particular constraint.)

## Acceptance Criteria

- An operator can provision the principal and rewire the secret from these docs alone.
- The docs state, verbatim or near, the two non-defenses (JS/eval; collection confidentiality) so nobody mistakes the principal for the whole security model.
- View-leak audit note and the MongoDB ≥ 5.0 floor are present.
- Front-matter valid; `pnpm docs:check` passes.

## Files

- `docs/shared/secrets.md` — modify — read-only principal secret entry
- `docs/reporting/` security/deployment section (per task 8's structure) — modify — provisioning steps + caveats

## Notes

Independent of all code tasks; can be written any time. If task 8 hasn't run yet, put the full content in `docs/shared/secrets.md` and leave a TODO link for the concept page to pick up.

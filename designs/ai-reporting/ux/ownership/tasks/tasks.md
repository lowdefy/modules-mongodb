# Implementation Tasks — Reporting ownership: visibility, favourites, retirement, and the endpoints over them

## Overview

These tasks implement `designs/ai-reporting/ux/ownership/design.md`: reports get an audience and a life cycle — private by default, publishable app-wide by a role holder, favouritable per user, retired by one soft delete, recoverable — with every act checked server-side. The sub-design ships **no page**, so the work is the analytics validator, the reporting module's API routines, the manifest, the demo's seeded fixtures, the docs, and the Playwright specs that are the actual deliverable.

## Global Constraints

Copied from `design.md` and the parent `designs/ai-reporting/ux/design.md`. Every task inherits them.

- **The identity key is `_user: id`**, never `sub` and never `sub ?? id`. `defaults/user_id.yaml` no longer exists.
- **Persisted field names are `snake_case`**; `created` / `updated` / `deleted` are change stamps of shape `{ timestamp, user: { name, id } }`, composed from `modules/ai-reporting/defaults/change_stamp.yaml`.
- **The soft-delete read predicate is `deleted.timestamp: { $exists: false }`**, not `deleted: null`. `deleted` is initialised `null` on insert.
- **Nothing hard-deletes.** There is no purge endpoint and no archive state.
- **`spec` holds `{ sections }` only.** `title` and `description` are document fields.
- **`spec_version: 1` is written on insert by every creator, and copied verbatim by `duplicate-report`.**
- **The validator may loosen for persisted shapes and never tighten** — nothing in this repo can migrate a module-owned collection.
- **`_payload` of an absent key resolves to `null`**, not `undefined` (`@lowdefy/operators/dist/getFromObject.js:35-37`), so every optional payload key needs an explicit `_if_none` guard. Destructuring-style defaults do not apply.
- **Three writes deliberately do not stamp `updated`:** `set-report-favourite`, `set-report-visibility`, `restore-report`. Every other write does.
- **API endpoint ids are kebab-case; step ids are snake_case.**
- **Endpoints are invoked at `POST /api/endpoints/reporting/{endpoint-id}`** with body `{ payload: {...} }` (`apps/demo/.lowdefy/server/src/routes/endpoints.js`, `app.all('/api/endpoints/*')`). This is how the specs reach a routine with no page.
- **`pnpm ldf:b` from `apps/demo` is the only automatable gate.** Running the e2e suite needs a live server and a reachable MongoDB — a human or `/r:dev-test` step, never an autonomous build gate.

## Tasks

| #   | File                                 | Summary                                                                                                    | Depends On  |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `01-validator-idempotency.md`        | `validateReportSpec` preserves and checks section ids, omits absent optionals, reads null as absent        | —           |
| 2   | `02-manifest-vars.md`                | `share_roles` var, the `reports_collection` naming note, regenerated `vars.md`                             | —           |
| 3   | `03-new-model-write-and-read.md`     | `generate-report`'s insert shape and `resolve-report` opened to shared; the e2e helper module              | 1           |
| 4   | `04-list-reports-aggregation.md`     | `list-reports` rewritten as an aggregation with five scopes, search, sort and `$facet` paging              | 3           |
| 5   | `05-set-report-visibility.md`        | The asymmetric role gate — publish needs owner **and** role, unpublish owner **or** role                   | 2, 3        |
| 6   | `06-set-report-title-and-restore.md` | Two owner-only updates, one stamped and one deliberately not                                               | 5           |
| 7   | `07-favourite-and-duplicate.md`      | The readable-report check; `$addToSet` / `$pull`; the copy's field-by-field shape                          | 6           |
| 8   | `08-remove-report-section.md`        | Read → remove → cascade filter bindings → revalidate without the catalog → write                           | 7           |
| 9   | `09-demo-consumers.md`               | `share_roles` on the demo entry and seeded fixtures for every scope, including a second user               | 5           |
| 10  | `10-docs-and-changesets.md`          | Ownership concepts page with the index list; the identity-key changeset and the owner-reference correction | 8, 9        |
| 11  | `11-exercise-and-build.md`           | The publish life cycle end to end, then the whole suite and `pnpm ldf:b`                                   | 4, 8, 9, 10 |

## Ordering Rationale

**Task 1 is the foundation and nothing about the model works without it.** The document is about to hold `validateReportSpec`'s own output, and that output is re-validated by the same function on every read (`querySections.js:58`, and again inside `compileReport.js:424`) and on `remove-report-section`'s write path. Today it throws three ways when fed its own output, so persisting it before task 1 lands ships a store of unreadable reports. Task 1 also assigns durable section ids, which is what lets task 8 address a section by id with no positional guard.

**Task 2 is a leaf and runs in parallel with task 1.** It only declares `share_roles` and regenerates `vars.md`; nothing reads the var until task 5.

**Task 3 is the model's write and read seam, and it is one task rather than two** because `generate-report` storing `spec: { sections }` with `title` as a document field and `resolve-report` composing `{ title, description, sections }` back before validating are two halves of one shape. Landing them apart leaves the module unable to read what it just wrote. Task 3 also creates `apps/demo/e2e/ai-reporting/helpers.js` — the endpoint-POST wrapper and report-document factory every later spec uses — which is why the specs chain off it rather than each inventing their own.

**Tasks 5 → 6 → 7 → 8 are chained for one mechanical reason: they all add an entry to `modules/ai-reporting/module.lowdefy.yaml`.** There is no logic dependency between `set-report-title` and `set-report-favourite`; a manifest `_ref` must name a file that exists, so a parallel batch would either conflict on that one file or break the build between tasks. The chain also puts the readable-report predicate (task 7) after the endpoint that defines it (task 3) and after the owner-only pair (task 6), so a reviewer reads the auth postures in increasing order of subtlety.

**Task 8 is last of the endpoints and is not split.** The cascade, the revalidation and the two rejections all live in one routine, and the cascade is only correct if the section ids it addresses are the durable ones task 1 assigns.

**Task 4 sits off the chain** — `list-reports` is a rewrite of an existing, already-registered endpoint, so it touches no shared file and can run alongside task 5. It depends on task 3 only for the e2e helper.

**Task 9 needs `share_roles` declared (task 2) and set (its own work) plus the new insert shape (task 3), and is most useful once publishing exists (task 5)** — the seeded fixtures are the shared substrate the four UI sub-designs build on, so they are written once here rather than per surface.

**Tasks 10 and 11 are the closing pair.** The docs and changesets describe behaviour that must already exist, and task 11 is the only task that runs the app: the publish life cycle spec end to end, the full e2e suite, and `pnpm ldf:b`. Nothing else on either path starts a server.

## Scope

**Source:** `designs/ai-reporting/ux/ownership/design.md`
**Context read:** `designs/ai-reporting/ux/design.md` (the parent's data model, cross-cutting invariants and endpoint inventory). Cross-referenced for accuracy: `designs/ai-reporting/report-filters/design.md` and its `tasks/`, `designs/ai-reporting/open-query-engine/design.md`, `docs/shared/soft-delete.md`, `apps/demo/.claude/guides/pagination.md`.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`, and the parent's `review/schema-1.md`.

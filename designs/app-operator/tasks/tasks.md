# Implementation Tasks — `_app` operator migration

## Overview

These tasks migrate `modules-mongodb` from a per-module `app_name` manifest var to Lowdefy's built-in `_app` operator. The implementation derives from [`designs/app-operator/design.md`](../design.md).

## No upstream prerequisite — both capabilities have shipped

The two Lowdefy changes this design originally waited on are live in the pinned version (`lowdefy@0.0.0-experimental-20260611`): `_app` evaluates at build time as well as runtime, and `slug` is required-when-referenced (a missing `slug:` fails the build). See [design.md §Upstream status](../design.md#upstream-status--resolved). The migration is implementable today; no task is gated on Lowdefy.

## The one rule that governs every swap

Replace each `_module.var: app_name` per its **position**, not uniformly:

- **`_app: slug`** — every runtime site (MongoDB filters, change-stamp templates, payload fields, Nunjucks vars, connection props) and every ordinary build position. This is the large majority (~60 of ~72 sites).
- **`_build.app: slug`** — **only** when the operator is a direct argument to a `_build.*` operator. In this repo that is exactly:
  - the `- - _module.var: app_name` key under `_build.object.fromEntries` (event-display maps) in the `create`/`update` APIs of `companies`, `contacts`, `user-account`, and in `user-admin`'s `update-user`/`invite-user`/`resend-invite`;
  - the `makeActionPages.js` resolver vars in `workflows`;
  - the `user-admin.app_title` var **default** (consumed inside `_build.string.concat`), which becomes `{ _build.app: name }`.

When unsure, grep the surrounding lines: if an enclosing operator key starts with `_build.`, use `_build.app`; otherwise `_app`. Counts in this design are indicative — re-grep each module at implementation time rather than trusting a frozen number.

The stored MongoDB field name `created.app_name` does **not** rename — only the _value expression_ changes.

## The `app_name` → `slug` identifier rename (Task 4 only)

Separately from the `_app` swap, the `app_name`/`appName` _identifier_ is renamed to `slug` everywhere it names the slug value — but only in the **workflows subsystem** (`modules/workflows/resolvers/` and `plugins/modules-mongodb-plugins/`), where it's currently pervasive. The other modules have no `app_name` code identifier left once their manifest var is dropped, so they need no rename. This is **Part B of Task 4** and stays in that one task because the `WorkflowAPI` connection property rename must change `workflow-api.yaml` and the plugin `schema.js` in lockstep. Boundary to respect: rename variables/properties/YAML keys/params/JSDoc/tests; never the stored field `created.app_name` or stored keys indexed _by the slug value_ (`action[slug]`, `access[slug]`, `user.apps[slug]`).

## Tasks

| #   | File                                                                             | Summary                                                                                                                                                                                               | Depends On |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | [`01-declare-slug-and-events-default.md`](01-declare-slug-and-events-default.md) | Add `slug: demo` + rename `name:` on `apps/demo/lowdefy.yaml`; relax `events.display_key` to `default: { _app: slug }`.                                                                               | —          |
| 2   | [`02-migrate-simple-modules.md`](02-migrate-simple-modules.md)                   | Migrate `contacts`, `companies`, `notifications`, `user-account`: drop `app_name` var, swap sites, clean demo vars.                                                                                   | 1          |
| 3   | [`03-migrate-user-admin.md`](03-migrate-user-admin.md)                           | Migrate `user-admin`; default `app_title` to `{ _build.app: name }`.                                                                                                                                  | 1          |
| 4   | [`04-migrate-workflows.md`](04-migrate-workflows.md)                             | Workflows subsystem: `_app` migration **+** rename `app_name`→`slug` across resolvers and the plugin engine (incl. the `WorkflowAPI` connection property). Largest task; lockstep, so it stays whole. | 1          |
| 5   | [`05-demo-cleanup.md`](05-demo-cleanup.md)                                       | Demo events vars (`change_stamp` + drop `display_key`), demo chrome (`_app: name`), delete `app_config.yaml`.                                                                                         | 1, 2, 3, 4 |
| 6   | [`06-update-repo-docs.md`](06-update-repo-docs.md)                               | Rewrite README, `docs/idioms.md`, `CLAUDE.md` references and anchors.                                                                                                                                 | 2, 3, 4    |
| 7   | [`07-verify-build-and-tests.md`](07-verify-build-and-tests.md)                   | Build the demo, run lint/tests, exercise event/notification/action-page flows.                                                                                                                        | 5, 6       |
| 8   | [`08-sweep-design-docs-optional.md`](08-sweep-design-docs-optional.md)           | **Optional / deferrable** — standardise "slug" prose across in-flight workflows designs.                                                                                                              | —          |

## Ordering rationale

- **Task 1 is foundational.** `_app: slug` only resolves once `lowdefy.yaml` declares `slug:`, and it now _fails the build_ if referenced while undeclared — so the slug must land before any swap. The events-manifest default change rides along here because it's the same tiny prep step and unblocks Task 5's `display_key` drop.
- **Tasks 2–4 are the migrations**, parallelisable after Task 1. They're split by blast-radius, not module count: the four simple modules (Task 2) are near-identical mechanical swaps with a single `_build.app` site each; `user-admin` (Task 3) is the largest surface and carries the `app_title` default change; `workflows` (Task 4) carries the resolver `_build.app` site whose failure mode (silent page loss) needs its own verification.
- **Task 5 is demo cleanup**, after every module reader has migrated: rewrite the demo events vars, point chrome at `_app: name`, then delete `app_config.yaml` once nothing references it.
- **Task 6 documents** the new pattern after the code it describes has changed.
- **Task 7 verifies** end-to-end before merge.
- **Task 8 is optional.** The design-doc prose sweep is pure documentation churn over workflows designs that are themselves in flux; it can ship later (or as those designs are next touched) without affecting the code migration. Kept separate so it never blocks the PR.

## Scope

**Source:** `designs/app-operator/design.md`
**Context files considered:** `designs/app-operator/lowdefy-requirements.md` (now historical — requirements shipped)
**Review files applied:** `designs/app-operator/review/review-1.md`, `designs/app-operator/review/review-2.md`

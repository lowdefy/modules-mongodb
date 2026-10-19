# Review 2 — Upstream landed; one operator became two; codebase drift; task simplification

Context: this design was drafted 2026-06-05. The repo now pins `lowdefy@0.0.0-experimental-20260611102401`, and the `_app` operator has shipped — so the design's central blocker is gone, but the shipped shape differs from what the design assumed. This review verifies against the pinned version's docs (`lowdefy/packages/docs/operators/_app.yaml`) and the current module YAML.

## Unblocked — the open questions are resolved upstream

### 1. Both Lowdefy requirements in `lowdefy-requirements.md` have landed; drop the "cannot ship" framing

> Status to fix in design: §"Build-time and runtime usage", §"Open questions", and the Prerequisite block in `tasks/tasks.md`.

The design (§Open questions, line 221) says it "cannot ship without falling back to half-measures" until two upstream changes land, and `tasks/tasks.md` (lines 7–14) gates **every** task on them. Both are now shipped in the pinned version. Per `_app.yaml`:

- **Build-time evaluation (Requirement 1).** `env: Client, Server and Build`. "`_app` resolves at **build time** and at runtime, and both produce the same value." Resolves against root `slug`/`name`/`description`/`version`/`license`/`lowdefyVersion`.
- **Slug required-when-referenced (Requirement 2).** "`slug` … **Required when referenced in string form** — `_app: slug` (or `_build.app: slug`) fails the build when `slug` is not declared in `lowdefy.yaml`." The escape hatch is the object form `_app: { key: slug, default: ... }`. Kebab-case format check confirmed.

**Fix.** Rewrite §Open questions to "resolved upstream as of `experimental-20260611`", keep `lowdefy-requirements.md` as historical record (it documents what was asked), and delete the Prerequisite gate from `tasks/tasks.md`. The design is implementable today.

## Correctness — the operator split changes what you write where

### 2. It's two operators (`_app` + `_build.app`), not one operator at two phases

> Affects: §"Build-time and runtime usage" (whole section), §"Migration of `change_stamp`", §Files changed, and tasks 3–8.

The design's load-bearing assumption (§"Build-time and runtime usage", lines 57–67) is a _single_ `_app` "evaluable at **both** build time and runtime", and it proposes `_app: slug` at every one of the ~72 sites uniformly. The shipped reality, per `_app.yaml`:

> In most positions, write `_app: slug` — the build bakes it into the artifact. **Inside a `_build.*` operator** (for example as a `_build.object.fromEntries` map key), **use the `_build.app` form** so it resolves in time to be consumed by the surrounding build operator.

So `_app: slug` is correct "at any level" **except** when it sits directly inside a `_build.*` operator's arguments — there you must write `_build.app: slug`. The design's three build-time classes (§lines 61–65) are correctly _identified_; only the operator spelled at those sites must change from `_app` to `_build.app`. Add a short rule to the design: _runtime and ordinary build positions → `_app: slug`; arguments to a `\_build._`operator →`\_build.app: slug`.\*

### 3. Exact build-time sites that need `_build.app: slug` (everything else is `_app: slug`)

> Affects: §Files changed, tasks 03/04/06/07/08.

I grepped the current tree. Only two patterns are inside `_build.*`:

**a. Event-display map key — `_build.object.fromEntries`.** The `- - _module.var: app_name` line nested under `_build.object.fromEntries` → `_build.if_none` → `_build.object.fromEntries`:

- `modules/companies/api/create-company.yaml:130`, `update-company.yaml:203`
- `modules/contacts/api/create-contact.yaml:103`, `update-contact.yaml:75`
- `modules/user-account/api/create-profile.yaml:77`, `update-profile.yaml:76`
- `modules/user-admin/api/update-user.yaml:109`, `invite-user.yaml:149`, `resend-invite.yaml:23`

These nine sites → `_build.app: slug`.

**b. `makeActionPages` resolver vars.** `modules/workflows/module.lowdefy.yaml:170–171` passes `app_name: { _module.var: app_name }` into a `_ref` resolver that consumes it at build time (`makeActionPages.js:77` destructures `vars.app_name`, throws if falsy, and gates page emission on `action.access?.[appName]`). An unevaluated `{ _app: slug }` object passes the truthy `if (!appName)` guard, then `access?.[ {…} ]` is `undefined` → **every per-action page silently drops** (review-1 finding #1c, still live). → `_build.app: slug`.

**All other `_module.var: app_name` sites are runtime → `_app: slug`:**

- All `notifications/requests/*` and `components/unread-count-request.yaml`: the request declares `payload: { app_name: { _module.var: app_name } }` and filters `created.app_name: { _payload: app_name }`. Swap the payload default only.
- user-admin `requests/*` `$match` filters, and `api/{update-user,invite-user}` field paths built with **runtime** `_string.concat: ["apps.", { _module.var: app_name }, ".roles"]` (note: `_string.concat`, **not** `_build.string.concat` — these are runtime).
- user-admin/user-account/notifications stamp/payload fields `app_name: { _module.var: app_name }`.
- `workflows/connections/workflow-api.yaml:13–14` (server-evaluated connection prop, alongside `_user: true`).
- contacts `pages/{edit,view}.yaml`, user-account `components/view_profile.yaml`.

### 4. `app_title`'s new default must be `{ _build.app: name }`, not `{ _app: name }` — current decision breaks the build

> Affects: §"Default `user-admin.app_title` to `_app: name`" (Key decision), §line 54, task 07. This contradicts the design's own §"Build-time and runtime usage" point 2.

The design proposes flipping `user-admin.app_title`'s default from `''` to `{ _app: name }`. But `app_title` is consumed at **both** build-time and runtime sites:

- **Build-time** (`_build.string.concat`/`_build.string.trim`/`_build.ne`): `pages/new.yaml:21–24` (breadcrumb), `pages/edit.yaml`, `pages/view.yaml`, `pages/all.yaml:9,17`, `menu.yaml:9–10`, `components/excel_download.yaml:24,48`.
- **Runtime** (`_nunjucks` template var): `pages/new.yaml:6–14` page title — `app_title` passed into the template's `on` via `_object.assign`.

A single var default of `{ _app: name }` resolves to an **unevaluated operator object** inside the `_build.string.concat` breadcrumb/menu/excel sites → build break (or `[object Object] User Admin`). `{ _build.app: name }` resolves to a **literal string at build**, which is then safe everywhere — including when passed into the runtime Nunjucks template (it's already a plain string by then). So the default must be `{ _build.app: name }`.

General principle worth stating in the design: **a manifest var default consumed at mixed sites should use `_build.app` (bakes a literal early), because `_app` left as a runtime object breaks any `_build.*` consumer.** This is exactly why removing `app_name` (rather than redirecting it to a default) is right — per-occurrence replacement lets you pick `_app` vs `_build.app` per site, which a single default can't.

### 5. `events.display_key` default `{ _app: slug }` is safe — but confirm, and note why it differs from `app_title`

> Affects: §"Keep `display_key` as a manifest var", task 02.

`display_key` (currently `required: true`, manifest line 21–23) is consumed only at runtime in `events-timeline.yaml` (`_object.fromEntries` + `_string.concat`, per review-1 finding #5, re-confirmed: no `_build.*` consumer). So `default: { _app: slug }` works. This is fine to keep as-is, but the design should say _why_ `display_key` gets `_app` while `app_title` (finding #4) needs `_build.app`: display_key has no build-time consumer, app_title does. If a future build-time consumer of `display_key` appears, it would need flipping to `_build.app`.

## Drift — claims that went stale since 2026-06-05

### 6. Occurrence/file counts are stale; the task must re-grep, not hardcode

> Affects: §Files changed (lines 127–134), task files 03–08.

Design says "80 occurrences across 32 files"; review-1 corrected per-module numbers. Current tree: `grep -rn "_module.var: app_name"` → **72**. The per-module breakdown in §Files changed no longer matches (the codebase changed across the workflows-module work). Don't carry hardcoded counts into tasks — have each migration task re-grep its module and migrate what's actually there. Counts in a design age badly; a `grep` command in the task ages well.

### 7. The demo reads the slug via `_ref: app_config.yaml`, not `_module.var: app_name` — §Files changed mis-describes the demo migration

> Affects: §Files changed (lines 136–151), tasks 09 & 11.

`apps/demo/modules/events/vars.yaml` does **not** use `_module.var: app_name`. It uses `_ref: { path: app_config.yaml, key: app_name }` in two places — `display_key` and `change_stamp.app_name`. Deleting `app_config.yaml` (task 11) therefore requires rewriting those two `_ref`s: `change_stamp.app_name` → `{ _app: slug }` (runtime template, fine), and `display_key` can simply be dropped (it equals the slug and the new default covers it). The design's §Files-changed line 144 ("also drop `display_key` if it equals the slug") is right in spirit but the file's actual shape (a `_ref` into `app_config.yaml`, plus a second `_ref` for `change_stamp.app_name`) should be named explicitly so the implementer doesn't miss the change-stamp line. Also note `change_stamp.version` uses `_ref` into `package.json` — out of scope (not the slug), leave it.

### 8. review-1's build-time map (finding #1b) is now partly stale

> Informational — so the task author doesn't trust the old map.

review-1 finding #1b said user-admin page titles use `_build.string.concat` wrapping `app_title`. Today: page **titles** are `_nunjucks` (runtime); the `_build.string.concat` usage is in **breadcrumbs/menu/excel filenames** (still build-time, see #4). And review-1's claim that field paths are build-time is wrong — they use runtime `_string.concat` (#3). Net: the build-time surface is narrower and differently located than review-1 mapped. Use finding #3/#4 here as the current map.

## Tasks — simplification

### 9. Drop the Prerequisite gate and re-shape tasks around runtime-bulk vs build-time-careful, not per-module

> Affects: `tasks/tasks.md` and the 14 task files.

The migration splits cleanly into **two kinds of work**, and that — not module boundaries — is the axis that matters:

- **Bulk mechanical (runtime):** ~60 of the 72 sites are a literal find-replace `_module.var: app_name` → `_app: slug` plus dropping the manifest var. Splitting this across six near-identical per-module tasks (03–08) fights the design's own "do it as one PR, one mechanical find-replace" decision (§line 202).
- **Careful (build-time):** the nine `_build.object.fromEntries` keys + the workflows resolver vars → `_build.app: slug`, and `app_title`'s default → `_build.app: name` (#3, #4). This is the only part that needs thought and a build to verify.

Suggested collapse from 14 → ~6:

1. **Demo app shell** — merge tasks 01, 09, 10, 11: add `slug: demo`, set `name:`, swap the two demo-events `_ref`s, demo chrome `_app: name`, delete `app_config.yaml`.
2. **events `display_key` default** (task 02, tiny — keep).
3. **Runtime swap** — all runtime `_module.var: app_name` → `_app: slug` across contacts/companies/notifications/user-account/user-admin + drop the manifest vars. One task with a grep checklist.
4. **Build-time swap** — the nine `_build.object.fromEntries` keys + workflows resolver vars → `_build.app: slug`; `app_title` default → `_build.app: name`. The one task that needs `ldf:b` to confirm.
5. **Docs** (task 12).
6. **Verify build** (task 14).

This keeps the dangerous 12 sites in one reviewable task and treats the other 60 as the trivial sweep they are.

### 10. The design-doc prose sweep (task 13) is separable churn — consider deferring or dropping

> Affects: task 13, §"Standardise to 'slug' in prose…" key decision.

Renaming `access.{app_name}` → `access.{slug}` etc. across `designs/workflows-module*/**` is a large doc edit with no code impact, and several of those parts are in flux (the git status shows added/deleted parts under `workflows-module/parts/`). Sweeping prose in designs that are themselves mid-rewrite risks churn-on-churn. Recommend either (a) dropping it from this PR and letting the workflows designs adopt "slug" as they're next touched, or (b) keeping it but scoping to the stored-field-name clarification only. Not a correctness issue — a scope-cost call. (If kept, the design's own rule that `created.app_name` stays as a stored field name is correct and verified — it's a real column on event/notification docs.)

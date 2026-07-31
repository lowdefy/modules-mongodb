# Consistency Review 1

## Summary

Checked `design.md`, both finding reviews, and all twelve task files against the decision register extracted from `review-1.md` and `review-2.md`. Found **11 inconsistencies**: 10 auto-resolved from an unambiguous review decision or a verified fact, 1 resolved by asking the user. Most were review-2 decisions (#1, #6, #8, #9, #11) that landed in `design.md` but were never propagated into the task files.

## Files Reviewed

**Design:** `design.md`
**Supporting:** none — the design folder holds only `design.md`, `review/`, and `tasks/`
**Reviews:** `review/review-1.md`, `review/review-2.md`
**Tasks:** `tasks/tasks.md`, `tasks/01-add-atlas-search-var.md`, `tasks/02-shared-search-builder.md`, `tasks/03-contacts-excel-request.md`, `tasks/04-contacts-search-selector.md`, `tasks/05-companies-requests.md`, `tasks/06-activities-request.md`, `tasks/07-deals-request.md`, `tasks/08-search-index-definitions.md`, `tasks/09-demo-wiring.md`, `tasks/10-docs-and-changeset.md`, `tasks/11-user-admin-and-idiom.md`
**Plans:** none

## Inconsistencies Found

### 1. Task files still describe committed index-definition files

**Type:** Review-vs-Task
**Source of truth:** `review-2.md` #6 — "Resolved by removing the mechanism both halves criticise … no `.search.json` files are added." Design decision 5 and task 8 were rewritten onto the docs convention; the other files were not.
**Files affected:** `tasks/tasks.md:5`, `tasks/06-activities-request.md:20`, `tasks/10-docs-and-changeset.md:9,35,67`, and `design.md:142`
**Resolution:** Rewrote all six references from committed definitions to a documented per-module requirement. `tasks.md:5` now reads "the per-module Atlas Search index requirements documented in `docs/`"; task 6 "the documented `activities` search-index requirement"; task 10's context bullet gained an explicit "No definition files are committed — the module documents the contract, the app creates the indexes"; its changeset instruction now says "changes the Atlas Search index **contract**". `design.md:142`'s "With no search index committed anywhere" became "documented anywhere" — the gap decision 5 actually closes.

### 2. `tasks.md` still frames activities as gaining `returnStoredSource`

**Type:** Review-vs-Task
**Source of truth:** `review-2.md` #1 (activities and deals **pass `false`**; PR #68 preserved, not reversed) and #9 (activities is not the only request missing the flag)
**Files affected:** `tasks/tasks.md:16` (task-table summary), `tasks/tasks.md:34` (ordering rationale)
**Resolution:** Summary now reads "passes `returnStoredSource: false` and fixes the date-range merge"; the rationale bullet now reads "passes `returnStoredSource: false` to preserve PR #68's deliberate opt-out". Task 6 itself was already correct — only the index file lagged.

### 3. Task 4's prose contradicts its own YAML

**Type:** Internal Contradiction
**Source of truth:** `review-2.md` #8 resolution, and task 4's own code block
**Files affected:** `tasks/04-contacts-search-selector.md:40`
**Resolution:** The step said "Keep that merge for the existing three (they own distinct keys), and wrap the whole body in `$and`", but the YAML immediately below drops `_object.assign` entirely for a `$and` + `_array.concat` with the company clause pulled out as its own gated entry. Rewrote the sentence to "Replace that merge with the design's `$and` array (decision 2) … so this request composes its filters the same way as the other six."

### 4. Task 2 states the pre-review array invariant

**Type:** Design-vs-Task
**Source of truth:** `review-2.md` #8 — "The design's invariant is reworded from 'every piece' to 'every **gated** piece'"; `design.md` §Shared builder carries the reworded version plus the `filter`-var exception
**Files affected:** `tasks/02-shared-search-builder.md:25`
**Resolution:** Task 2 said "Every piece that lands in a pipeline or `$and` position returns an **array**" — which task 4 deliberately violates for the selector's `filter` var. Reworded to "Every **gated** piece", with the exception, its justification, and the mongod 8.3.4 `$and: [{}]` verification carried across, so the two files no longer state contradicting rules.

### 5. Task 2 cites the precedent review-2 rejected

**Type:** Review-vs-Task / Stale Reference
**Source of truth:** `review-2.md` #11 — `search_contacts.yaml:61`'s test is a plain `_var` and does not demonstrate a `_module.var` surviving into a `_build.if` test; the design was recited to `contact-selector.yaml.njk:207-209` and `reinstate.yaml:11-13`
**Files affected:** `tasks/02-shared-search-builder.md:14`
**Resolution:** Kept the (accurate) `search_contacts.yaml:61` citation for the `_var`-test shape and added the two correct citations for the load-bearing half — the `_module.var` operator resolving before `_build.*` — with an explicit note that `search_contacts` does not show that. Both citations verified against source while resolving (`contact-selector.yaml.njk:207-209` is `_build.if: { test: { _module.var: use_verified } }`; `reinstate.yaml:11-13` is `_build.not: { _module.var: suspension }` inside a `_build.if` test).

### 6. Wrong demo package name in every build command

**Type:** Stale Reference
**Source of truth:** `apps/demo/package.json` — the package is `@lowdefy/modules-demo`
**Files affected:** `tasks/01`, `02`, `03`, `04`, `05`, `06`, `07`, `09`, `11` — nine occurrences of `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b`
**Resolution:** Replaced with `@lowdefy/modules-demo` throughout. As written, every task's primary build gate would have failed with "no projects matched the filters". `@lowdefy/modules-workflows-test` in task 9 was verified correct and left alone; so were the five module package names in task 10's changeset (`@lowdefy/modules-mongodb-contacts` etc.).

### 7. Task 7 omits the `name`-clause lowercasing change

**Type:** Design-vs-Task
**Source of truth:** `design.md` §Shared builder — "`search_contacts` and `deals`' generic `name` clause gain that lowercasing"; Background line 45 records that deals does not lowercase today
**Files affected:** `tasks/07-deals-request.md:19`
**Resolution:** The task said the `name` pair "is exactly what `text_lead.yaml` generates", which hid a deliberate behaviour change an implementer would otherwise read as a regression. Now states the lowercasing explicitly, why it is intended, and contrasts it with the `_id` clause that must not be lowercased. Task 4 already carried the equivalent note for `search_contacts`.

### 8. Task 10's dependencies omit task 11

**Type:** Internal Contradiction
**Source of truth:** `tasks/10-docs-and-changeset.md:67` — the changeset bumps `-user-admin` "for task 11" and describes that task's escaping fix
**Files affected:** `tasks/tasks.md:20` (dependency column), `tasks/tasks.md` ordering rationale
**Resolution:** Task 10's `Depends On` is now `1, 8, 9, 11`, with a sentence in the rationale saying why. Task 11's bullet now reads "any time after 2 (but before 10)" instead of implying it can land after the changeset that describes it.

### 9. Task 9 step 3 undercounts the `workflows-test` entries it requires

**Type:** Internal Contradiction
**Source of truth:** the same task's Files list (line 92) and acceptance criterion (line 81, "entries for all four searchable modules"); `design.md:297` ("plus new `deals` + `activities` entries")
**Files affected:** `tasks/09-demo-wiring.md:46`
**Resolution:** Step 3 said "add a `deals` entry so `activities` and `deals` also compile … wiring `deals` pulls it in", which reads as one entry — but the step's own next sentence notes entries are order-sensitive and must be listed explicitly. Now reads "add `activities` and `deals` entries … (`deals` depends on `activities`, so both must be listed)".

### 10. Terminology drift: `lead` vs `text_lead`

**Type:** Stale Reference
**Source of truth:** `design.md` §Shared builder file table — the file is `text_lead.yaml`; `lead` is review-1's informal shorthand
**Files affected:** `design.md:44`
**Resolution:** "only the stage-1 `lead` toggle" → "the stage-1 `text_lead` toggle", matching every other reference in the design and tasks.

### 11. `user-admin` index reference page — mandated or not?

**Type:** Design-vs-Task (scope)
**Source of truth:** Asked user — chose "contrast only"
**Files affected:** `design.md:234` vs `tasks/08-search-index-definitions.md` (four modules only) and `tasks/10`/`tasks/11` (user-admin gets one shared-page link)
**Resolution:** Decision 5 ended "`user-admin` needs only these" immediately after saying regular `mongod` indexes "go on the same pages", which reads as mandating a fifth index reference page that no task creates. **Asked user — confirmed the sentence is a contrast, not a deliverable.** Reworded to "They go on the same **four** pages … `user-admin` has **no search-index requirement at all** … so it gets no index reference page here; its indexes are outside this design's scope, and the only note it needs is the one in decision 6." Task 8 needed no change.

### Also resolved while open

**Task 5's deferred verification** (`tasks/05-companies-requests.md:72`) hedged: "If the build resolves `_module.var` early enough that a plain mapping key works, prefer the plainer form — verify against the built artifact rather than assuming." That is a "verify at code time" punt on a question the design already answers: the shared-builder section rules out a `.yaml.njk` loop for `companies` precisely because `{ _module.var: name_field }` is "an operator, not a literal string", and Lowdefy resolves operators in value positions only while a YAML mapping key is a scalar. Replaced the hedge with the settled answer — `_object.defineProperty` is the only option — and cross-referenced the design's reasoning, per the repo's "resolve the open question; don't defer it" rule.

## No Issues

Checked and consistent — no change needed:

- **Request counts and shapes.** The scope correction's "7 requests across 4 modules — 5 filters-in-`$search`, 2 already split" agrees with the Background table, decision 2's restructure scope, Files-changed ("5 restructured + 2 adjusted"), and the task split (2, 3, 5, 6 = 5 restructured; 4, 7 = 2 adjusted).
- **`returnStoredSource` opt-outs.** Design proposed-change 4, decision 3, decision 5, task 6, task 7, task 8, task 9's artifact assertions, and task 10's shared-page outline all agree: default `true`, `activities` and `deals` pass `false`, and their documented indexes omit `storedSource`.
- **`$and` merge semantics.** Consistent across decision 2, the pipeline skeleton, tasks 2–7, and task 11, including the never-empty argument and the `$and: [{}]` probe result (cited identically in design §Shared builder, task 4, and task 11).
- **The two gating dimensions.** `_build.*` for `atlas_search`, runtime `_array.concat` + `_if` for `term`; asserted the same way in decision 2, §Shared builder, and every converting task, with the `$facet`'s retained `_build.array.concat` correctly excepted in tasks 2, 3, 5, 6.
- **Empty-string term gate.** `_ne: [{ _if_none: [{ _var: term }, ""] }, ""]` in all four builder files (task 2), with matching notes in task 2 and task 4 — review-2 #2 fully propagated.
- **Two consumer hooks.** `request_stages.filter_match` (module var, array) vs the selector's `filter` (component var, object) stay distinct in decision 4, the migration note, task 1, task 4, and task 10.
- **`user-admin` scope.** Scope correction, non-goals, decision 2's `$and` paragraph, decision 6, Files-changed, `tasks.md`, task 1's exclusion note, task 9's note, task 10's changeset line, and task 11 all agree: one file changes, no `atlas_search` var, no `$search`.
- **Docs paths and layout.** Verified on disk: `docs/{contacts,companies,activities,deals}/reference/` currently hold only `vars.md`, so task 8's creates are correct; `docs/deals/index.md:57` really has `## Required indexes` to correct; `docs/user-account/reference/indexes.md` and `docs/workflows/reference/indexes.md` exist as the cited convention; `docs/shared/soft-delete.md` exists, so task 10's list of shared pages is accurate.
- **Module package names** in task 10's changeset — all five verified against their `package.json`.
- **The `org-aware-modules` coordination note** (`tasks.md`, task 10) — still live: `origin/design/org-aware-modules` is not an ancestor of this branch and still carries `docs/shared/atlas-search-indexes.md`, so the reconciliation instructions remain load-bearing rather than stale.
- **Task 8's filename** (`08-search-index-definitions.md`) predates review-2 #6's shift from files to docs, but its title, body, and `tasks.md` row all say "document the requirements". Left as-is: renaming would break `tasks.md`'s reference and any issue already created from it, for no gain in the content.

# Consistency Review 2

## Summary

Re-checked `design.md`, both finding reviews, `consistency-1.md`, and all twelve task files after a design revision that changed the pipeline-assembly mechanics and consolidated the shared builder. Found **12 inconsistencies**, all auto-resolved from either the revised `design.md` or a verified fact — none needed a user decision, because the one substantive fork (build-time vs runtime concat) had already been decided before this pass began.

Nearly all of them share one cause: the revision changed how pieces are spliced and how many builder files exist, and the task files were written against the previous mechanics.

**One hierarchy note for future passes.** `review-1.md` #3's resolution mandates a **runtime** `_array.concat` pipeline root. That is deliberately superseded by an explicit user decision (build-time concat + no-op stages), now recorded in design decision 2 with its verification. The normal "highest-numbered review wins" rule was overridden knowingly here; `design.md` is the source of truth for the assembly shape, not review-1 #3.

## Files Reviewed

**Design:** `design.md`
**Supporting:** none — the design folder holds only `design.md`, `review/`, and `tasks/`
**Reviews:** `review/review-1.md`, `review/review-2.md`; `review/consistency-1.md` read for context, excluded from the decision chronology
**Tasks:** `tasks/tasks.md`, `tasks/01-add-atlas-search-var.md`, `tasks/02-shared-search-builder.md`, `tasks/03-contacts-excel-request.md`, `tasks/04-contacts-search-selector.md`, `tasks/05-companies-requests.md`, `tasks/06-activities-request.md`, `tasks/07-deals-request.md`, `tasks/08-search-index-definitions.md`, `tasks/09-demo-wiring.md`, `tasks/10-docs-and-changeset.md`, `tasks/11-user-admin-and-idiom.md`
**Mockups:** none

## Inconsistencies Found

### 1. The design revision dropped review-2 #8's array invariant and its `filter` exception

**Type:** Review-vs-Design
**Source of truth:** `review-2.md` #8 — "The design's invariant is reworded from 'every piece' to 'every **gated** piece'", with the selector `filter` var named as the justified exception
**Files affected:** `design.md` §Shared builder
**Resolution:** The rewrite that changed the assembly mechanics removed the invariant paragraph entirely, silently discarding a settled decision that `tasks/04` still depends on and states. Restored as a "Every gated piece returns an array" paragraph carrying the `filter`-var exception, the `$and: [{}]` verification, and the two rejected alternatives (a runtime emptiness `_if`; changing the var from object to array). Found by comparing the design against task 4, which had kept it.

### 2. Every converting task specified a runtime `_array.concat` pipeline root

**Type:** Design-vs-Task
**Source of truth:** `design.md` decision 2 — the root stays `_build.array.concat`; each gated piece is a `_build.if` returning `[]` or a one-element array holding a runtime `_if` that resolves to a stage or a no-op stage
**Files affected:** `tasks/02` (gating-dimensions section, the `text_lead`/`score_stage` bodies, the conversion YAML, acceptance criteria, notes), `tasks/03`, `tasks/04`, `tasks/05`, `tasks/06`, `tasks/07`
**Resolution:** Rewrote the assembly instruction in all six. `text_lead.yaml` and `score_stage.yaml` now return a one-element array wrapping a runtime `_if` whose `else` is `$match: {}` / `$addFields: {}`; each task's root becomes (or stays) `_build.array.concat`. Task 2's verification bullets were replaced with the four facts that actually support the new shape: `get_contact_excel_data.yaml:74` as the surviving-runtime-`_if`-element precedent, the mongod 7.0.39 no-op probe, `get_deals_list.yaml:16-25` as the production precedent, and the corrected `_module.var`-before-`_build.*` citations. The distinction that matters — flattening a runtime array is impossible, holding a runtime `_if` as an element is fine — is now stated in task 2 rather than left implicit.

### 3. `regex_value.yaml` no longer exists

**Type:** Stale Reference
**Source of truth:** `design.md` §Shared builder — four files; escaping folded into `regex_clause.yaml`, which now owns the fan-out and therefore the only call site
**Files affected:** `tasks/tasks.md`, `tasks/02`, `tasks/03`, `tasks/04`, `tasks/05`, `tasks/07`, `tasks/11`
**Resolution:** Deleted the `regex_value.yaml` definition from task 2 and folded its escape expression into `regex_clause.yaml`. Every caller's `or:` var became `paths:`, and the nested per-clause `_ref`s went away. `tasks.md`'s "task 11 needs task 2 for `regex_value.yaml`" now names `regex_clause.yaml`.

### 4. `score_addfields.yaml` renamed to `score_stage.yaml`

**Type:** Terminology Drift
**Source of truth:** `design.md` §Shared builder file table
**Files affected:** `tasks/02`, `tasks/03`, `tasks/04`, `tasks/05`, `tasks/06`, `tasks/07`
**Resolution:** Propagated the rename. The file no longer only adds fields — it selects between an `$addFields` and a no-op — so the old name had become actively misleading.

### 5. Builder file count still five

**Type:** Design-vs-Task
**Source of truth:** `design.md` — four files
**Files affected:** `tasks/tasks.md` ordering rationale, `tasks/02` §1 heading and acceptance criteria and Files list
**Resolution:** Four throughout; task 2's acceptance criterion now points at `regex_clause.yaml` as the sole home of the escape pattern.

### 6. The regex fan-out is now generated from `paths`, and task 5 argued the opposite at length

**Type:** Design-vs-Task
**Source of truth:** `design.md` §Shared builder — "The regex fan-out is built from `paths`, not hand-authored per request", with the `_function` prefix contract and the two server-side precedents
**Files affected:** `tasks/05` (context paragraph and the dynamic-key paragraph), `tasks/02`, `tasks/03`, `tasks/04`, `tasks/07`, `tasks/11`
**Resolution:** `tasks/05:12` had stated that the operator-valued `name_field` path "is the reason the shared builder's regex fan-out is authored per request rather than generated from a `paths` list" — now exactly backwards. Rewritten to say why it is _not_ an obstacle (`_module.var` resolves at build, so `paths` is literal strings by runtime) while keeping the valid half: it _is_ why a `.yaml.njk` loop could not have done the job. Its dynamic-key paragraph — which instructed the implementer to build `_object.defineProperty` at the call site and ended "Do not look for a plainer form" — now says the builder owns that internally and the caller passes a path list. This also retires `consistency-1.md`'s "Also resolved while open" item, which had settled the question in the opposite direction.

### 7. Task 7 told the implementer to delete the pattern the design now adopts

**Type:** Design-vs-Task / Internal Contradiction
**Source of truth:** `design.md` decision 2 — `get_deals_list.yaml:16-25` is cited as the _precedent_ for the no-op shape
**Files affected:** `tasks/07-deals-request.md`
**Resolution:** Step 1 read "no no-op `$match` stage either (the builder returns `[]`)" — instructing removal of the exact `_if` → `$search` / `$match: {}` construct the design now generalises from this very file. Rewritten to say the `_if` and its `$match: {}` branch move _into_ `text_lead.yaml` and come back by `_ref`. Its acceptance criterion now says neither is authored "in this file" rather than that neither exists, and the stage-comment instruction no longer calls the mechanism "gone". Also recorded that `deals` is the one caller whose `regex_clause` `paths` (`[_id, name]`) deliberately differs from its `text_lead` `paths` (`[name]`), since the fallback has no `keywordAnalyzer` clause to carry the deal code.

### 8. Task 3's premise inverted — its root concat was the problem, now it is the precedent

**Type:** Design-vs-Task
**Source of truth:** `design.md` decision 2, which cites `get_contact_excel_data.yaml:74`
**Files affected:** `tasks/03-contacts-excel-request.md`
**Resolution:** The context said "The root `_build.array.concat` is the problem … The root must become a runtime `_array.concat`." That root is now preserved, and this file's existing runtime `_if` inside it is the evidence the whole approach rests on. Rewritten to say so; the acceptance criterion flipped from "no `_build.array.concat` remains at the pipeline root" to keeping it. Its remaining genuine wrinkles (no `$facet`, sort in the pipeline, combined `$addFields` to split) are now what distinguishes the task.

### 9. Task 11's step 2 was scoped to `$regex` values, but the whole clause is now shared

**Type:** Design-vs-Task
**Source of truth:** `design.md` §Shared builder — `regex_clause.yaml` gates on the term _and_ builds the `$or`, and defaults `atlas_search: false` for exactly this caller
**Files affected:** `tasks/11-user-admin-and-idiom.md`
**Resolution:** Step 2 replaced each inline `$regex`/`$options` pair while keeping the hand-authored `$or` and its `_if` wrapper. Since `regex_clause` supplies all three, the ref now replaces the entire search entry, and step 1's "keeping all four clause `_if`s byte-for-byte" became "the `roles_arr` and two status clause `_if`s". Also documented a behaviour change the task had not mentioned: the shared gate tests `""` where this file tests `null`, so clearing the members search box now drops the clause instead of emitting `{ $regex: "", $options: i }` on both fields — which matched every member.

### 10. `tasks.md` described task 3's distinguishing wrinkle as its build-concat root

**Type:** Stale Reference
**Source of truth:** `design.md` decision 2 — every converted request now has a `_build.array.concat` root, so it distinguishes nothing
**Files affected:** `tasks/tasks.md` task table row 3, ordering rationale bullet 3
**Resolution:** Both now name the real wrinkles: no `$facet`, `$sort` directly in the pipeline, and the combined `$addFields` that has to be split.

### 11. Task 9's artifact assertions predated the no-op branch

**Type:** Design-vs-Task
**Source of truth:** `design.md` decision 2
**Files affected:** `tasks/09-demo-wiring.md`
**Resolution:** The demo (Atlas) assertion now expects a runtime `_if` with a `$search` `then` **and** a `$match: {}` `else`, rather than just "a `_if`-gated `$search`". The `workflows-test` (fallback) assertion gained the complement: the build gate removes the no-op slots too, so no stray `$match: {}` / `$addFields: {}` should appear, and the `$or` keys should be resolved field names.

### 12. Probe-version drift on the `$and: [{}]` claim

**Type:** Internal Contradiction
**Source of truth:** both probes — `review-2.md` #8 on mongod 8.3.4, re-confirmed this pass on 7.0.39
**Files affected:** `tasks/04`, `tasks/11`
**Resolution:** The two files would have cited different server versions and different error strings for the same claim. Both now read "mongod 8.3.4, re-confirmed on 7.0.39" and cite `BadValue` without pinning version-specific wording. The claim itself is unaffected — `$and: []` is rejected and `$and: [{}]` accepted on both.

### Recorded, not re-fixed

`design.md`'s treatment of `search_contacts` was **behind** `tasks/04` until the revision immediately preceding this pass: the design said it needed "only the stage-1 toggle and the regex clause", while task 4 had already converted its `$match` to `$and` per review-2 #8. The design now mandates the conversion, so the two agree. Noted here because the drift direction was unusual — the task was correct and the design was stale.

## Open question carried forward

**`storedSource: true` storing the whole document is still unverified.** Decision 5's footgun mitigation, and therefore decision 3's correctness argument, rest on `storedSource: true` storing every field regardless of `dynamic: false` and a text-only `fields` map. This repo cannot settle it: the sandbox blocks `mongodb.com` and no Atlas cluster is reachable. If it turns out false, decision 5 needs an explicit `storedSource.include` list per module and the `search_contacts` gap does not close. Flagged in the design and left open rather than asserted.

## No Issues

Checked against the current design and each other — already consistent, no change needed:

- **Task 1** — manifest-only work; contains no builder or assembly references, so the mechanics change does not touch it. Its `atlas_search` block, `filter_match` rewording, `type: array` additions, and `user-admin` exclusion all match design decision 4 and the migration note.
- **Task 8** — no builder references. Its per-module split (whole-document stored source for `contacts`/`companies`, none for `activities`/`deals`), the `default` index name justification, the `keywordAnalyzer` multi for `deals`, the `name_field` coupling, the no-`token`-mappings rule, and the versioning statement all match design decision 5.
- **Task 10** — no builder references. Its `docs/shared/search.md` outline, the five landing-page links including `user-admin`'s "why no flag" bullet, and the changeset content match design decision 6 and the migration note.
- **`returnStoredSource` opt-outs** — design proposed-change 4, decision 3, decision 5, and tasks 6, 7, 8, 9, 10 all agree: default `true` on the builder, `activities` and `deals` pass `false`, their documented indexes omit `storedSource`.
- **Empty-string term gate** — `_ne: [{ _if_none: [{ _var: term }, ""] }, ""]` in all four builder files (task 2), with matching notes in task 2, task 4, and now task 11. Review-2 #2 remains fully propagated.
- **`$and` merge semantics and the never-empty argument** — consistent across design decision 2, the skeleton, tasks 2–7, and task 11.
- **Two consumer hooks** — `request_stages.filter_match` (module var, array) vs the selector's `filter` (component var, object) stay distinct in design decision 4, the migration note, and tasks 1, 4, 10.
- **`user-admin` scope** — one file changes, no `atlas_search` var, no `$search`: agreed across the design's Background and Non-goals, decision 2, Files changed, `tasks.md`, and tasks 1, 9, 10, 11.
- **Request inventory** — 5 filters-in-`$search` + 2 already split across 4 modules, verified by reading all seven request files this pass; agrees with the Background table, Files changed, and the task split (2, 3, 5, 6 = 5 restructured; 4, 7 = 2 adjusted).
- **The `org-aware-modules` coordination note** — re-verified rather than carried over: `origin/design/org-aware-modules` is still not an ancestor of this branch and still carries `docs/shared/atlas-search-indexes.md`, so the note in `tasks.md` and task 10 remains load-bearing.
- **`consistency-1.md`** — left unedited as a dated record of that pass. Note its "No Issues" entry asserting a runtime `_array.concat` for the term dimension is superseded by the assembly decision above.

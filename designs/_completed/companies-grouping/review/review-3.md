# Review 3 — Design + tasks readiness for implementation

Focus: combined critical review of `design.md` and `tasks/01..11`. Looking for bugs, ambiguities, and gaps that would block or mislead the implementer.

## Critical

### 1. Cycle-check projection only inspects the first matched candidate parent

> **Resolved.** Added a `$group: { _id: null, has_cycle: { $max: "$has_cycle" } }` stage to the cycle-check pipeline (in both `design.md` Cycle-check step layout and `tasks/04-update-company-cycle-check.md` section B). The `$group` OR-reduces `has_cycle` across all matched candidate parent docs into a single output doc — `$max` on booleans gives `true || false → true`. Downstream `_step.cycle_check.0.has_cycle` now correctly reflects "any candidate parent forms a cycle" rather than only the first. Updated the design's "Three notes on this layout" bullet to explain the OR-reduce.

The cycle-check pipeline in `design.md` (Cycle-check step layout, lines ~362–402) and in `tasks/04-update-company-cycle-check.md` (B) is:

```yaml
- $match:
    _id: { $in: <payload.parent_ids> } # one doc per matched candidate parent
- $graphLookup:
    startWith: "$_id" # per-doc starting point
    connectFromField: parent_ids
    connectToField: _id
    as: __ancestors
- $project:
    has_cycle:
      $in: [<self._id>, $concatArrays: [["$_id"], "$__ancestors._id"]]
```

The pipeline produces **one document per matched candidate parent**. The downstream `_step.cycle_check.0.has_cycle` reads only the **first** doc's projection. If `payload.parent_ids = ["A", "B"]`, the cycle exists _only via B_, and A is matched first, the check reads `A.has_cycle = false` and lets the update through — even though B would close a loop.

**Fix:** OR-reduce across all candidate parent docs. Two viable approaches:

1. Add a `$group` stage that aggregates `has_cycle` with `$max` (booleans `true > false`) into a single doc:

   ```yaml
   - $group:
       _id: null
       has_cycle: { $max: "$has_cycle" }
   ```

   Then `_step.cycle_check.0.has_cycle` is the OR across all matched candidates.

2. Restructure to a single `$graphLookup` from a synthetic root document holding all candidate parent_ids in one array, then check via a single `$expr`. More invasive.

Approach 1 is the smallest change. Update both the design's "Cycle-check step layout" YAML and `tasks/04-update-company-cycle-check.md` section B.

### 2. `$graphLookup.from` collection-name resolution: no in-repo precedent

> **Resolved.** Hardcoded `from: companies` in tasks 2, 4, and 8. Verified via `modules/companies/connections/companies-collection.yaml:6` that the literal collection name is `companies`. Updated the "Notes" sections in all three tasks to explain that no `_module.collection` resolver exists in Lowdefy and that hardcoding is safe across consumer connection remappings (a remapped connection points at a different collection, where this design's data wouldn't exist anyway). The earlier "<companies-collection name — see Notes>" placeholders are gone.

Tasks 2, 4, and 8 each defer the `from:` value with a "see Notes" comment that says "Lowdefy doesn't support `_module.collection` directly; use whichever pattern existing requests use for `$lookup.from`". A grep across `modules/` shows **no `$lookup` or `$graphLookup` usage anywhere** — only doc references in `contacts/README.md:123` and `companies/README.md:174` describe the _concept_. This design is the first to add either.

The literal collection name _is_ available — `modules/companies/connections/companies-collection.yaml:6` declares `collection: companies`. So `from: companies` is the only practical answer.

**Fix:** in tasks 2, 4, and 8, replace the "<companies-collection name — see Notes>" placeholder with `from: companies` directly, and drop the "first existing pattern" hand-wave. Add a short note on the design ("Related cleanup" or directly in the API section): `$graphLookup.from` is hardcoded to the literal collection name `companies` because Lowdefy has no `_module.collection` resolver. If a consuming app remaps the connection via `connections:`, they're remapping to a different _connection_, not a different collection name — so the hardcode is safe across remappings.

### 3. Edit-page `onMount` is three steps, not two — design promises something the tasks don't deliver

> **Resolved.** Updated the design's "Architecture / Edit form" section to describe a **three-step sequence**: `fetch_doc_data` → `set_state` (writes `cycle_check_ids` and `parent_ids` from the request results) → `fetch_selector_options`. The example YAML now shows `set_state` as the middle step. The step-by-step prose was also rewritten to match. Design and task 7 are now consistent.

The design's "Architecture / Edit form" (lines ~225–238) shows a literal two-step sequence:

```yaml
onMount:
  - id: fetch_doc_data
    type: Request
    params: [get_company, get_company_contact_ids, get_descendant_company_ids]
  - id: fetch_selector_options
    type: Request
    params: get_companies_for_selector
```

But the **selector's underlying request** reads `_state: cycle_check_ids` (per task 5B). Nothing in the design's two-step sequence ever writes that state — `set_state` (the existing third action that copies request results into state) is missing from the design example.

`tasks/07-edit-form-wiring.md` correctly identifies the gap and reframes as **three steps in effective order**: `fetch_doc_data` → `set_state (with parent_ids and cycle_check_ids)` → `fetch_selector_options`. But this is a drift from the design.

**Fix:** update the design's "Architecture / Edit form" section to show the actual three-step sequence (or two-step with `set_state` between them), so the design and tasks agree. The current design example is not implementable as written.

## Medium

### 4. `get_descendant_company_ids` payload pattern: design claim is wrong

> **Resolved.** Moved the `_if_none: [_state.filter.parent_scope, _state._id]` fallback into `tasks/02-descendants-request.md` as the initial request shape — the request file now ships with the fallback chain from day one. Updated the design's Architecture / List page YAML and prose to describe the fallback (replacing the wrong "each invocation supplies its own state path" claim). Removed the "modify request file" step from `tasks/07-edit-form-wiring.md`'s Files list and from its inline notes — task 7 no longer needs to touch the request file.

Design (Architecture / List page, lines ~270–301):

> The list page reuses the **same `get_descendant_company_ids` request** the edit form uses, with a different payload (`root_id: _state.filter.parent_scope` instead of `_state._id`). The request itself is defined once. […] Each page that uses this request supplies its own state path for `root_id` — Lowdefy resolves the payload per request invocation, so the edit form and list page don't conflict.

That last sentence is **wrong**. The `payload:` block lives in the request file, not at the invocation site. Lowdefy `Request` action invocations don't override payload — the payload is the same wherever the request fires.

`tasks/07-edit-form-wiring.md` resolves this correctly by adding a fallback chain in the request file:

```yaml
payload:
  root_id:
    _if_none:
      - _state: filter.parent_scope
      - _state: _id
```

But the design still says the wrong thing, and the fix is described as "lands when this task is implemented" — meaning task 2 ships with the wrong payload and task 7 patches it. Better to land the fallback in task 2 from the start.

**Fix:** correct the design's claim ("each page supplies its own state path") to describe the fallback-chain implementation, and move the fallback into `tasks/02-descendants-request.md` as the initial request shape. Task 7's "Files" entry that modifies task 2's request goes away.

### 5. `_build.if` to omit a key entirely: pattern is plausible but unconfirmed

> **Resolved.** Added an explicit "Verification step" to `tasks/03-create-company-parent-ids.md`'s acceptance criteria flagging that the `_build.object.assign` + `_build.if(then: { parent_ids: ... }, else: {})` combination should be verified at implementation time. If `else: {}` doesn't produce a clean key omission (e.g. emits `parent_ids: undefined` instead of dropping the key), the fallback is to wrap the entire `doc:` block in a single `_build.if` with two duplicated branches — verbose but unambiguous. The pattern itself is plausible (`_build.object.assign` is verified in use at `modules/layout/components/page.yaml:24,131`), just not exercised with empty-object branches in the existing codebase.

Tasks 3, 4, and 10 use this pattern:

```yaml
_build.object.assign:
  - { ...always-included fields... }
  - _build.if:
      test: { _module.var: hierarchy.enabled }
      then: { parent_ids: ... }
      else: {}
```

The `_build.object.assign` operator exists (verified at `modules/layout/components/page.yaml:24,131`). And merging `{}` is a no-op. So this _should_ work — but no existing usage in the repo combines `_build.object.assign` with a `_build.if` returning `{}` for key omission. The closest precedent is `page.yaml:142–155`, which uses `_build.if` _as a value_ (not for key omission), and the value can be `null`.

**Fix:** verify the pattern works at implementation time by checking task 1's build output with `hierarchy.enabled: false` is byte-identical to today's. If `_build.object.assign` doesn't merge `{}` cleanly (e.g., adds an explicit `parent_ids: undefined` field), fall back to wrapping the entire `doc:` block in a `_build.if` with two duplicated branches — verbose but works.

Update the affected tasks to flag this as a verification step rather than implying the pattern is known to work.

### 6. "Byte-identical when disabled" promise is overstated

> **Resolved.** Softened acceptance criteria language in `tasks/03-create-company-parent-ids.md` and `tasks/05-company-selector-cycle-check-ids.md` from "byte-identical" to "behaviourally identical" / "behaviourally backward-compatible". Task 5's acceptance criteria now explicitly notes that the new `disabled` projection field is added to every selector option result regardless of `hierarchy.enabled`, but resolves to `disabled: false` for every row when `state.cycle_check_ids` is empty (which it is for every consumer that doesn't deliberately set it). No existing consumer reads the new field. Task 3's acceptance criteria stays close to byte-identical (the `parent_ids` key is genuinely omitted from the inserted doc when disabled, per the `_build.if` + `else: {}` pattern).

The design (multiple sections) and several tasks (acceptance criteria) say `hierarchy.enabled: false` produces byte-identical build output. That's not literally true:

- Task 5 modifies `get_companies_for_selector.yaml` to add a `disabled` projection field and reads `_state: cycle_check_ids`. These changes apply **regardless of `hierarchy.enabled`** — they're inside a shared selector request consumed by other modules too. Output for non-hierarchy apps gets an extra `disabled: false` field on every option.
- Task 5 also adds `disabledField: disabled` to `company-selector.yaml`'s `optionConfig`. Always present, regardless of the flag.

Behavioural impact: zero (the extra field is unused when not consumed; `disabledField` pointing at a field whose value is always `false` is a no-op). But "byte-identical YAML" isn't accurate.

**Fix:** soften the design and task language from "byte-identical" to "behaviourally identical when `hierarchy.enabled: false`". The acceptance criteria for tasks 5 and 7 should say "the new option projection adds `disabled` (always false when `cycle_check_ids` is empty) and the selector's `optionConfig` adds `disabledField: disabled` — behaviour is unchanged for all consumers."

### 7. `hierarchy.parent_label` / `hierarchy.children_label` with no `default:` — Lowdefy var-schema unverified

> **Resolved.** Added `default: null` to both `parent_label` and `children_label` in `tasks/01-module-manifest.md`. Verified against `modules/companies/module.lowdefy.yaml` lines 17–112 that every existing typed var has an explicit `default:` value — adding `default: null` matches the convention. The `_if_none` chains in downstream tasks correctly fall through `null` to the `_string.concat` fallback. Added a verification step to task 1's acceptance criteria: build the demo without setting `hierarchy.parent_label` and confirm the labels render as "Parent Companies" / "Child Companies".

Task 1 declares both label vars with no `default:`:

```yaml
parent_label:
  type: string
  description: Optional override...
```

The intent is "value is undefined unless the consuming app sets it; the usage site uses `_if_none` to fall back to a `_string.concat`." This is the right intent, but it's worth verifying that Lowdefy's var-schema accepts a string-typed var with no default and treats it as "undefined" rather than failing the build. Other module manifests in the repo always provide a default for typed vars (verify by skimming `modules/contacts/module.lowdefy.yaml`, `modules/user-admin/module.lowdefy.yaml`).

**Fix:** if Lowdefy requires defaults, set `default: null` explicitly (the `_if_none` chain treats `null` the same as undefined). If null is also rejected, set default to the `_string.concat` expression directly — but that requires the var resolver to evaluate operators in defaults, which may not work either.

Add a verification step to task 1's acceptance criteria: build the demo app _without_ `hierarchy.parent_label` / `children_label` set in vars, and confirm the build doesn't fail and the labels render as "Parent Companies" / "Child Companies".

### 8. Task 9 tile structure under-specified

> **Resolved.** Read `modules/companies/components/tile_contacts.yaml` and `modules/companies/components/contact_list_items.yaml` and concretised the `tile_hierarchy` sketch in task 9 (B) using the actual module convention: `_ref: { module: layout, component: card }` frame with a `Box` that owns the requests, and an `Html` block with `_nunjucks` template handling both Parents and Children sections. The `_nunjucks` template's `on:` map binds `parents`, `children`, headings, `name_field`, and `view_page` from request results and module vars. Per-item access uses Nunjucks `{% for %}` loops with `parent[name_field]` and `child.display_name`. Replaced the `List + itemTemplate` sketch (which had no in-repo precedent) with the `Html + Nunjucks` pattern that matches the existing tiles. Notes section also updated.

`tasks/09-view-page-hierarchy-tile.md` (B) says "Read `tile_contacts.yaml` first to find the right shape, then mirror it for both sections" and provides only a sketch. For a self-contained task, this defers more than it should.

The design itself only describes the tile in prose ("two stacked sections, each with its own heading and request"). The task adds a sketch but with TODO-flavoured language ("adapt to the actual tile/card idiom").

**Fix:** read `modules/companies/components/tile_contacts.yaml` and concretise the tile sketch in task 9 (B). Show the actual `_ref: { module: layout, component: card }` invocation, the actual `List` block + `itemTemplate` shape, and the actual link-on-click pattern — drawn from existing precedent. Reduces implementation ambiguity and surfaces concerns earlier (e.g. what `itemTemplate` exposes for the iterated row's `_id`).

### 9. Task 5 changes `get_companies_for_selector.yaml` for everyone

> **Resolved.** Grep confirms that _no in-repo file_ `_ref`s `module: companies, component: company-selector` — only `modules/companies/module.lowdefy.yaml` references it (the export declaration). Apps consume it externally via their `lowdefy.yaml`. So the projection change has no in-repo blast radius today; the new `parent_selector.yaml` from task 6 becomes the second consumer. External consumer apps will see the extra `disabled` field on every option result, but their selectors don't read `disabledField` (only `company-selector.yaml` adds it, per task 5 step B.2), so the change is behaviourally backward-compatible. Updated task 5's "Notes" section to enumerate this finding and recommend `pnpm ldf:b:i` against the demo plus any consumer app the implementer is testing.

Task 5 adds a `payload.cycle_check_ids` block and a `$cond`-based `disabled` projection to `get_companies_for_selector.yaml`. This request is referenced by `company-selector.yaml`, which is referenced by:

- The companies module itself (for parent-picking, post-task-7).
- Other module pages that `_ref` `module: companies, component: company-selector` to embed a company selector.

The change is backward-compatible (the `_if_none` fallback to `[]` means no rows are disabled when `cycle_check_ids` isn't set). But it does alter the projection shape returned to _every_ consumer — adds a `disabled` field to every option. The task's acceptance criteria mention contacts but don't enumerate consumers comprehensively.

**Fix:** add a step to task 5 that grep's for `_ref:.*company-selector` across the repo and lists every consumer in the task's "Notes" so the implementer can spot-check each one builds and renders unchanged.

### 10. Reset/Clear button in task 10 leaves `parent_scope_ids` stale

> **Resolved.** Made the fix explicit in `tasks/10-list-filter.md`'s "Notes" section: when `hierarchy.enabled`, the Clear button's `onClick` action chain inserts a `re_resolve_descendants` Request action between `Reset` and the existing `actions/search.yaml`. After Reset, `state.filter.parent_scope` is undefined → the descendants request's `_if_none` fallback chain produces an empty `ids` array → the conditional `must` clause skips → the list returns to unscoped. Concrete YAML included.

Task 10 (Notes) flags that the existing "Clear" button at `filter_companies.yaml:29-41` runs `Reset` then `actions/search.yaml`. `Reset` clears state, but the _cached request result_ of `get_descendant_company_ids` may still hold the previously-resolved descendant ids. The next `get_all_companies` fire reads `_request: get_descendant_company_ids.0.ids` — which could be stale.

The task says "verify when implementing" but doesn't propose a fix. The fix is straightforward: extend the Clear button's `onClick` action chain to re-fire `get_descendant_company_ids` after `Reset` and before `actions/search.yaml`, similar to how the new selector's `onChange` chain works.

**Fix:** make the fix explicit in task 10. Add a numbered step to the Clear button's `onClick`:

```yaml
onClick:
  _build.array.concat:
    - - id: reset
        type: Reset
    - _build.if:
        test: { _module.var: hierarchy.enabled }
        then:
          - id: re_resolve_descendants
            type: Request
            params: get_descendant_company_ids
        else: []
    - _ref: actions/search.yaml
```

## Low

### 11. `parent_selector.yaml` `requests:` block + page-level `requests:` block — possible duplicate registration

> **Resolved.** Updated `tasks/07-edit-form-wiring.md` step 4 to drop the page-level `get_companies_for_selector.yaml` registration. The page only adds `get_descendant_company_ids.yaml` to its `requests:` list; the selector's options request stays declared inside `parent_selector.yaml` (per task 6), matching the convention `company-selector.yaml` already uses today.

Task 6 puts `requests: [_ref: requests/get_companies_for_selector.yaml]` inside `parent_selector.yaml`. Task 7 then says to also add `get_companies_for_selector.yaml` to the _page's_ `requests:` list. Lowdefy's request resolution may dedupe these, or it may complain about duplicate IDs. No precedent in the repo combines a component's own `requests:` block with the page's — `company-selector.yaml` (the existing) declares its own `requests:`, and the pages that use it via `_ref` _don't_ re-declare the request at page level.

**Fix:** drop the page-level `get_companies_for_selector.yaml` registration in task 7's edit-page changes. Let `parent_selector.yaml`'s own `requests:` block carry the registration, matching how `company-selector.yaml` already works elsewhere.

### 12. `state.parent_ids` write race between `set_state` and form auto-bind (probably benign)

> **Resolved.** Added a one-line note to `tasks/07-edit-form-wiring.md`'s "Notes" section acknowledging the dual-writer pattern (form auto-bind + `set_state`) and confirming that `set_state` runs strictly before the user can interact with the rendered form, so the race is benign. Flagged so the dual-writer pattern doesn't surprise a future reader.

`state.parent_ids` is written by `set_state` (post-fetch, copying from doc) and by the form's auto-bound input (per project rule "Input block IDs match data paths"). On the edit page, both target the same path. `set_state` runs in the page's `onMount` before the user can interact, so there's no real race — but the dual-writer pattern is unusual.

**Fix:** none required, but worth a one-line note in task 7 acknowledging both writers and confirming `set_state` runs strictly before user interaction is possible.

### 13. Atlas Search no-op filter cleanup is hypothetically blocking for task 10

> **Resolved.** Added a "Pre-condition" subsection to `tasks/10-list-filter.md`'s Context block. It explains the no-op `mustNot exists path: removed.timestamp` clause, recommends replacing it with `mustNot: [{ equals: { path: 'removed', value: true } }]` in both `get_all_companies.yaml` and `get_company_excel_data.yaml`, and notes that it only matters once any company has `removed: true` (verifiable via a quick MongoDB query). Implementer can decide whether to bundle the fix into this task or file a separate issue.

The design's "Related cleanup" section flags that `get_all_companies.yaml`'s Atlas Search `mustNot exists path: removed.timestamp` clause is a no-op (since `removed` is boolean, not an object). Today this is harmless — no `delete-company` API exists. But task 10's list filter would surface soft-deleted companies under a hierarchy filter the moment a company gets soft-deleted (by hand or by a future delete API).

The cleanup is explicitly out of scope for this design, but the dependency is real: enabling the list filter on a database with soft-deleted companies will leak them. Worth either fixing the no-op filter as part of task 10 (small bug fix, matches spirit) or making the dependency explicit so a follow-up issue is filed.

**Fix:** add a "Pre-condition" note to task 10 stating: "If your deployment has any companies with `removed: true`, fix the Atlas Search `mustNot` clause first — replace `mustNot: [{ exists: { path: 'removed.timestamp' } }]` with `mustNot: [{ equals: { path: 'removed', value: true } }]` in `get_all_companies.yaml` and `get_company_excel_data.yaml`." Implementer can decide whether to bundle the fix or file a separate issue.

### 14. Task 9 List `itemTemplate` exposes iterated item — verify the access pattern

> **Resolved.** Folded into finding #8's resolution. Task 9's tile sketch no longer uses `List` + `itemTemplate` — it uses `Html` + `_nunjucks` template, matching the existing `tile_contacts.yaml` / `contact_list_items.yaml` precedent. Per-item access happens in Nunjucks `{% for %}` loops, where the iterated row is a plain object accessed as `parent[name_field]` or `child.display_name`. The "how does Lowdefy expose iterated items in itemTemplate" question doesn't apply to this design.

Task 9 (B) sketches a `List` block with `itemTemplate: { type: Link, ... }` but doesn't show how the template accesses the iterated row's `_id` or name field. Lowdefy's `List` block exposes the current item via a specific operator (probably `_state` scoped to the item, or a `_function`-style accessor). No precedent in the repo for `List + itemTemplate` access patterns visible from a quick scan.

**Fix:** task 9 should look at how `tile_contacts.yaml` (or another sidebar tile) renders an array of clickable items and concretise the per-item state access in the sketch. Without this, the implementer hits the question first thing.

## Sanity checks (no action needed)

- `_build.object.assign` operator confirmed in use at `modules/layout/components/page.yaml:24` and `:131`. ✓
- `_build.if` extensively used across `modules/layout/`, `modules/contacts/`, `modules/companies/`. ✓
- Companies collection literal name is `companies` (`modules/companies/connections/companies-collection.yaml:6`). ✓
- Direction of graph traversal is consistent: `get_descendant_company_ids` walks DOWN (`_id` → `parent_ids`), cycle check walks UP (`parent_ids` → `_id`). The two graphLookups in different files use opposite `connectFromField`/`connectToField` swaps, both correct. ✓
- Soft-delete filtering: `removed: { $ne: true }` used in display queries (parents `$lookup`, children query, descendants `$match`); `$graphLookup` traversal explicitly does NOT restrict — consistent with the design's "filter mismatch is cosmetic, cycle prevention is load-bearing" stance. ✓
- Task ordering: dependency arrows in `tasks.md` are correct (verified by walking the dependency graph manually). ✓

# Review 1 — Implementability and codebase fit

Focus: does the design's prescription survive contact with the actual `companies` module — Atlas Search, the existing selector, the soft-delete idiom, and Lowdefy's API DSL?

## Critical

### 1. UI cycle prevention contradicts what the user asked for

> **Resolved.** Switched from `$nin` exclusion to disable-with-label per the user's original "disable option on UI (with label so user knows why)" intent. Selector request now projects a per-row `disabled` field via `$cond: { $in: ["$_id", cycle_check_ids] }` and suffixes `" (would create cycle)"` to the label for matching rows. Selector's `optionConfig` gains `disabledField: disabled`. The var is renamed `cycle_check_ids` (not `exclude_ids`) to reflect the new semantics. Solution-at-a-glance #3 and #6, the Cycle-prevention key decision, the Edit-form architecture section, and the company-selector files-changed entry all updated.

In the answers gathered during the design phase the user picked "Prevent on API **and disable option on UI** (with label so user knows why)". The current design implements that as `$nin` exclusion in the selector's request — i.e., descendants are _hidden_ from the dropdown, not greyed out with an explanation.

- **Solution at a glance #6** (lines ~25): "the UI selector additionally hides descendants of self so the user cannot pick them in the first place."
- **Architecture / Edit form** (lines ~190–197): "The selector's request adds `$match: { _id: { $nin: exclude_ids } }`."

These two are coherent with each other, but neither matches the user's "disable with label" intent. The implementation difference is non-trivial: instead of `$nin`, the projection in `modules/companies/requests/get_companies_for_selector.yaml:10-19` would need to add a `disabled: true` field and a modified `label` (e.g. `"{name} (would create cycle)"`) for descendants of `_state._id`. The selector block's `optionConfig` (already configured at `modules/companies/components/company-selector.yaml:29-31`) would also need to pass `disabledField: disabled` so the Selector renders them disabled.

**Fix:** swap the `$nin` approach for a per-row `$cond` that sets `disabled: true` and rewrites `label` for descendants. Update the relevant prose in Solution-at-a-glance #6 and the Edit-form architecture section to describe disable-with-label, not hide. (Or — confirm with the user whether they're happy with hide instead, since hide is materially simpler.)

### 2. List filter's `$graphLookup` placement is unspecified and non-trivial inside Atlas Search

> **Resolved.** Picked option (A): pre-resolve descendants in a separate request and feed the resulting id list into the existing Atlas Search `compound.must` array via an `in: { path: "_id", value: ... }` clause. Architecture / List page rewritten with concrete YAML showing the new `get_descendant_company_ids` request, the selector-onChange chain (`Request → search action`), and the conditional Atlas Search `must` clause. Consolidated the edit-form and list-page descendant fetches into a single shared request that returns `{ ids: [root, ...descendants] }` — the edit form uses it with `root_id: _state._id`, the list page with `root_id: _state.filter.parent_scope`. Flagged as the lowest-priority piece of the design — implement after edit form, view page, and API cycle check.

The list page aggregation at `modules/companies/requests/get_all_companies.yaml:13-50` uses **Atlas Search** (`$search`) as its first stage. `$graphLookup` cannot be nested inside a `$search` stage. The design (Architecture / List page) says simply "the list aggregation gains a conditional stage … `$graphLookup` from the picked id … then `$match`", but doesn't pick a placement that's actually compatible with the existing pipeline.

Two viable placements, neither in the design:

- **Pre-resolve descendants in a separate request** keyed off `state.filter.parent_scope` (similar to how the selector's options are pre-fetched). Pass the resulting array as `_payload: filter.parent_scope_ids` and add a `must: [{ in: { path: "_id", value: <ids> } }]` clause to the existing Atlas Search compound filter. This keeps Atlas Search authoritative for filtering and pagination.
- **Place `$graphLookup` + `$match` after `$search` but before `$facet`** so pagination counts in `$facet.count` reflect the hierarchy filter. This is simpler to wire but takes hierarchy filtering out of the search index, meaning it runs on the result set rather than the index — fine for typical sizes, slow if the search returns many rows.

**Fix:** pick one placement and update the Architecture / List page section to show where the new stages slot in. Pre-resolution is the cleaner story given Atlas Search is already the existing list query's main stage.

### 3. Soft-delete filter idiom — design picks a non-existent shape

> **Resolved.** Repo-wide audit confirmed `removed` is a boolean (`null` on insert, `true` on soft-delete) — see `modules/files/api/delete-file.yaml:14`. The design's `get_company_children` `$match` is now `removed: { $ne: true }` to match the prevailing query idiom in `companies` / `contacts` / `files`. New "Removed parents leave dangling references" decision documents the boolean idiom and source files. Part B: `$graphLookup` runs without `restrictSearchWithMatch` — soft-deleted intermediates are still traversed. New "Related cleanup" section in the design lists pre-existing bugs found in the audit: `get_all_companies.yaml` and `get_company_excel_data.yaml` use a no-op Atlas Search `mustNot exists path: removed.timestamp` clause that never matches (since `removed` is boolean, not an object); `user-admin/requests/get_all_users.yaml:95` and `get_user_excel_data.yaml:97` use literal `removed: null` matches that are narrower than the `$ne: true` idiom.

The design's children-tile request says: `$match: { parent_ids: <self._id>, removed: null }` (Architecture / View page item 3, lines ~199–203). Two problems:

- **`removed: null` doesn't match the codebase idiom.** The existing module uses `removed: { $ne: true }` (`modules/companies/requests/get_company.yaml:13`, `modules/companies/requests/get_companies_for_selector.yaml:8`) for non-Atlas-Search queries, and `mustNot exists path: removed.timestamp` (`modules/companies/requests/get_all_companies.yaml:21`, `get_company_excel_data.yaml:23`) for Atlas Search. New requests added by this design should pick the `removed: { $ne: true }` form to stay consistent with the other plain-aggregation requests (`get_company`, `get_companies_for_selector`).
- **`$graphLookup` traversal of soft-deleted nodes is undecided.** The "Removed parents leave dangling references" decision says we don't rewrite child arrays on soft-delete, which is fine for the data integrity story. But should the cycle check / list-filter `$graphLookup` walk _through_ a soft-deleted node? If a deleted intermediate company sits between a root and its descendants, do those descendants count as "under" the root for filtering? Two options: either pass `restrictSearchWithMatch: { 'removed.timestamp': { $exists: false } }` to `$graphLookup` (descendants of a soft-deleted parent are unreachable via this path), or don't (the graph stays connected through soft-deleted nodes). Both are defensible; the design needs to pick.

**Fix:** in Schema / Architecture, replace `removed: null` with `removed: { $ne: true }` for `get_company_children` and `get_company_descendant_ids`, and add a one-liner deciding whether `$graphLookup` traversal restricts to non-removed nodes (recommended: yes — `restrictSearchWithMatch: { 'removed.timestamp': { $exists: false } }` so a soft-deleted intermediate hides its subtree from filters).

### 4. API "abort and return error" mechanism unspecified

> **Resolved.** Added a "Cycle-check step layout (`update-company`)" subsection under Architecture / API showing the concrete pattern: a `MongoDBAggregation` step `cycle_check` that projects a single boolean `has_cycle`, an early `:return: { error: would_create_cycle }` step gated by `skip: { _ne: [_step.cycle_check.0.has_cycle, true] }`, and a defensive `skip: { _eq: [_step.cycle_check.0.has_cycle, true] }` on every subsequent step (belt-and-braces). All four cycle-related additions are `_build.if`-injected at build time only when `hierarchy.enabled: true`. References the precedent at `create-company.yaml:135-137` and `files/api/delete-file.yaml:22-24`.

Architecture / API (lines ~215–224) says "If `<payload._id>` (self) appears in the resulting ancestor chain, the API returns an error and the update is aborted before the `$set` stage." Lowdefy's API routine DSL doesn't have a "throw" step. The established pattern in this module is the `:return:` step (see the bottom of `modules/companies/api/create-company.yaml:135-137` and `update-company.yaml:145-146`), combined with `skip:` properties on subsequent steps to short-circuit them.

The cycle-check has to be expressible as the existing primitives, roughly:

1. `MongoDBAggregation` step `cycle_check` running the `$graphLookup` and projecting `{ has_cycle: <bool> }`.
2. Every subsequent step (the `$set` update, contact reconciliation, event write, `:return: success`) gains `skip: { _eq: [_step.cycle_check.0.has_cycle, true] }` (or equivalent path).
3. A new `:return: { error: "would_create_cycle" }` step before the rest, with the inverse `skip`.

This mechanic is non-trivial enough to be worth showing in the design (or at least acknowledging with a pointer to `:return:`/`skip:`) so the implementation step doesn't have to invent it. Otherwise the developer reading this design will hit the question and have to bounce.

**Fix:** add a short subsection under Architecture / API showing the step layout for the cycle check, explicitly using `MongoDBAggregation` + `skip:` + `:return:` patterns.

### 5. Selector reactivity: `exclude_ids` resolution timing on the edit page

> **Resolved.** Picked option (a) — chain on the page's onMount. The edit page's `onMount` is now a two-step sequence: step 1 fires `get_company`, `get_company_contact_ids`, `get_descendant_company_ids` in parallel; step 2 fires `get_companies_for_selector` after step 1 completes (Lowdefy actions are sequential by default). The `parent_selector` wrapper has no own `onMount` — the existing `company-selector.yaml:11-15` self-fetch is replaced for parent-selector use only, leaving the original component unchanged for other consumers. Concrete YAML for the two-step onMount added to the Architecture / Edit form section. No first-render flash.

Architecture / Edit form (lines ~190–197) says: pass `[<self._id>, ...descendant_ids]` to the parent-selector as `exclude_ids` (a `_var`), and the selector's request adds `$match: { _id: { $nin: exclude_ids } }`.

Two coordination problems with that as written:

- **Resolution timing.** `_var` is resolved at build time / `_ref` time, not at run time. To pass run-time data (the result of `get_company_descendant_ids`) into the selector's request, the value has to flow through `payload`, not `vars`. The existing selector at `modules/companies/components/company-selector.yaml:1-32` doesn't take a payload — its request `get_companies_for_selector` at `requests/get_companies_for_selector.yaml:1-22` has no `payload:` block. Adding `exclude_ids` therefore requires plumbing payload through both the selector wrapper and its request.
- **Re-fetch trigger.** The selector at `company-selector.yaml:11-15` fetches its options once on `onMount`. The edit page's `onMount` (at `pages/edit.yaml:27-32`) fires `get_company` and `get_company_contact_ids` in parallel — a `get_company_descendant_ids` would join that batch. The selector's `onMount` runs concurrently with the page's onMount, so the selector may fetch options before descendants are available, leaving `exclude_ids` empty on first render. Self could briefly appear as a valid parent.

**Fix:** add `payload: { exclude_ids: _state.exclude_ids }` (or similar state path) to a refactored selector request, and either (a) chain the descendants fetch ahead of the selector's fetch on the edit page (move `fetch_companies` from `onMount` of the selector to the page's `onMount` after descendants are set), or (b) accept the brief race and set `exclude_ids` on `onInit` if it can be resolved synchronously. Worth a sentence in the design.

## Medium

### 6. Parent display "on the view header (or top-of-main slot)" is ambiguous and one of those isn't possible

> **Resolved.** Dropped the "view header" placement entirely. Parents and children now share a **single combined sidebar tile**, `tile_hierarchy`, with two stacked sections (Parents above, Children below). Each section has its own heading from `hierarchy.parent_label` / `hierarchy.children_label` (with the `_string.concat` fallbacks already in place), its own request, and its own empty-state. When both sections are empty the whole tile hides. Solution-at-a-glance #4, Architecture / View page, and the Files-changed list all updated. The previously-listed `tile_children.yaml` is replaced by `tile_hierarchy.yaml`. Forward-looking note added: a future iteration can swap the inner flat lists for a TreeSelector-style nested view without changing the surrounding contract or the request shapes. The sidebar wiring (build-gated `_ref` to `tile_hierarchy.yaml`) lives on `pages/view.yaml`'s sidebar `blocks` array; `view_company.yaml` is unchanged.

Solution at a glance #4 and Architecture / View page item 2 say "view header (or a top-of-main slot) renders 'Parents: name1, name2, …'". The actual page header for `view.yaml` is set via the **layout** module's `page` component — see `modules/companies/pages/view.yaml:6-14`, where `title:` is a single Nunjucks string. There's no slot under the header for a parents line; the breadcrumb area is also rigid.

The realistic placement is **inside `view_company.yaml`** as a new block at the top, ahead of `view_core` (`modules/companies/components/view_company.yaml:5-13`). Or — given the children tile is a sidebar tile, parents could plausibly mirror as a sidebar tile too, for visual symmetry.

**Fix:** drop the "view header" option and commit to one of: (a) top-of-main block inside `view_company.yaml`, (b) sidebar tile alongside `tile_children`. Recommend (b) — keeps the view body focused on company data and groups the hierarchy navigation in the sidebar.

### 7. `hierarchy.show_in_table` mention contradicts the "no built-in column" decision

> **Resolved.** Shortened the namespace example to `hierarchy.parent_label`, `hierarchy.children_label`, … and removed the misleading `hierarchy.show_in_table` reference.

The "Opt-in via a single `hierarchy.enabled` flag" decision (lines ~59–74) lists `hierarchy.show_in_table` as a future namespace member: "future hierarchy-specific options (`hierarchy.parent_label`, `hierarchy.children_label`, `hierarchy.show_in_table`) can join it without polluting the top-level var space". But a later decision says no built-in parent column — apps add it themselves via `components.table_columns`. So `hierarchy.show_in_table` would never exist; the example is misleading.

**Fix:** swap the example for a real candidate, e.g. `hierarchy.restrict_traversal_on_removed` (whichever soft-delete decision lands from finding 3), or just shorten the list to `parent_label`, `children_label`.

## Low

### 8. Edit page should batch `get_company_descendant_ids` with the existing mount fetch

> **Resolved.** Architecture / Edit form item 1 now states the fetch joins the existing `params: [get_company, get_company_contact_ids]` batch.

Architecture / Edit form item 1 says "On page mount, fetch the current doc's descendant ids …". The existing `pages/edit.yaml:27-32` already batches `get_company` and `get_company_contact_ids` in a single `Request` action. The descendants request should follow the same precedent — added to the same `params: [...]` array — rather than firing as a separate action. Worth one sentence to make this concrete.

### 9. View-page `$lookup` projection shape not specified

> **Resolved.** Architecture / View page item 1 now spells out the projected shape `parents: [{ _id, <name_field>: <name> }, ...]` and notes the view block reads names via `_module.var: name_field`.

Architecture / View page item 1 says `get_company` gains a `$lookup` on `parent_ids` "that returns each parent's `_id` and `name_field`". Multikey local-field `$lookup` produces an array of foreign docs, so the resulting projected shape is `parents: [{ _id, <name_field> }]`. Worth spelling out in the design so the view-block consumer knows what to bind to (especially given `name_field` is a var, not a literal key — the rendering side has to use `_module.var: name_field` or similar to read it).

## Sanity checks (no action needed)

- `MongoDBInsertConsecutiveId.insertedId` referenced throughout `create-company.yaml` confirms `_id` is the `C-0001`-form string the design assumes for `parent_ids: string[]`. ✓
- Multikey `$match: { parent_ids: <id> }` works as the design claims — same shape used at `modules/companies/requests/get_company_contacts.yaml:12-14` for `global_attributes.company_ids`. ✓
- `_build.if`-gated emission of API steps confirmed at `modules/companies/api/create-company.yaml:50-68` — the design's "build-gated when `hierarchy.enabled: false`" pattern is supported. ✓

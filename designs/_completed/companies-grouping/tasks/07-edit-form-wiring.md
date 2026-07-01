# Task 7: Wire parent selector into form, three-step `onMount` on edit page

## Context

This task connects the pieces from tasks 1, 2, 5, and 6 into the edit-page flow:

1. The edit form (`form_company.yaml`) appends a "Parents" section with the new `parent_selector.yaml` block, build-gated on `hierarchy.enabled`.
2. The edit page (`pages/edit.yaml`) `onMount` becomes a **three-step sequence** so the parent-selector's options request fires _after_ the descendants are resolved _and_ the resulting id list is written to state. This avoids a first-render flash where self briefly appears as a valid parent.
3. The page's `onMount.set_state` action is extended to populate `state.cycle_check_self_id` (self — filtered out of the options) and `state.cycle_check_ids` (descendants — disabled with the "(child of this company)" suffix) from the descendants result, plus `state.parent_ids` from the loaded doc (so the form pre-populates).
4. The `update_company` button's payload is extended to include `parent_ids: _state.parent_ids` (build-gated).
5. The `new.yaml` page mirrors the same form additions but without the descendants fetch (no self, no descendants).

The three-step `onMount` shape:

```yaml
onMount:
  - id: fetch_doc_data
    type: Request
    params:
      - get_company
      - get_company_contact_ids
      - get_descendant_company_ids   # parallel with the others; payload root_id: _state._id
  - id: fetch_selector_options       # runs after step 1 — Lowdefy actions sequential by default
    type: Request
    params: get_companies_for_selector
  - id: redirect_if_not_found        # existing — moves to be after step 2 or stays at top
    ...
  - id: set_state                    # existing — extended to set parent_ids, cycle_check_self_id, and cycle_check_ids
    ...
```

The selector's underlying request reads `_state: cycle_check_self_id` and `_state: cycle_check_ids` (per task 5), so `set_state` must write both paths _before_ `fetch_selector_options` reads them. This means the order is:

1. Run `fetch_doc_data` (parallel: doc + contacts + descendants).
2. Run `set_state` to copy `state._id → state.cycle_check_self_id` (so the request `$match`-excludes self), the descendants result → `state.cycle_check_ids` (so descendants are disabled with the suffix), and the doc fields → `state.parent_ids` etc.
3. Run `fetch_selector_options` so the request payload sees the new state.

This three-step ordering matches the design's Architecture / Edit form section.

## Task

### A. `modules/companies/components/form_company.yaml` — append parent section

Append a new `_build.if`-gated section to the existing `_build.array.concat` block, mirroring the pattern of the existing sections (`fields.registration`, `fields.contact`, etc. all wrap in `_build.if` on array length). Sketch:

```yaml
# Append AFTER the "Linked contacts" section that's currently the last entry:
- _build.if:
    test:
      _module.var: hierarchy.enabled
    then:
      _build.array.concat:
        - - id: divider_parents
            type: Divider
            properties:
              title:
                _if_none:
                  - _module.var: hierarchy.parent_label
                  - _string.concat:
                      - "Parent "
                      - _module.var: label_plural
        - - _ref: components/parent_selector.yaml
    else: []
```

### B. `modules/companies/pages/edit.yaml` — three-step onMount + extended set_state + extended update payload

1. **Add `get_descendant_company_ids` to the existing `fetch` action's `params`** (build-gated):

   ```yaml
   - id: fetch
     type: Request
     params:
       _build.array.concat:
         - - get_company
           - get_company_contact_ids
         - _build.if:
             test:
               _module.var: hierarchy.enabled
             then:
               - get_descendant_company_ids
             else: []
   ```

   `get_descendant_company_ids.yaml` (from task 2) already uses the `_if_none: [_state.filter.parent_scope, _state._id]` fallback pattern, so the edit-page invocation works without modification — `state._id` is the doc id (set by the existing edit page on `onMount.set_state`), `state.filter.parent_scope` is undefined here, the fallback picks `_id`. No request-file changes needed in this task.

2. **Add a new build-gated `set_state` block that copies self → `cycle_check_self_id`, descendants → `cycle_check_ids`, and parent_ids → `state.parent_ids`.** The existing `set_state` action already writes scalar fields from the doc — extend it:

   ```yaml
   - id: set_state
     type: SetState
     params:
       _build.object.assign:
         - _id:
             _request: get_company.0._id
           name:
             _request: get_company.0.name
           description:
             _request: get_company.0.description
           contact:
             _request: get_company.0.contact
           address:
             _request: get_company.0.address
           registration:
             _request: get_company.0.registration
           attributes:
             _request: get_company.0.attributes
           contacts:
             _array.map: ... # existing
           updated:
             _request: get_company.0.updated
         - _build.if:
             test:
               _module.var: hierarchy.enabled
             then:
               parent_ids:
                 _if_none:
                   - _request: get_company.0.parent_ids
                   - []
               cycle_check_self_id:
                 _request: get_company.0._id
               cycle_check_ids:
                 _if_none:
                   - _request: get_descendant_company_ids.0.ids
                   - []
             else: {}
   ```

3. **Add a new `fetch_selector_options` action AFTER `set_state`** (build-gated):

   ```yaml
   - _build.if:
       test:
         _module.var: hierarchy.enabled
       then:
         - id: fetch_selector_options
           type: Request
           params: get_companies_for_selector
       else: []
   ```

   The action sits in the `onMount` array, after `set_state`. Lowdefy actions in an array run sequentially by default, so `fetch_selector_options` waits for `set_state` to complete before firing.

4. **Add `get_descendant_company_ids.yaml` to the page's `requests:` list** (build-gated):

   The existing `requests:` block currently lists `get_company.yaml` and `get_company_contact_ids.yaml`. Add only `get_descendant_company_ids.yaml`. Do **not** add `get_companies_for_selector.yaml` at the page level — it's already registered inside `parent_selector.yaml`'s own `requests:` block (per task 6), matching the convention `company-selector.yaml` already uses today (its `requests:` block is the single declaration; consuming pages don't re-declare).

5. **Extend the `update_company` button's payload** with build-gated `parent_ids`:

   ```yaml
   payload:
     _build.object.assign:
       - _id:
           _state: _id
         name:
           _state: name
         # ...other existing fields...
         updated:
           _state: updated
       - _build.if:
           test:
             _module.var: hierarchy.enabled
           then:
             parent_ids:
               _if_none:
                 - _state: parent_ids
                 - []
           else: {}
   ```

### C. `modules/companies/pages/new.yaml` — mirror form additions, no descendants fetch

1. Form section additions: same as edit (`form_company.yaml` is shared between both pages, so this happens automatically when (A) lands).
2. **No descendants fetch** — on the new page, no doc exists yet, so `cycle_check_self_id` is `null` and `cycle_check_ids` is `[]`. Either:
   - Skip the descendants fetch entirely on `new.yaml`. The selector's `_if_none` defaults handle both missing states.
   - Or set them explicitly on `onInit` for clarity.

   The simpler path: **skip the fetch**. Verify that `get_companies_for_selector` runs correctly: `$match: { _id: { $ne: null } }` passes every doc, every `disabled` resolves to `false`, every label is plain.

3. **Extend the create payload** to include `parent_ids: _state.parent_ids` build-gated, mirroring (B.5).

## Acceptance Criteria

- When `hierarchy.enabled: false`:
  - `form_company.yaml` build output has no parents section / divider / selector.
  - `pages/edit.yaml` `onMount` is identical to today (no descendants fetch, no fetch_selector_options, no parent_ids in set_state).
  - `pages/new.yaml` payload is identical to today.
- When `hierarchy.enabled: true`:
  - The edit form has a "Parent Companies" divider + the multi-select block as the last section before the linked-contacts section.
  - The edit page's `onMount` runs in this effective order: `fetch` (doc + contacts + descendants in parallel) → `redirect_if_not_found` (existing) → `set_state` (with `parent_ids`, `cycle_check_self_id`, `cycle_check_ids`) → `fetch_selector_options`.
  - The selector excludes self entirely and renders descendants disabled with `(child of this company)` suffix on first render (no flash).
  - Submitting the form sends `parent_ids` in the API payload.
  - The new-company page renders the parent multi-select, no descendants fetch, all options enabled.
- Manual verification: edit a company with one descendant. Confirm self and the descendant are greyed out in the parent picker; other companies are enabled. Save with a new parent — verify update succeeds and `parent_ids` updates. Try to set the descendant as parent — UI prevents selection; if forced via direct API call, the cycle check from task 4 rejects.

## Files

- `modules/companies/components/form_company.yaml` — modify — append build-gated parent section.
- `modules/companies/pages/edit.yaml` — modify — extended `onMount` (descendants in fetch batch, parent_ids/cycle_check_self_id/cycle_check_ids in set_state, fetch_selector_options after set_state); extended `requests:` list; extended `update_company` payload.
- `modules/companies/pages/new.yaml` — modify — extended `update_company`/`create_company` action payload (parent_ids build-gated). Form section appears automatically via the shared `form_company.yaml`.

## Notes

- **Two consumers, one request, two state paths.** The descendants request is shared between this task (edit form) and task 10 (list filter). The fallback chain `state.filter.parent_scope → state._id` lets one request file serve both surfaces without per-invocation payload overrides.
- **State path collision (benign).** `state.parent_ids` is the form's input field (auto-bound by `parent_selector.yaml`'s `id: parent_ids` per project rules) AND what `set_state` writes from the loaded doc. Both write to the same path, which is intentional — the doc populates the form, the form sends back the (potentially modified) value. The race between `set_state` (post-fetch) and the form's auto-bind is benign because `set_state` runs in the page's `onMount` strictly before the user can interact with the rendered form. No additional guard needed; flagged here so the dual-writer pattern doesn't surprise a reader.
- **Why `_build.object.assign` for payloads.** Same pattern as task 3 / task 4 — keeps the existing payload literal intact and merges the build-gated fragment in. Apps with `hierarchy.enabled: false` see byte-identical payloads.
- **Edit form testing.** This is the first end-to-end testable milestone. After this task, opening the edit page on a company with descendants should show the disable behaviour correctly without a flash.
- **`new.yaml` form section.** Adds via `form_company.yaml` (B applies to both pages since they both `_ref` the same form). No additional form changes needed in `new.yaml`.

# Task 8: Add `contact-selector.yaml.njk` wrapper; delete old wrapper and selector request

## Context

This is the final integration task. All earlier tasks have set up the pieces:

- Task 1 — `update-contact` / `create-contact` APIs accept the picker's payload shape.
- Task 2 — The `ContactSelector` block supports `allowVerify`.
- Task 3 — `get_contact` is a parameterised `MongoDBAggregation` with a `request_stages.get_contact` hook; consumers' existing `.0` reads continue to work.
- Task 4 — `search_contacts` and `get_contacts_data` requests exist and project the block's value shape.
- Task 5, 6 — `validate_email` helper and `form_contact_short` default form exist.
- Task 7 — Module manifest declares `verified`, `all_contacts`, `phone_label` vars.

This task swaps the `contact-selector` export target from the old `.yaml` (simple `Selector` dropdown) to a new `.yaml.njk` wrapper that renders `type: ContactSelector`, instance-scopes all three requests, wires the `onOpen` / `onAddContact` / `onEditContact` chains, and nests the default form via `form_blocks` default. Old files get deleted.

Reference: the reference implementation's `apps/shared/contacts/components/contacts_selector.yaml.njk` (242 lines) is the template. Adapt to this module's conventions — `_module.connectionId`, `_module.endpointId` (scoped `contacts/create-contact` / `contacts/update-contact`), `_module.var` for the three module-level vars.

Full variable list (design decision #3 tables):

- Per-call vars: `id` (required), `keyword`, `title`, `placeholder`, `label`, `required`, `validate`, `visible`, `layout`, `max`, `filter`, `payload`, `extra_options`, `default_company_ids`, `disable_new_contacts`, `disable_edit`, `onAddContact`, `form_blocks`, `form_required`.
- Module-level vars (read via `_module.var`): `verified`, `all_contacts`, `phone_label`.

## Task

**Create `modules/contacts/components/contact-selector.yaml.njk`.** Structure:

1. `id: {{ id }}`, `type: ContactSelector`.
2. `required`, `validate`, `visible`, `layout` — standard input-block props wired to `_var` with defaults. `validate` prepends a `_build.if`-gated required check when `_var: required` is true.
3. `requests:` — three `_ref` entries with instance-scoped `id` vars:
   - `_ref: { path: ../requests/search_contacts.yaml, vars: { id: {{ id | replace(".", "_") }}_contact_search, payload: { input: { _state: {{ id | replace(".", "_") }}_input, ~ignoreBuildChecks: true }, all_contacts: { _module.var: all_contacts }, filter: { _var: { key: filter, default: [] } }, phone_label: { _module.var: phone_label } } } }`
   - `_ref: { path: ../requests/get_contact.yaml, vars: { id: {{ id | replace(".", "_") }}_get_contact, user_id: { _state: {{ id | replace(".", "_") }}_contact_id, ~ignoreBuildChecks: true } } }`
   - `_ref: { path: ../requests/get_contacts_data.yaml, vars: { id: {{ id | replace(".", "_") }}_contacts_data, contact_ids: { _state: {{ id | replace(".", "_") }}_fetch_contacts, ~ignoreBuildChecks: true } } }`
4. `events.onOpen` — `_build.array.concat` of:
   - Optional `prefill_company` SetState gated on `_var: default_company_ids !== null` and on not-edit — matches the reference implementation pattern.
   - Any extra `onOpen` steps the consumer adds (leave this hook point, even if empty default).
5. `events.onAddContact` — `_build.array.concat` of:
   - `id: validate`, `type: Validate`, `params: { regex: '^{{ id | replace(".", "_") }}_contact\\.' }`.
   - `id: create_contact`, `type: CallAPI`, `params: { endpointId: contacts/create-contact, payload: { ...{ _state: {{ id | replace(".", "_") }}_contact }, ...{ _build.if: { test: { _build.ne: [{ _module.var: verified }, off] }, then: { global_attributes: { verified: { _build.eq: [{ _module.var: verified }, trusted] } } }, else: {} } } } }`. In plain terms: the payload is the current `{id}_contact` state; when the module-level `verified` is `trusted`, add `global_attributes.verified: true`; when `untrusted`, add `global_attributes.verified: false`; when `off`, omit the field entirely.
   - `id: append_contact`, `type: CallMethod`, `params: { blockId: {{ id }}, method: appendContact, args: [{ contact: { _state: {{ id | replace(".", "_") }}_contact }, contactId: { _actions: create_contact.response.response.contactId } }] }`.
   - Append consumer's `onAddContact` extra steps via `_var: { key: onAddContact, default: [] }`.
6. `events.onEditContact`:
   - `id: update_contact`, `type: CallAPI`, `params: { endpointId: contacts/update-contact, payload: { _id: { _state: {{ id | replace(".", "_") }}_contact._id }, profile: { _state: {{ id | replace(".", "_") }}_contact.profile }, ...verified conditional (same as above) } }`. Note: no `updated.timestamp` in the payload — Task 1 dropped that filter requirement.
7. `properties` — all feature parity with the reference implementation fields (see design decision #3 per-call table). Key ones:
   - `title`, `placeholder`, `label` — Nunjucks templates with `keyword` interpolation.
   - `allowNewContacts: _not: _var: disable_new_contacts`
   - `allowEdit: _not: _var: disable_edit`
   - `allowVerify: _build.eq: [_module.var: verified, trusted]`
   - `optionsLoading: _and: [_request_details: ..._contact_search.0.loading, ...empty-input guard]`
   - `options: _array.concat: [{ _request: {id}_contact_search }, { _var: { key: extra_options, default: [] } }]`
   - `data: _request: {id}_contacts_data`
   - `list.title`, `list.placeholder` — Nunjucks with `keyword`
   - `list.item: _var: { key: item, default: {} }`
   - `max: _var: max`
   - `searchContactsRequest`, `getContactRequest`, `getContactsDataRequest` — instance-scoped ids (strings).
8. `blocks:` — default form via `_var: { key: form_blocks, default: [ _ref: form_contact_short.yaml.njk with vars... ] }`. The `_ref` vars pass `key: {id}_contact`, `new_contact: _not: _state: {id}_edit`, `required: _var: form_required`, `get_contact: _request: {id}_get_contact`, `loading: _request_details: {id}_get_contact.0.loading`.

**Update `modules/contacts/module.lowdefy.yaml`.** Change the `components.contact-selector` entry's `_ref` from `components/contact-selector.yaml` → `components/contact-selector.yaml.njk`.

**Delete `modules/contacts/components/contact-selector.yaml`** — replaced by the new `.yaml.njk`.

**Delete `modules/contacts/requests/get_contacts_for_selector.yaml`** — replaced by `search_contacts.yaml` (Task 4).

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` succeeds.
- `grep -rn get_contacts_for_selector modules/contacts` returns no results.
- `grep -rn 'components/contact-selector\.yaml[^.]' modules/contacts` returns no results (the old path is gone; only `.yaml.njk` remains).
- Any existing consumer of `_ref: { module: contacts, component: contact-selector }` in the repo (check `apps/` and `modules/companies/`) still builds — the export id is unchanged.
- End-to-end smoke test against a consumer page: add a new contact via the picker → contact appears in the list with a valid `contact_id`; click Edit on the new row → modal opens pre-filled with the contact's profile (verifies Task 1 #2's fix reaches the wrapper); Remove works.
- When `_module.var: verified` is set to `trusted` in the app, unverified contacts show a Verify button (verifies Task 2's block change).
- When `_module.var: all_contacts: false` and the user has no `global_attributes.company_ids`, the search dropdown shows no options and does not 500 (verifies Task 4's guard).

## Files

- `modules/contacts/components/contact-selector.yaml.njk` — create
- `modules/contacts/module.lowdefy.yaml` — modify — swap the `components.contact-selector` `_ref` target
- `modules/contacts/components/contact-selector.yaml` — delete
- `modules/contacts/requests/get_contacts_for_selector.yaml` — delete

## Notes

- Use `_module.endpointId: create-contact` / `_module.endpointId: update-contact` operators to resolve the scoped endpoint ids inside a module-internal file. `contacts/create-contact` is what they resolve to at the app level, but inside the module file use `_module.endpointId`.
- `{{ id | replace(".", "_") }}` is applied everywhere state keys or request ids are constructed — dots in `id` (e.g. `edit.ticket.subscribers`) must become underscores for valid state paths. `blockId` (line 1) keeps the dots.
- `~ignoreBuildChecks: true` is required on every `_state: ...` reference to a key that the block creates at runtime (e.g. `{id}_input`, `{id}_contact_id`, `{id}_fetch_contacts`). Without it, the build fails with `[ConfigWarning] _state references "..." but no input block with id "..." exists`. The demo page (`922f388`) worked around this with an explicit page-level `onInit: SetState` — the `.yaml.njk` wrapper uses `~ignoreBuildChecks` instead, which is how the reference implementation does it.
- Test against one real consumer after this lands — e.g. if `modules/companies` has a page linking contacts via `contact-selector`, open it and verify search/add/edit/remove all work.
- The "two known block issues" noted in design Resolved questions #4 (empty-edit-modal, dropdown-closes-per-keystroke) should be re-verified during this task's end-to-end smoke test. If either recurs, file a block-level follow-up — not in this task's scope.

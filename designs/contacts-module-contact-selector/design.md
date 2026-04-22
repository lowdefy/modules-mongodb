# Contact Selector wiring in the contacts module

## Problem

The `ContactSelector` React block was migrated to Lowdefy v5 on this branch (`dfa11d5`) and proven against a hardcoded demo page (`922f388`). It does not yet live in the `contacts` module — the module still exports a simple `Selector`-backed `contact-selector` component.

Consumers importing `_ref: { module: contacts, component: contact-selector }` today get:

- no search-as-you-type against MongoDB (options are pre-loaded in full),
- no inline add or edit flow,
- no avatars / rich list with per-row remove,
- no company-scoped filtering, verification mode, or extra-options injection.

Those are the use cases the rich `ContactSelector` block was built for. The module needs to ship a wrapper that renders the rich picker with one `_ref` call per consumer, along with the three MongoDB requests the block's lifecycle hooks trigger. The existing wrapper, `get_contacts_for_selector.yaml` request, and any downstream coupling to them get replaced.

The reference wrapper lives in a separate reference implementation at `apps/shared/contacts/components/contacts_selector.yaml.njk` (242 lines). It has been in production there and exposes the knobs the module's consumers have asked for. This design ports the wrapper into the contacts module, adapts it to this module's conventions (module vars, `_module.*` operators, scoped endpoint IDs), and parameterises `get_contact` with a `request_stages` hook so consumers keep their existing `.0` reads while gaining an injection point for extra stages.

## Current state

- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/*` — the v5 block. Expects `searchContactsRequest`, `getContactRequest`, `getContactsDataRequest` request IDs on `properties`, and calls the block method `appendContact` from the consumer's `onAddContact` chain. Drives the modal via `content.content` / `content.footer` slots.
- `modules/contacts/components/contact-selector.yaml` — 33-line wrapper rendering `Selector` / `MultipleSelector`. Options come from a single `get_contacts_for_selector` pre-load.
- `modules/contacts/requests/get_contacts_for_selector.yaml` — one-shot projection of all active contacts. No search payload, no paging.
- `modules/contacts/requests/get_contact.yaml` — `MongoDBAggregation` on `_url_query: _id`. Used by `contact-detail.yaml`, `contact-edit.yaml`, `view_contact.yaml`, `get_contact_companies.yaml`. 18 callers read it as `get_contact.0.<path>`.
- `modules/contacts/api/{create,update}-contact.yaml` — already the right shape for the picker's add/edit hooks (payload: `{ email, profile, global_attributes, _id, updated }`). When the module is mounted under entry id `contacts`, the scoped endpoint IDs are `contacts/create-contact` and `contacts/update-contact` (verified from the built artifact).

## Goals

1. Replace the `contact-selector` export with a rich picker rendered by the `ContactSelector` block, under the same component id so existing consumers upgrade transparently.
2. Ship the three requests the block lifecycle needs, scoped per-instance so the same page can render multiple pickers side-by-side.
3. Ship a default modal form (`form_contact_short.yaml.njk`); consumers can replace it per-call via a `form_blocks` var on the wrapper.
4. Parameterise `get_contact` (the existing `MongoDBAggregation`) with `id` and `user_id` so the picker can reuse it with a state-driven id, and add a `request_stages.get_contact` module var for injectable downstream stages. No consumer updates — existing `.0` reads continue to work.

## Non-goals

- Rewriting the block itself (block lives in the plugin, already v5). _Exceptions: a narrow addition of `allowVerify` rendering to `ContactListItem.js` (see decision #7), and a one-line change in `setEditContact.js` to unwrap the aggregation array — see decision #4._
- Changing the `contacts` detail / edit / create page behaviour beyond the request-shape switch.
- Adding a new `contacts-add-contact` endpoint alias — consumers call `contacts/create-contact` directly.
- Fixing the two known issues flagged on the prior branch (empty-modal-on-new-contact, dropdown-closes-per-keystroke). Those live in the block and are tracked separately; the v5 migration appears to have resolved both (see Resolved questions #4).

## Key decisions

### 1. Wrapper is a `.yaml.njk`, not `.yaml`

The reference implementation is `.yaml.njk` because instance-scoped request IDs need string interpolation (`{{ id | replace(".", "_") }}_contact_search`). Plain YAML can't build these IDs at build time. CLAUDE.md codifies the rule: "Use `.yaml.njk` when vars need string interpolation in IDs or inline values".

### 2. Instance scoping via `{id}_*` state keys

Every piece of per-picker state is prefixed by the wrapper's `id` var: `{id}_contact`, `{id}_edit`, `{id}_contact_id`, `{id}_input`, `{id}_fetch_contacts`, and the block value itself under `{id}`. The three requests are `{id}_contact_search`, `{id}_get_contact`, `{id}_contacts_data`. This is what lets one page host multiple selectors (subscribers + site-POC + billing-contact) without collision.

Dots in `id` (e.g. `edit.ticket.subscribers`) are replaced with underscores to build valid state keys, matching the reference implementation pattern.

`keyword` is rendered into the wrapper's `title` / `placeholder` strings via Nunjucks (`{% if keyword != null %}{{ keyword }} details{% else %}Contact details{% endif %}`), not a Lowdefy operator — that's why the wrapper file is `.yaml.njk`.

### 3. Module vars — full feature parity with the reference implementation

All of the reference implementation's consumer-facing vars come across. Grouped:

| Var            | Type      | Default | Purpose                                                                                                                   |
| -------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `verified`     | `enum`    | `off`   | `off` \| `trusted` \| `untrusted`. Controls whether the picker writes `global_attributes.verified` and renders verify UI. |
| `all_contacts` | `boolean` | `false` | Search across all companies (else scope to `_user.global_attributes.company_ids`)                                         |
| `phone_label`  | `boolean` | `false` | Include phone numbers in the option label                                                                                 |

Per-call knobs (passed via `vars:` at the consumer):

| Var                                            | Type      | Default                                     | Purpose                                                                                                  |
| ---------------------------------------------- | --------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                           | `string`  | **required**                                | Unique per-page selector instance id                                                                     |
| `keyword`                                      | `string`  | `null`                                      | Displayed in titles/placeholders (e.g. "Subscribers details")                                            |
| `title` / `placeholder` / `label`              | as-is     | overridden per call                         | Standard block props                                                                                     |
| `required` / `validate` / `visible` / `layout` | as-is     | `false`/`[]`/`true`/`{ contentGutter: 12 }` | Standard input-block props                                                                               |
| `max`                                          | `number`  | `null`                                      | Hard cap on selections                                                                                   |
| `filter`                                       | `array`   | `[]`                                        | Extra Atlas `$search` compound.filter clauses                                                            |
| `payload`                                      | `object`  | `{}`                                        | Extra payload variables merged into the search request                                                   |
| `extra_options`                                | `array`   | `[]`                                        | Options appended to the search results (e.g. "all contacts from company X" shortcut)                     |
| `default_company_ids`                          | `any`     | `null`                                      | Prefills `{id}_contact.global_attributes.company_ids` on `onOpen` when adding a new contact              |
| `disable_new_contacts`                         | `boolean` | `false`                                     | Hides the "Add new contact" footer in the dropdown                                                       |
| `disable_edit`                                 | `boolean` | `true`                                      | Hides per-row edit buttons                                                                               |
| `onAddContact`                                 | `array`   | `[]`                                        | Extra actions appended after the default add-contact chain                                               |
| `form_blocks`                                  | `array`   | default form `_ref`                         | Override the modal form. Default renders `form_contact_short.yaml.njk` (first / last / email / phones)   |
| `form_required`                                | `object`  | `{}`                                        | `{ given_name, family_name, email, phones, company_ids }` — required flags forwarded to the default form |

The module-level `verified`, `all_contacts`, `phone_label` defaults are declared in `module.lowdefy.yaml`; everything else is per-call `_var`.

### 4. Parameterise `get_contact` as an aggregation with `request_stages.get_contact` hook

Today `requests/get_contact.yaml` is a `MongoDBAggregation` with `_url_query: _id`. It returns an array of one doc; 18 consumer reads already use `get_contact.0.<path>`. The picker needs the same lookup but keyed off a state value (`{id}_contact_id`).

Two options considered for the picker path:

- **Switch to MongoDBFindOne** — returns a single doc (no `.0`). Clean on the consumer side but loses the project/match stage-injection point that other module aggregation requests (`get_all_contacts`, `update-contact`, etc.) expose via `request_stages.*`.
- **Keep as MongoDBAggregation, parameterise** — consumers keep `.0` reads. Adopted. Reasoning: staying as an aggregation preserves future extensibility (apps that need to add `$lookup`, `$addFields`, or custom `$match` can inject stages without forking the request). Matches the convention of `get_all_contacts` and the `request_stages` pattern the module already uses.

```yaml
# modules/contacts/requests/get_contact.yaml  (after)
id:
  _var:
    key: id
    default: get_contact
type: MongoDBAggregation
connectionId:
  _module.connectionId: contacts-collection
payload:
  _id:
    _var:
      key: user_id
      default:
        _url_query: _id
properties:
  pipeline:
    _build.array.concat:
      - - $match:
            _id:
              _payload: _id
            hidden:
              $ne: true
        - $limit: 1
      - _module.var: request_stages.get_contact
```

Callers come in two flavours:

- **Default (`detail`/`edit`/`view_contact`)** — `_ref: requests/get_contact.yaml` with no vars. Default `id: get_contact`, default `user_id: { _url_query: _id }` — same URL-query-driven behaviour as today. Consumers' existing `get_contact.0.<path>` reads continue to work unchanged.
- **Picker** — `_ref: { path: requests/get_contact.yaml, vars: { id: {{ id }}_get_contact, user_id: { _state: {{ id }}_contact_id, ~ignoreBuildChecks: true } } }`. `_var` preserves the `_state` operator node as `user_id`'s value, and it resolves at request-execution time against page state.

Because the request returns an array, the block's `setEditContact.js` unwraps the first element when it materialises state:

```js
// plugins/.../ContactSelector/hooks/contactActions/setEditContact.js
[statePrefix("contact")]: { _request: `${getContactRequest}.0` },
```

This makes the block consistently expect aggregation responses from `getContactRequest` — no special-casing, no consumer burden.

`modules/contacts/pages/contact-edit.yaml:73` contains `- _ref: requests/get_contact.yaml` as a bare `requests:` entry. After parameterisation, this stays as-is — the request's default `id` evaluates to `get_contact`, so the page-local request name is unchanged.

A new module var `request_stages.get_contact` is declared alongside the existing `request_stages.{write, get_all_contacts, selector, filter_match}`.

### 5. Layered `search_contacts` pipeline — `$search` for ranking, `$match` for filtering

`search_contacts` splits the pipeline into two layers: Atlas `$search` for text ranking (`should` clauses only), and standard MongoDB `$match` for all structural filters. `returnStoredSource: true` on the `$search` stage materialises the stored fields into the search result so the subsequent `$match` can read them without a `$lookup`.

```yaml
pipeline:
  # Layer 1: rank — Atlas $search with storedSource so downstream stages see the fields.
  - $search:
      returnStoredSource: true
      compound:
        should:
          _if:
            test: { _eq: [{ _if_none: [{ _payload: input }, ""] }, ""] }
            then: []
            else:
              - text:
                  {
                    query: { _payload: input },
                    path: [profile.name, lowercase_email],
                  }
              - wildcard:
                  query: { _string.concat: ["*", { _payload: input }, "*"] }
                  path: [profile.name, lowercase_email]
                  allowAnalyzedField: true
  # Layer 2: filter — standard Mongo query, consumer-pluggable via `filter` var.
  - $match:
      _object.assign:
        - hidden: { $ne: true }
          disabled: { $ne: true }
        - _build.if:
            test: { _var: all_contacts }
            then: {}
            else:
              _build.if:
                test:
                  _gt:
                    - _array.length:
                        _if_none: [{ _user: global_attributes.company_ids }, []]
                    - 0
                then:
                  global_attributes.company_ids:
                    $in: { _user: global_attributes.company_ids }
                else: {}
        - _var: { key: filter, default: {} }
  # Layer 3: cap + project.
  - $limit: 10
  - $project: { ... }
```

Three benefits:

1. **Consumer `filter` var is standard Mongo.** Apps pass `filter: { status: 'active' }` (a `$match` expression), not Atlas `compound.filter` clauses. Familiar shape for anyone who's written MongoDB queries.
2. **Stored-source retrieval.** `returnStoredSource: true` makes `$search` output the stored fields (`profile`, `email`, `global_attributes`) so the subsequent `$match` sees them. The module's existing Atlas search index already uses this — `get_all_contacts` is the precedent.
3. **Graceful degradation.** An app without Atlas drops the `$search` stage; the remaining `$match` + `$project` pipeline works against any MongoDB. The picker loses text-ranking but still filters correctly — adequate for fallback use.

The empty-`company_ids` guard is preserved: the `$in` clause is conditionally added only when the user has at least one company_id. Without the guard, `$in: null` would silently return zero rows (not an error with `$match`, unlike Atlas's rejection in `compound.filter`), but omitting the clause is cleaner and matches the guard added on the abandoned prior branch (`4e072de`).

### 6. Replace, don't dual-ship

The export id `contact-selector` starts pointing at the new wrapper. The old `contact-selector.yaml` and `get_contacts_for_selector.yaml` are deleted. Consumers inside this repo:

- `apps/demo/pages/contact-selector-demo/*` — the standalone demo added in `922f388`. It stays as a standalone page for block-level testing (hardcoded `ContactSelector` block usage, not a consumer of the module component). No change.
- `modules/companies/*` — check for `contacts:contact-selector` references (expected: pages that link contacts to a company use this wrapper). Any consumer ends up using the rich picker automatically.

The prior branch's unresolved issues (empty edit-modal-for-new-contact, dropdown-closes-per-keystroke) **are not re-introduced by this wrapper** — they lived in the block code and appear to have been resolved during the v5 migration (not reproducible on the `922f388` demo page). Implementation will re-verify end-to-end once a real consumer page drives the picker.

### 7. `verified` is opt-in and tri-state

`verified` is an enum module var. Default is `off`, meaning the picker has no verification behaviour — no `global_attributes.verified` field is written and no verify UI appears. Apps that don't care about contact verification get the simplest possible picker.

When an app flips `verified` to a non-`off` mode, the picker writes to `global_attributes.verified` (not top-level `verified` as in the reference implementation, — this aligns with the module's existing convention of keeping app-specific trust/access flags under `global_attributes`).

| Mode        | On create         | On edit          | UI                                                                                         |
| ----------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `off`       | no field written  | no field written | Edit button only (no Verify)                                                               |
| `trusted`   | `verified: true`  | `verified: true` | Unverified rows render a Verify button in place of Edit; clicking it triggers update flow. |
| `untrusted` | `verified: false` | unchanged        | New contacts land unverified; apps provide their own verify flow (detail page, etc.)       |

The APIs (`create-contact`, `update-contact`) stay as-is — the selector's `onAddContact` / `onEditContact` chain is responsible for writing `global_attributes.verified` in the payload when the mode is not `off`. No API-level routine changes are needed.

Implementation:

- Wrapper conditionally includes `global_attributes.verified` in the create/update `payload` based on `_module.var: verified`.
- Wrapper passes `allowVerify: true` to the block when mode is `trusted`.
- **Block additions (in scope)**: `ContactListItem.js` gains an `allowVerify` prop; when `allowVerify && !contact.verified`, the Edit button is replaced with a Verify button (danger style, label "Verify", still triggers `editContact(contact)`). `ContactList.js` and `ContactSelector.js` forward the prop. `meta.js` adds `allowVerify` to documented properties.
- `search_contacts` and `get_contacts_data` project `verified: $global_attributes.verified` so the block-level contact objects carry the field at top level for list rendering (matches how the block already reads other contact fields at top level).

### 8. Form override via consumer-supplied `form_blocks`

The wrapper renders the modal form as a nested `blocks:` array defaulting to the shipped `form_contact_short.yaml.njk`. Consumers who need a different form pass their own `form_blocks` var:

```yaml
# components/contact-selector.yaml.njk — blocks section
blocks:
  _var:
    key: form_blocks
    default:
      - _ref:
          path: components/form_contact_short.yaml.njk
          vars:
            key: {{ id | replace(".", "_") }}_contact
            new_contact:
              _not:
                _state: {{ id | replace(".", "_") }}_edit
                ~ignoreBuildChecks: true
            required:
              _var:
                key: form_required
                default: {}
            get_contact:
              _request: {{ id | replace(".", "_") }}_get_contact
            loading:
              _request_details: {{ id | replace(".", "_") }}_get_contact.0.loading
```

Consumer overriding:

```yaml
_ref:
  module: contacts
  component: contact-selector
  vars:
    id: edit.ticket.subscribers
    form_blocks:
      - _ref:
          path: pages/tickets/components/custom_contact_form.yaml.njk
          vars: { ... } # consumer wires state keys using the same {id}_contact prefix
```

Trade-off considered: a per-module `form` var (one override for all pickers in the module) was rejected — the only proven way to express it would be passing a path through `_ref: { path: { _module.var: form } }`, which isn't a documented pattern. Per-call override is the mechanism Lowdefy's block slots already use, and matches the reference implementation's pattern of inlining the form at each call site.

The default `form_contact_short.yaml.njk` ships with the five fields from the reference implementation: `profile.given_name`, `profile.family_name`, `email`, `profile.work_phone`, `profile.mobile_phone`. `email` is locked once the contact exists (it's the dedup key; editing emails is a separate concern). `_ref: validate_email.yaml` is referenced via `../shared/...` — this module doesn't ship that file today, so the design bundles a local `validate_email.yaml` inside the contacts module.

An app that wants the same custom form on every picker page wraps the consumer call in its own shared component that passes `form_blocks` through. Acceptable ergonomics for the added simplicity.

### 9. Drop optimistic-concurrency check on `update-contact`

`modules/contacts/api/update-contact.yaml:13-14` currently filters MongoDBUpdateOne on `updated.timestamp` (last-write-wins guard). The picker's `onEditContact` can't reliably supply a timestamp — the block populates `{id}_contact` from `get_contact` when the user clicks edit, but by the time they save, the in-memory timestamp may be stale, and any mismatch makes the filter fail silently.

Rather than conditionally including the clause (what the reference implementation does), we remove the check entirely. The filter reduces to `{ _id, apps.{app_name}.is_user: { $ne: true } }`. The `is_user` guard still blocks updates against user-backed contact records; the concurrent-edit race is accepted.

Consequences:

- Two concurrent edits of the same contact: last write wins, no feedback. Acceptable for this module.
- Detail/edit page can drop the `updated.timestamp` from its own payload chain (simpler page YAML). Not required, just possible.
- `modules/contacts/api/update-contact.yaml` is modified (add to Files changed).

### 10. `create-contact` `upsertedId` fall-through

`modules/contacts/connections/contacts-collection.yaml:7-11` enables `changeLog`, which causes the community-plugin-mongodb to use `findOneAndUpdate` (returns `lastErrorObject.upserted`) instead of `updateOne` (returns `upsertedId`). The current `:return:` at `modules/contacts/api/create-contact.yaml:147-157` only reads `_step: insert.upsertedId`, which is `null` in this connection shape. The picker's `onAddContact` then appends a stub contact with `contactId: null`, and clicking Edit on that stub opens an empty modal.

Patch `:return:` to fall through both shapes:

```yaml
:return:
  contactId:
    _if_none:
      - _if:
          test: { _ne: [{ _step: check-existing }, null] }
          then: { _step: check-existing._id }
          else: { _step: insert.upsertedId }
      - _step: insert.lastErrorObject.upserted
  existing:
    _ne: [{ _step: check-existing }, null]
```

Adds `modules/contacts/api/create-contact.yaml` to Files changed.

## Files changed

**New**

- `modules/contacts/components/contact-selector.yaml.njk` — the wrapper
- `modules/contacts/components/form_contact_short.yaml.njk` — default form
- `modules/contacts/requests/search_contacts.yaml` — Atlas `$search` selector pipeline, projects `{ value: { contact_id, name, email, verified, picture }, label: html }`
- `modules/contacts/requests/get_contacts_data.yaml` — MongoDBAggregation that enriches selected + option contacts by id (projects `contact_id`/`name`/`email`/`verified`/`picture`) for the block's list rows
- `modules/contacts/validate/validate_email.yaml` — referenced by the default form

**Deleted**

- `modules/contacts/components/contact-selector.yaml` — replaced by `contact-selector.yaml.njk`
- `modules/contacts/requests/get_contacts_for_selector.yaml` — replaced by `search_contacts.yaml`

**Modified**

- `modules/contacts/module.lowdefy.yaml` — declare new module-level vars (`verified`, `all_contacts`, `phone_label`), add `request_stages.get_contact` to the existing `request_stages:` group, update `exports.components`, update the `components:` block to point at the new `.yaml.njk`, add the new requests/files to `validate:` / `requests:` lists as applicable
- `modules/contacts/requests/get_contact.yaml` — parameterise (id + user_id vars); stay MongoDBAggregation; add `request_stages.get_contact` concat point (see decision #4)
- `modules/contacts/api/update-contact.yaml` — drop the `updated.timestamp` filter clause (see decision #9)
- `modules/contacts/api/create-contact.yaml` — `:return: contactId` falls through `insert.upsertedId` → `insert.lastErrorObject.upserted` (see decision #10)
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` — add `allowVerify` prop; render Verify (danger) button in place of Edit for unverified rows
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactList.js` — forward `allowVerify` to `ContactListItem`
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.js` — pass `properties.allowVerify` down to `ContactList`
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/hooks/contactActions/setEditContact.js` — read first element via `` `${getContactRequest}.0` `` so the block handles aggregation responses (see decision #4)
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/meta.js` — document `allowVerify` in properties

Total: 5 new files, 2 deleted, 8 modified. Net delta is dominated by the new wrapper (~200 lines), the default form (~150 lines), and the block's `allowVerify` + `setEditContact` unwrap (~30 lines); offset by the deleted wrapper and selector request (~65 lines). The consumer-side `.0` drops from review-1's earlier plan are no longer needed — `get_contact` stays an aggregation.

## Data flow

```
┌─────────────────────────────────────────────────────────────┐
│ Consumer YAML                                                │
│   _ref:                                                      │
│     module: contacts                                         │
│     component: contact-selector                              │
│     vars:                                                    │
│       id: edit.ticket.subscribers                            │
│       keyword: Subscribers                                   │
│       default_company_ids: [{ _state: ticket.company_id }]   │
└──────────────────────────┬──────────────────────────────────┘
                           │ build-time expansion
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Rendered picker instance                                     │
│   id: edit.ticket.subscribers   (block id)                   │
│   type: ContactSelector                                      │
│   requests:                                                  │
│     edit_ticket_subscribers_contact_search                   │
│     edit_ticket_subscribers_get_contact                      │
│     edit_ticket_subscribers_contacts_data                    │
│   properties:                                                │
│     searchContactsRequest: edit_ticket_subscribers_contact…  │
│     …                                                        │
│   events.onAddContact: [ CallAPI contacts/create-contact,    │
│                          CallMethod appendContact ]          │
│   events.onEditContact: [ CallAPI contacts/update-contact ]  │
│   blocks: [ form_contact_short with state prefix             │
│             edit_ticket_subscribers_contact ]                │
└──────────────────────────┬──────────────────────────────────┘
                           │ user interaction
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Block internals (unchanged)                                  │
│   searchContacts → SetState {id}_input → Request search      │
│   editContact   → SetState {id}_contact_id → Request get_…   │
│                   → SetState {id}_contact = request result   │
│                   → open modal with form bound to {id}_…     │
│   appendContact(contact, contactId) → SetState {id} = […]    │
└─────────────────────────────────────────────────────────────┘
```

## Resolved questions

1. **`extra_options` pattern** — document only, no helper. The consumer composes its own options list via `extra_options: { _array.concat: [{ _request: my_local_request }, …] }` (or just a static array). README snippet covers the pattern; the wrapper treats `extra_options` as a pass-through that's concatenated onto the search results.
2. **`default_company_ids` is opt-in** — already per-call with `default: null`. When unset, the wrapper emits no `onOpen.prefill_company` action, so apps that don't use the `companies` module aren't coupled. When set, the prefill is appended to `onOpen`. No cross-module dependency is forced.
3. **`verified` is opt-in and tri-state** — see decision #7. Default `off` means no verification behaviour is wired. When set to `trusted` or `untrusted`, the picker writes `global_attributes.verified` (not top-level) and exposes verify UI. Module-level only — no per-call override; apps that need heterogeneous pickers should split.
4. **Two known block issues appear resolved on the demo page** — the empty-edit-modal and dropdown-closes-on-keystroke symptoms were not reproducible in the standalone demo added in `922f388`. They'll be re-verified end-to-end once the module wrapper is wired and a real consumer (e.g. a page in an app) drives the picker. If they resurface, fix in a follow-up branch on the block — not in scope for this design.
5. **Aggregation over FindOne for `get_contact`** — keep the request as `MongoDBAggregation` so consumers can inject project/match stages via `request_stages.get_contact`, matching `get_all_contacts` / `create-contact` / `update-contact`. Earlier review-1 plan to switch to `MongoDBFindOne` + drop `.0` from 18 sites was reversed for extensibility. Block's `setEditContact.js` unwraps the array with `` `${getContactRequest}.0` ``.
6. **Atlas `storedSource` + standard-Mongo `$match`** — `search_contacts`'s structural filters live in `$match` (standard Mongo), not `$search.compound.filter` (Atlas syntax). `returnStoredSource: true` makes the stored fields available to downstream stages. Consumer `filter` var takes a regular `$match` expression, and apps without Atlas can drop the `$search` stage for a degraded-but-functional picker.

## Downstream steps

After review: `/r:design-review contacts-module-contact-selector` for a critical read, then `/r:design-task contacts-module-contact-selector` to break into implementation tasks.

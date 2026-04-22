# Contact Selector wiring in the contacts module

## Problem

The `ContactSelector` React block was migrated to Lowdefy v5 on this branch (`dfa11d5`) and proven against a hardcoded demo page (`922f388`). It does not yet live in the `contacts` module — the module still exports a simple `Selector`-backed `contact-selector` component.

Consumers importing `_ref: { module: contacts, component: contact-selector }` today get:

- no search-as-you-type against MongoDB (options are pre-loaded in full),
- no inline add or edit flow,
- no avatars / rich list with per-row remove,
- no company-scoped filtering, verification mode, or extra-options injection.

Those are the use cases the rich `ContactSelector` block was built for. The module needs to ship a wrapper that renders the rich picker with one `_ref` call per consumer, along with the three MongoDB requests the block's lifecycle hooks trigger. The existing wrapper, `get_contacts_for_selector.yaml` request, and any downstream coupling to them get replaced.

The reference wrapper lives in the reference implementation (`apps/shared/contacts/components/contacts_selector.yaml.njk`, 242 lines). It has been in production there and exposes the knobs the module's consumers have asked for. This design ports the wrapper into the contacts module, adapts it to this module's conventions (module vars, `_module.*` operators, scoped endpoint IDs), and handles the fallout in `get_contact` and its 18 existing consumers.

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
4. Unify `get_contact` into a single `MongoDBFindOne` parameterised by `id` and `user_id` (the request's `user_id` var defaults to `{ _url_query: _id }` for detail pages; the picker passes a `_state: ...` node instead), eliminating the `get_contact_for_selector` near-duplicate, and updating 18 call sites to drop `.0`.

## Non-goals

- Rewriting the block itself (block lives in the plugin, already v5). _Exception: a narrow addition of `allowVerify` rendering to `ContactListItem.js` — see decision #7._
- Changing the `contacts` detail / edit / create page behaviour beyond the request-shape switch.
- Adding a new `contacts-add-contact` endpoint alias — consumers call `contacts/create-contact` directly.
- Fixing the two known issues flagged on the prior branch (empty-modal-on-new-contact, dropdown-closes-per-keystroke). Those live in the block and are tracked separately; the v5 migration appears to have resolved both (see Resolved questions #4).

## Key decisions

### 1. Wrapper is a `.yaml.njk`, not `.yaml`

The the reference implementation is `.yaml.njk` because instance-scoped request IDs need string interpolation (`{{ id | replace(".", "_") }}_contact_search`). Plain YAML can't build these IDs at build time. CLAUDE.md codifies the rule: "Use `.yaml.njk` when vars need string interpolation in IDs or inline values".

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

### 4. `get_contact` unification via `id` + `user_id` vars

Today `requests/get_contact.yaml` is a `MongoDBAggregation` with `_url_query: _id`. The picker needs a `MongoDBFindOne` keyed off a state value (`{id}_contact_id`). Two options considered:

- **Duplicate** — add `get_contact_for_selector.yaml`. Near-identical file, two requests to keep in sync. **Rejected** — maintenance burden for no benefit.
- **Unify** — single parameterised request. Adopted.

```yaml
# modules/contacts/requests/get_contact.yaml  (after)
id:
  _var:
    key: id
    default: get_contact
type: MongoDBFindOne
connectionId:
  _module.connectionId: contacts-collection
payload:
  _id:
    _var:
      key: user_id
      default:
        _url_query: _id
properties:
  query:
    _id:
      _payload: _id
    hidden:
      $ne: true
```

Callers come in two flavours:

- **Default (`detail`/`edit`/`view_contact`)** — `_ref: requests/get_contact.yaml` with no vars. Default `id: get_contact`, default `user_id: { _url_query: _id }` — same URL-query-driven behaviour as today, minus `.0` in 18 read sites.
- **Picker** — `_ref: { path: requests/get_contact.yaml, vars: { id: {{ id }}_get_contact, user_id: { _state: {{ id }}_contact_id, ~ignoreBuildChecks: true } } }`. `_var` preserves the `_state` operator node as `user_id`'s value, and it resolves at request-execution time against page state.

Consumers must lose `.0`: `get_contact.0.profile.name` → `get_contact.profile.name` (and similar for the 18 hits). This is the only unavoidable blast across the module; it's mechanical and the failure mode is loud (undefined field reads render nothing).

`modules/contacts/pages/contact-edit.yaml:73` contains `- _ref: requests/get_contact.yaml` as a bare `requests:` entry. After unification, this stays as-is — the request's default `id` evaluates to `get_contact`, so the page-local request name is unchanged.

### 5. Atlas `$search` for `search_contacts`

The module's `get_all_contacts` already uses Atlas `$search`, so the search index and storedSource config are in place. Using `$search` in `search_contacts` stays consistent, gets us wildcard + text scoring, and matches the reference implementation's request verbatim (with `_module.connectionId` swapped in). The alternative (regex `$match`) would work on any MongoDB but collapses ranking and is slow on large contact collections.

Consequence: the search request is the only place where the module hard-requires Atlas. The unify'd `get_contact` stays FindOne (no Atlas dependency). Apps that don't have Atlas already can't use the contacts module today — this doesn't change that.

When `all_contacts: false` (the default), the pipeline adds an `in` filter on `global_attributes.company_ids` scoped to the user's own `_user.global_attributes.company_ids`. Atlas `$search.compound.filter.in.value` rejects a `null` value at query time, so the `in` clause is conditionally included only when the user has at least one `company_id` — users with no companies see no options. This matches the guard added on the prior branch (`4e072de`).

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

- `modules/contacts/module.lowdefy.yaml` — declare new module-level vars (`verified`, `all_contacts`, `phone_label`), update `exports.components`, update the `components:` block to point at the new `.yaml.njk`, add the new requests/files to `validate:` / `requests:` lists as applicable
- `modules/contacts/requests/get_contact.yaml` — rewrite as parameterised `MongoDBFindOne`
- `modules/contacts/requests/get_contact_companies.yaml` — drop `.0` from the `_request: get_contact.0.global_attributes.company_ids` read
- `modules/contacts/components/view_contact.yaml` — drop `.0` (5 sites)
- `modules/contacts/pages/contact-detail.yaml` — drop `.0` (6 sites)
- `modules/contacts/pages/contact-edit.yaml` — drop `.0` (6 sites) and pass the request through unchanged (no vars → default `user_id: { _url_query: _id }`)
- `modules/contacts/api/update-contact.yaml` — drop the `updated.timestamp` filter clause (see decision #9)
- `modules/contacts/api/create-contact.yaml` — `:return: contactId` falls through `insert.upsertedId` → `insert.lastErrorObject.upserted` (see decision #10)
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactListItem.js` — add `allowVerify` prop; render Verify (danger) button in place of Edit for unverified rows
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactList.js` — forward `allowVerify` to `ContactListItem`
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/ContactSelector.js` — pass `properties.allowVerify` down to `ContactList`
- `plugins/modules-mongodb-plugins/src/blocks/ContactSelector/meta.js` — document `allowVerify` in properties

Total: 5 new files, 2 deleted, 11 modified. Net delta is dominated by the new wrapper (~200 lines), the default form (~150 lines), and the block's `allowVerify` additions (~30 lines); offset by the deleted wrapper and selector request (~65 lines).

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

## Downstream steps

After review: `/r:design-review contacts-module-contact-selector` for a critical read, then `/r:design-task contacts-module-contact-selector` to break into implementation tasks.

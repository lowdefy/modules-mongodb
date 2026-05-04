# Task 4: API + pages payload migration

## Context

After task 3 the form binds to `state.name` / `state.contact.*` / `state.address.*` / `state.registration.*` / `state.attributes.*`, but:

- `pages/edit.yaml` still does `set_state` from flat `get_company.0.trading_name` etc. (`pages/edit.yaml:42-76`) and sends a flat `update-company` payload (`pages/edit.yaml:103-139`).
- `pages/new.yaml` sends a flat `create-company` payload (`pages/new.yaml:64-90`).
- `api/create-company.yaml` writes flat `trading_name` / `registered_name` / `registration_number` / `vat_number` / `website` to the doc (`api/create-company.yaml:15-26`).
- `api/update-company.yaml` writes the same flat fields in stage 1 of the pipeline (`api/update-company.yaml:18-29`).

This task lands the matching payload-shape change across all five files **atomically**. Splitting these into separate tasks would create a state where forms send keys the API ignores or vice versa.

## Task

### 4.1 `api/create-company.yaml`

`MongoDBInsertConsecutiveId.doc` is a literal insert — `$mergeObjects` doesn't apply. Replace flat scalars with `name` + `_if_none` per section. The existing `contact` / `address` / `attributes` blocks at lines 27-38 already use this pattern; extend it to `registration` and remove the flat fields:

```yaml
doc:
  name:
    _payload: name
  description:
    _payload: description
  contact:
    _if_none:
      - _payload: contact
      - {}
  address:
    _if_none:
      - _payload: address
      - {}
  registration:
    _if_none:
      - _payload: registration
      - {}
  attributes:
    _if_none:
      - _payload: attributes
      - {}
  lowercase_email:
    _string.toLowerCase:
      _string.trim:
        _if_none:
          - _payload: contact.primary_email
          - ""
  removed: null
  created:
    _ref:
      module: events
      component: change_stamp
  updated:
    _ref:
      module: events
      component: change_stamp
```

The `event_display` Nunjucks `target.name` resolves through `_payload: { _module.var: name_field }`, which now reads `_payload.name` — no edit needed there (lines 102-138 stay as-is structurally; the runtime resolution does the right thing once `name_field` defaults to `name`).

### 4.2 `api/update-company.yaml`

Pipeline update. In stage 1 (`update-company.yaml:17-53`):

- Rename `trading_name` to `name`.
- Drop the flat `registered_name`, `registration_number`, `vat_number`, `website` `$set` entries.
- Add `registration: $mergeObjects [...]` alongside the existing `contact`, `address`, `attributes` merges.

Stage 2 (`lowercase_email`) reads `$contact.primary_email` already — leave it as-is. Consumer write stages stay at the end.

```yaml
update:
  _build.array.concat:
    # Stage 1: scalars + section merges
    - - $set:
          name:
            _payload: name
          description:
            _payload: description
          contact:
            $mergeObjects:
              - $ifNull: ["$$ROOT.contact", {}]
              - _payload: contact
          address:
            $mergeObjects:
              - $ifNull: ["$$ROOT.address", {}]
              - _payload: address
          registration:
            $mergeObjects:
              - $ifNull: ["$$ROOT.registration", {}]
              - _payload: registration
          attributes:
            $mergeObjects:
              - $ifNull: ["$$ROOT.attributes", {}]
              - $ifNull:
                  - _payload: attributes
                  - {}
          updated:
            _ref:
              module: events
              component: change_stamp
    # Stage 2: derived (unchanged)
    - - $set:
          lowercase_email:
            $toLower:
              $trim:
                input:
                  $ifNull:
                    - "$contact.primary_email"
                    - ""
    # Consumer pipeline stages (unchanged)
    - _module.var: request_stages.write
```

Keep the optimistic-concurrency filter on `updated.timestamp` (`update-company.yaml:9-13`) and the `unlink-old-contacts` / `link-new-contacts` / `new-event` steps unchanged. The `target.name` Nunjucks resolution in `new-event` (`update-company.yaml:128-138`) follows the same `name_field`-driven path as create — no edit needed.

### 4.3 `pages/edit.yaml`

Replace today's `set_state` (`edit.yaml:42-76`) with section sub-object reads:

```yaml
- id: set_state
  type: SetState
  params:
    _id:
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
      _array.map:
        on:
          _if_none:
            - _request: get_company_contact_ids.0.ids
            - []
        callback:
          _function:
            contact_id:
              __args: 0
    updated:
      _request: get_company.0.updated
```

Replace today's `update_company` payload mapping (`edit.yaml:103-139`) with:

```yaml
payload:
  _id:
    _state: _id
  name:
    _state: name
  description:
    _state: description
  contact:
    _state: contact
  address:
    _state: address
  registration:
    _state: registration
  attributes:
    _state: attributes
  contacts:
    _array.map:
      on:
        _if_none:
          - _state: contacts
          - []
      callback:
        _function:
          __args: 0.contact_id
  updated:
    _state: updated
```

The page title still reads `_request: get_company.0.display_name` — that stays correct because `display_name` is the `$getField` alias added in `requests/get_company.yaml:15-20`, driven by `name_field` (which now defaults to `name`).

### 4.4 `pages/new.yaml`

Update `onInit` `init_state` (`new.yaml:24-30`) to add `registration: {}`:

```yaml
- id: init_state
  type: SetState
  params:
    contact: {}
    address: {}
    registration: {}
    attributes: {}
    contacts: []
```

Replace the `create_company` payload (`new.yaml:64-90`) with:

```yaml
payload:
  name:
    _state: name
  description:
    _state: description
  contact:
    _state: contact
  address:
    _state: address
  registration:
    _state: registration
  attributes:
    _state: attributes
  contacts:
    _array.map:
      on:
        _if_none:
          - _state: contacts
          - []
      callback:
        _function:
          __args: 0.contact_id
```

### 4.5 `pages/view.yaml`

Update `onInit` `init_state` (`view.yaml:48-54`) to add `registration: {}`:

```yaml
- id: init_state
  type: SetState
  params:
    contact: {}
    address: {}
    registration: {}
    attributes: {}
```

Nothing else on `view.yaml` needs editing — the page reads from `_request: get_company.0` and lets `view_company.yaml` (rewritten in task 3) handle field rendering.

## Acceptance Criteria

- `api/create-company.yaml` `doc:` block has the new shape (`name`, sections via `_if_none`, no flat `trading_name`/`registered_name`/`registration_number`/`vat_number`/`website`).
- `api/update-company.yaml` stage 1 has `name` + four section `$mergeObjects` (no flat scalars).
- `pages/edit.yaml` `set_state` reads sections as sub-objects; `update_company` payload sends sections as sub-objects.
- `pages/new.yaml` `init_state` includes `registration: {}`; `create_company` payload sends sections as sub-objects.
- `pages/view.yaml` `init_state` includes `registration: {}`.
- Round-trip works against a freshly seeded doc (creating a company with a contact preset wired in lands the keys under `contact.*`; editing and saving preserves them).
- `pnpm ldf:b:i` succeeds.

## Files

- `modules/companies/api/create-company.yaml` — modify (`doc:` block in the `insert` step)
- `modules/companies/api/update-company.yaml` — modify (`update:` array stage 1)
- `modules/companies/pages/edit.yaml` — modify (`set_state` and `update_company` payload)
- `modules/companies/pages/new.yaml` — modify (`init_state` and `create_company` payload)
- `modules/companies/pages/view.yaml` — modify (`init_state`)

## Notes

This is the largest single task in the plan because the changes are mutually dependent — splitting them creates a runtime-broken intermediate state. Review can still progress per-file; the lockstep constraint is about the merge unit, not the review unit.

The demo's existing seed data still has `trading_name` / `registered_name` / etc. After this task lands, edit/save on a legacy doc will:

- read missing `_request: get_company.0.name` → `state.name = undefined`
- send `_payload.name = undefined` → API stores `{ name: null, ... }`
- the legacy `trading_name` field is **not unset** by the update (the API's `$set` doesn't touch it) — both keys coexist on the doc

This is expected; task 6 reseeds the demo collection and removes the legacy keys entirely.

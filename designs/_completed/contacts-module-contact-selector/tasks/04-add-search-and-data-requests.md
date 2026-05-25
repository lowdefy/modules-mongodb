# Task 4: Add `search_contacts.yaml` and `get_contacts_data.yaml` to the contacts module

## Context

The `ContactSelector` block drives three requests in its lifecycle hooks:

- `searchContactsRequest` — text-matched options that feed the Select dropdown as the user types.
- `getContactRequest` — single contact lookup triggered on Edit click (Task 3 parameterises the existing `get_contact`).
- `getContactsDataRequest` — bulk enrichment of selected + option contacts for the list row rendering.

This task adds the two new requests (search and bulk data). They live at:

- `modules/contacts/requests/search_contacts.yaml`
- `modules/contacts/requests/get_contacts_data.yaml`

Both use `connectionId: { _module.connectionId: contacts-collection }`, which resolves to the module-scoped contacts connection at build time.

`search_contacts` uses a **layered pipeline**: Atlas `$search` for text ranking (`should` clauses only), then standard MongoDB `$match` for all structural filters. `returnStoredSource: true` on the `$search` stage materialises the stored fields into the search result so `$match` can read them without a `$lookup`. This means the consumer `filter` var is a standard Mongo query (not Atlas `compound.filter` syntax), and apps without Atlas can drop the `$search` stage and still get a working — if unranked — picker. See design decision #5.

## Task

**Create `modules/contacts/requests/search_contacts.yaml`.**

```yaml
id:
  _var: id # default resolves at the caller
type: MongoDBAggregation
connectionId:
  _module.connectionId: contacts-collection
payload:
  _var: payload # caller passes { input, filter, all_contacts, phone_label }
properties:
  pipeline:
    # Layer 1 — Atlas $search for text ranking; storedSource exposes fields to downstream stages.
    - $search:
        returnStoredSource: true
        compound:
          should:
            _if:
              test:
                _eq:
                  - _if_none:
                      - _payload: input
                      - ""
                  - ""
              then: []
              else:
                - text:
                    query: { _payload: input }
                    path: [profile.name, lowercase_email]
                - wildcard:
                    query:
                      _string.concat: ["*", { _payload: input }, "*"]
                    path: [profile.name, lowercase_email]
                    allowAnalyzedField: true
    # Layer 2 — structural filters as standard $match; consumer-pluggable via `filter` var.
    - $match:
        _object.assign:
          - hidden: { $ne: true }
            disabled: { $ne: true }
          - _build.if:
              test:
                _var: all_contacts
              then: {}
              else:
                _build.if:
                  test:
                    _gt:
                      - _array.length:
                          _if_none:
                            - _user: global_attributes.company_ids
                            - []
                      - 0
                  then:
                    global_attributes.company_ids:
                      $in:
                        _user: global_attributes.company_ids
                  else: {}
          - _var:
              key: filter
              default: {}
    # Layer 3 — cap and project the block's value shape.
    - $limit: 10
    - $project:
        _id: 0
        value:
          contact_id: "$_id"
          name: "$profile.name"
          email: "$lowercase_email"
          verified: "$global_attributes.verified"
          picture: "$profile.picture"
        label:
          $concat:
            - "<div>"
            - { $ifNull: ["$profile.name", ""] }
            - '</div><div class="secondary smaller">'
            - { $ifNull: ["$lowercase_email", "No email"] }
            - "</div>"
```

The `phone_label` feature can be left as a no-op for v1 (the design lists it in the module-vars table, but the initial pipeline can skip the phone-label `$switch` that the reference implementation has; add it later if needed). Leave a comment noting the phone-label `$switch` can be ported when needed.

**Create `modules/contacts/requests/get_contacts_data.yaml`.** Enrichment by a list of contact ids:

```yaml
id:
  _var: id
type: MongoDBAggregation
connectionId:
  _module.connectionId: contacts-collection
payload:
  contact_ids:
    _var:
      key: contact_ids
      default: []
properties:
  pipeline:
    - $match:
        _id:
          $in:
            _payload: contact_ids
    - $project:
        _id: 0
        contact_id: "$_id"
        name: "$profile.name"
        email:
          $cond:
            if:
              $regexMatch:
                input: "$lowercase_email"
                regex: '\@'
            then:
              $ifNull: ["$lowercase_email", ""]
            else: null
        verified: "$global_attributes.verified"
        picture: "$profile.picture"
        global_attributes: 1
```

Both requests have `id:` parameterised so the wrapper (Task 8) can name each instance uniquely (e.g. `{id}_contact_search`, `{id}_contacts_data`).

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` succeeds (validates `_module.connectionId` resolves, YAML is valid).
- Hitting `search_contacts` from a Lowdefy request returns rows of `{ label: "<html>...", value: { contact_id, name, email, verified, picture } }`.
- Hitting `get_contacts_data` with a `contact_ids` payload returns rows of `{ contact_id, name, email, verified, picture, global_attributes }`.
- With `all_contacts: false` (default) and a user who has no `global_attributes.company_ids`, the search returns no options (the `$in` clause is conditionally omitted so the `$match` doesn't accidentally return the full set).
- Apps wanting to pass custom filters supply a Mongo `$match` expression via `filter`, e.g. `filter: { status: active }` — verified by inspecting the merged `$match` in a test.

## Files

- `modules/contacts/requests/search_contacts.yaml` — create
- `modules/contacts/requests/get_contacts_data.yaml` — create

## Notes

- `returnStoredSource: true` depends on the Atlas search index declaring the relevant fields (`profile.name`, `profile.picture`, `lowercase_email`, `global_attributes.*`, `hidden`, `disabled`) as stored. The module's existing `get_all_contacts` already relies on this — confirm the index config before shipping (module README mentions Atlas search at `modules/contacts/README.md:20`).
- Apps without Atlas: comment at the top of the file notes that the `$search` stage can be removed; the `$match` + `$project` pipeline is standalone-compatible.
- These files are NOT registered in `module.lowdefy.yaml` yet — that happens in Task 7. Build will still succeed because unreferenced request files are ignored by the build pipeline (they only become active when a consumer `_ref`s them, which Task 8 does).

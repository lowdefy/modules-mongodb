# Task 4: Add `search_contacts.yaml` and `get_contacts_data.yaml` to the contacts module

## Context

The `ContactSelector` block drives three requests in its lifecycle hooks:

- `searchContactsRequest` — text-matched options that feed the Select dropdown as the user types.
- `getContactRequest` — single contact lookup triggered on Edit click (Task 3 unifies this with the existing `get_contact`).
- `getContactsDataRequest` — bulk enrichment of selected + option contacts for the list row rendering.

This task adds the two new requests (search and bulk data). They live at:

- `modules/contacts/requests/search_contacts.yaml`
- `modules/contacts/requests/get_contacts_data.yaml`

Both use `connectionId: { _module.connectionId: contacts-collection }`, which resolves to the module-scoped contacts connection at build time. The reference shapes are the reference implementation's requests adapted to the contacts module's conventions — see `design.md` decision #5 and the Data flow diagram.

## Task

**Create `modules/contacts/requests/search_contacts.yaml`.** Atlas `$search` compound filter + wildcard+text scoring. Guard the `all_contacts: false` path: the `in` filter on `global_attributes.company_ids` is only added when the user has a non-empty `_user: global_attributes.company_ids` (Atlas rejects `in.value: null`).

Shape (the reference implementation `contacts_selector_search_contacts.yaml` is the template; adapt to this module):

```yaml
id:
  _var: id # default resolves at the caller
type: MongoDBAggregation
connectionId:
  _module.connectionId: contacts-collection
payload:
  _var: payload # caller passes { input, company_id, filter, all_contacts, phone_label }
properties:
  pipeline:
    - $search:
        compound:
          filter:
            _array.concat:
              - - compound:
                    mustNot:
                      - equals:
                          path: disabled
                          value: true
                      - equals:
                          path: hidden
                          value: true
              - _if:
                  test:
                    _var: all_contacts
                  then: []
                  else:
                    _if:
                      test:
                        _gt:
                          - _array.length:
                              _if_none:
                                - _user: global_attributes.company_ids
                                - []
                          - 0
                      then:
                        - in:
                            path: global_attributes.company_ids
                            value:
                              _user: global_attributes.company_ids
                      else: []
              - _var:
                  key: filter
                  default: []
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

The `phone_label` feature can be left as a no-op for v1 (the design lists it in the module-vars table, but the initial pipeline can skip the phone-label `$switch` that the reference implementation has; add it later if needed). Leave a comment noting the the reference implementation pipeline has a `phone_label` `$switch` that can be ported when needed.

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
- Hitting `search_contacts` from a Lowdefy request (directly via a test page, or after Task 8 via the wrapper) returns rows of `{ label: "<html>...", value: { contact_id, name, email, verified, picture } }`.
- Hitting `get_contacts_data` with a `contact_ids` payload returns rows of `{ contact_id, name, email, verified, picture, global_attributes }`.
- With an all-`all_contacts: false` default and a user who has no `global_attributes.company_ids`, the search returns no options (does not 500 from Atlas).

## Files

- `modules/contacts/requests/search_contacts.yaml` — create
- `modules/contacts/requests/get_contacts_data.yaml` — create

## Notes

- These files are NOT registered in `module.lowdefy.yaml` yet — that happens in Task 7. Build will still succeed because unreferenced request files are ignored by the build pipeline (they only become active when a consumer `_ref`s them, which Task 8 does).
- The Atlas Search index for `user-contacts` must already cover `profile.name` and `lowercase_email` (module README mentions this at `modules/contacts/README.md:20`). Atlas index setup is out of scope for this task — it's assumed to exist in the deployed environment.
- Don't re-introduce `storedSource` returns here — `get_all_contacts` uses stored source for pagination/sort, but `search_contacts` doesn't need it; the `$project` after the search materialises what the block consumes.

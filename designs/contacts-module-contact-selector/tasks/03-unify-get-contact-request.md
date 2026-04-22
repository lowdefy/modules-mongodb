# Task 3: Unify `get_contact.yaml` as parameterised `MongoDBFindOne`; drop `.0` from 18 consumer sites

## Context

Today `modules/contacts/requests/get_contact.yaml` is a `MongoDBAggregation` that takes `_url_query: _id` in its payload and returns an array of one document. Consumers read `get_contact.0.<path>` at 18 sites across 4 files.

The `ContactSelector` block (via the new wrapper in Task 8) needs the same contact lookup but keyed off a state value (`{id}_contact_id`). Instead of duplicating the request, we unify: switch `get_contact.yaml` to `MongoDBFindOne` (returns a single doc, not an array), parameterise its `id` and `user_id`, and update all 18 sites to drop `.0`.

The new request shape matches the reference implementation's pattern. Default behaviour is unchanged for detail/edit pages — a bare `_ref: requests/get_contact.yaml` with no vars resolves to the URL-query-driven `FindOne`. The picker supplies `user_id` as a `_state` operator.

See `design.md` decision #4 for the full rationale and code shape.

## Task

**Rewrite `modules/contacts/requests/get_contact.yaml`** to:

```yaml
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

**Drop `.0` from every `get_contact.*` read across the following files.** These are the 18 sites — each is a `_request: get_contact.0.<path>` that becomes `_request: get_contact.<path>`:

`modules/contacts/requests/get_contact_companies.yaml`:

- line 9: `_request: get_contact.0.global_attributes.company_ids` → `_request: get_contact.global_attributes.company_ids`

`modules/contacts/components/view_contact.yaml` (5 sites):

- line 10: `_request: get_contact.0.profile.picture` → drop `.0`
- line 12: `_request: get_contact.0.profile.name` → drop `.0`
- line 14: `_request: get_contact.0.email` → drop `.0`
- line 24: `_request: get_contact.0.profile` → drop `.0`
- line 47: `_request: get_contact.0.global_attributes` → drop `.0`

`modules/contacts/pages/contact-detail.yaml` (6 sites):

- line 12, 24, 38, 56, 67 + check the last remaining occurrence: `_request: get_contact.0` or `get_contact.0.<path>` → drop `.0`

`modules/contacts/pages/contact-edit.yaml` (6 sites):

- line 12: `_request: get_contact.0.profile.name` → drop `.0`
- line 43: `_request: get_contact.0` → drop `.0`
- line 54: `_request: get_contact.0` → drop `.0`
- line 63: `_request: get_contact.0.profile` → drop `.0`
- line 65: `_request: get_contact.0.global_attributes` → drop `.0`
- line 67: `_request: get_contact.0.email` → drop `.0`
- line 69: `_request: get_contact.0.updated` → drop `.0`
- line 71: `_request: get_contact.0._id` → drop `.0`

(Counts in the section headers sum to 18. `contact-edit.yaml` has 8 `.0` reads according to `grep`; reconcile by running the grep before starting — see Notes.)

The bare `_ref: requests/get_contact.yaml` request-entry at `contact-edit.yaml:73` is unchanged — the request's default `id: get_contact` still makes it addressable as `_request: get_contact` from the page.

## Acceptance Criteria

- `grep -rn 'get_contact\.0\.' modules/contacts` returns no results.
- `grep -rn '_request: get_contact.0\b' modules/contacts` returns no results.
- `pnpm ldf:b:i` in `apps/demo` builds successfully.
- Visiting `/contacts/contacts/{some_id}` (contact detail) renders with the correct name, picture, email, etc. (same behaviour as before).
- Visiting `/contacts/contacts/{some_id}/edit` (contact edit) populates form fields correctly and still saves.

## Files

- `modules/contacts/requests/get_contact.yaml` — modify — rewrite as parameterised `MongoDBFindOne`
- `modules/contacts/requests/get_contact_companies.yaml` — modify — drop `.0` (1 site)
- `modules/contacts/components/view_contact.yaml` — modify — drop `.0` (5 sites)
- `modules/contacts/pages/contact-detail.yaml` — modify — drop `.0` (6 sites)
- `modules/contacts/pages/contact-edit.yaml` — modify — drop `.0` (6 sites)

## Notes

- Before starting, run `grep -rn 'get_contact\.0' modules/contacts --include='*.yaml'` to get the authoritative count in case files changed since this task was written.
- This task does NOT touch `modules/contacts/api/update-contact.yaml` — the fact that `contact-edit.yaml` sends `updated.timestamp` in its update payload is out of scope here (Task 1 drops the filter that checks it).
- Task 8's wrapper passes `user_id: { _state: {id}_contact_id, ~ignoreBuildChecks: true }` via `_ref` vars to this request. Don't bake state-key logic into this file — keep it neutral.

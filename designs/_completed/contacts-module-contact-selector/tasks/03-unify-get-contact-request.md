# Task 3: Parameterise `get_contact.yaml` (id + user_id) and add `request_stages.get_contact` hook

## Context

`modules/contacts/requests/get_contact.yaml` is a `MongoDBAggregation` with `_url_query: _id`. It returns an array of one doc; 18 consumer reads across 4 files (`contact-detail.yaml`, `contact-edit.yaml`, `view_contact.yaml`, `get_contact_companies.yaml`) use `get_contact.0.<path>`. That stays unchanged.

The picker (via the Task 8 wrapper) needs the same lookup but keyed off a state value (`{id}_contact_id`). To support both detail pages and the picker from a single request file, the request is parameterised with two vars: `id` (instance name, defaults to `get_contact`) and `user_id` (the id to look up, defaults to `{ _url_query: _id }`). A third var — the existing `request_stages` group — gains a new `get_contact` key so downstream stages can be injected by consumers, matching the pattern used by `get_all_contacts` / `write`.

The block's `setEditContact.js` unwraps the aggregation array via `` `${getContactRequest}.0` `` — that change lives in Task 2 alongside the other block edits.

See design decision #4 for the full rationale.

## Task

**Rewrite `modules/contacts/requests/get_contact.yaml`** to:

```yaml
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

The `_build.array.concat` pattern matches how other module requests (`get_all_contacts`, `create-contact`, `update-contact`) graft consumer-supplied stages onto the core pipeline.

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` builds successfully.
- Visiting `/contacts/contacts/{some_id}` (contact detail) renders with the correct name, picture, email, etc. — identical to today.
- Visiting `/contacts/contacts/{some_id}/edit` (contact edit) populates form fields correctly and still saves.
- `grep -rn 'get_contact\.0' modules/contacts --include='*.yaml'` still shows the existing 18 reads (they remain valid — the aggregation still returns an array).

## Files

- `modules/contacts/requests/get_contact.yaml` — modify — parameterise `id` + `user_id`, add `request_stages.get_contact` concat point

## Notes

- This task intentionally does NOT touch the 18 `get_contact.0.*` consumer sites. Earlier review-1 feedback suggested dropping `.0`; design decision #4 was subsequently revised to keep the aggregation (and thus the `.0` reads) in exchange for the `request_stages` injection point.
- Module-manifest declaration of `request_stages.get_contact` (under the existing `request_stages:` var) lives in Task 7.
- Task 8's wrapper passes `user_id: { _state: {id}_contact_id, ~ignoreBuildChecks: true }` via `_ref` vars to this request. Don't bake state-key logic into this file — keep it neutral.

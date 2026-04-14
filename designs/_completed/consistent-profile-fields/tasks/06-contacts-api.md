# Task 6: Refactor contacts APIs to Core + Injection Pattern

## Context

`modules/contacts/api/create-contact.yaml` and `modules/contacts/api/update-contact.yaml` both hardcode profile field mappings (title, given_name, family_name, work_phone, mobile_phone, department, job_title, birthday) directly in their `$set`/`doc` definitions.

After this task, both APIs will use core fields (name, picture, given_name, family_name) + conditional title + injected extended fields via `_module.var: components.profile_set_fields`.

### Current create-contact.yaml structure

The `doc` property uses `_build.object.assign` with:

1. A large object containing `_id`, `email`, `lowercase_email`, `profile.*`, `global_attributes`, `hidden`, `disabled`, `created`, `updated`
2. `_module.var: request_stages.insert_contact` injection

Uses `MongoDBInsertOne` with a nested `profile:` object. The shared `set_fields.yaml` uses flat dot-notation keys (`profile.work_phone`) designed for `$set` operations, which are incompatible with the nested structure.

### Current update-contact.yaml structure

The `update` property uses `_build.array.concat` with:

1. A `$set` stage containing `profile.*`, `global_attributes.*`, `updated`
2. `_module.var: request_stages.update_contact` injection

## Task

### `modules/contacts/api/create-contact.yaml`

**Restructure from `MongoDBInsertOne` to `MongoDBUpdateOne` with `upsert: true`**, following the existing `invite-user.yaml` pattern. This allows reusing the shared `set_fields.yaml` directly with flat dot-notation keys.

1. **Change the request type** from `MongoDBInsertOne` to `MongoDBUpdateOne`.

2. **Add `filter` and `options`:**

   ```yaml
   filter:
     _id:
       _payload: _id
   options:
     upsert: true
   ```

3. **Use an aggregation pipeline `$set` stage** with `_object.assign` to compose the fields:

   ```yaml
   update:
     _build.array.concat:
       - - $set:
             _object.assign:
               # Insert-only fields (use $ifNull so they're only set on first insert)
               - _id:
                   $ifNull:
                     - $_id
                     - _payload: _id
                 email:
                   _payload: contact.email
                 lowercase_email:
                   _string.toLowerCase:
                     _payload: contact.email
                 hidden: false
                 disabled: false
                 created:
                   $ifNull:
                     - $created
                     - _ref:
                         module: events
                         component: change_stamp
               # Core profile fields
               - profile.name:
                   _string.concat:
                     - _if_none:
                         - _payload: contact.profile.given_name
                         - ""
                     - " "
                     - _if_none:
                         - _payload: contact.profile.family_name
                         - ""
                 profile.picture:
                   _string.concat:
                     - "https://api.dicebear.com/6.x/initials/svg?seed="
                     - _if_none:
                         - _payload: contact.profile.given_name
                         - ""
                     - " "
                     - _if_none:
                         - _payload: contact.profile.family_name
                         - ""
                 profile.given_name:
                   _payload: contact.profile.given_name
                 profile.family_name:
                   _payload: contact.profile.family_name
                 global_attributes.company_ids:
                   _if_none:
                     - _payload: contact.global_attributes.company_ids
                     - []
                 global_attributes.internal_details:
                   _payload: contact.global_attributes.internal_details
                 updated:
                   _ref:
                     module: events
                     component: change_stamp
               # Title (conditional)
               - _build.if:
                   test:
                     _module.var: show_title
                   then:
                     profile.title:
                       _payload: contact.profile.title
                   else: {}
               # Extended profile fields (injected by consumer)
               - _module.var:
                   key: components.profile_set_fields
                   default: {}
       # request_stages injection (preserved)
       - _module.var:
           key: request_stages.insert_contact
           default: []
   ```

4. **Remove** hardcoded `work_phone`, `mobile_phone`, `department`, `job_title`, `birthday`.

5. **Keep** the entire event logging section unchanged.

Key benefits of this restructure:

- Flat dot-notation keys match the update API pattern exactly
- Shared `set_fields.yaml` works directly — no key format mismatch
- `$ifNull` ensures insert-only fields (`_id`, `created`) are only set when the document is new
- `request_stages.insert_contact` injection point is preserved as pipeline stages

### `modules/contacts/api/update-contact.yaml`

In the `update` step's `$set`, wrap the profile fields with `_object.assign`:

```yaml
$set:
  _object.assign:
    # Core fields
    - profile.name:
        _string.concat:
          - _if_none:
              - _payload: contact.profile.given_name
              - ""
          - " "
          - _if_none:
              - _payload: contact.profile.family_name
              - ""
      profile.picture:
        _string.concat:
          - "https://api.dicebear.com/6.x/initials/svg?seed="
          - _if_none:
              - _payload: contact.profile.given_name
              - ""
          - " "
          - _if_none:
              - _payload: contact.profile.family_name
              - ""
      profile.given_name:
        _payload: contact.profile.given_name
      profile.family_name:
        _payload: contact.profile.family_name
      global_attributes.company_ids:
        _if_none:
          - _payload: contact.global_attributes.company_ids
          - []
      global_attributes.internal_details:
        _payload: contact.global_attributes.internal_details
      updated:
        _ref:
          module: events
          component: change_stamp
    # Title (conditional)
    - _build.if:
        test:
          _module.var: show_title
        then:
          profile.title:
            _payload: contact.profile.title
        else: {}
    # Extended profile fields (injected by consumer)
    - _module.var:
        key: components.profile_set_fields
        default: {}
```

Key changes:

1. **Remove** hardcoded `profile.work_phone`, `profile.mobile_phone`, `profile.department`, `profile.job_title`, `profile.birthday`
2. **Make title conditional** on `_module.var: show_title`
3. **Add** `_module.var: components.profile_set_fields` injection
4. **Keep** `global_attributes.*`, `updated`, email immutability comment, and `request_stages.update_contact` injection
5. **Keep** the entire event logging section unchanged

## Acceptance Criteria

- `create-contact.yaml` restructured from `MongoDBInsertOne` to `MongoDBUpdateOne` with `upsert: true`
- `create-contact.yaml` uses `$ifNull` for insert-only fields (`_id`, `created`) so they're only set on first insert
- Both APIs use `_object.assign` for profile field composition within `$set`
- Both APIs use flat dot-notation keys (`profile.name`, `profile.given_name`, etc.)
- Core fields: profile.name (computed), profile.picture (computed), profile.given_name, profile.family_name
- Title conditional on `_module.var: show_title`
- Extended fields via `_module.var: components.profile_set_fields` with default `{}`
- No hardcoded work_phone, mobile_phone, department, job_title, birthday
- Contacts-specific fields (global_attributes.company_ids, global_attributes.internal_details) preserved
- Event logging sections unchanged
- `request_stages.insert_contact` and `request_stages.update_contact` injection points preserved

## Files

- `modules/contacts/api/create-contact.yaml` — modify — restructure to MongoDBUpdateOne with upsert, core + injection pattern
- `modules/contacts/api/update-contact.yaml` — modify — replace hardcoded profile fields with core + injection pattern

## Notes

- The contacts avatar URL currently uses a shorter format (missing `backgroundType=gradientLinear&scale=75`). That normalization is handled in task 13.

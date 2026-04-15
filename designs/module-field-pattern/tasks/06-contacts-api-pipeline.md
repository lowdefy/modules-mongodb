# Task 6: Rewrite contacts APIs to Pipeline Update with $mergeObjects

## Context

Task 5 flattened the contacts state namespace. API payloads now send flat keys (`_payload: profile`, `_payload: global_attributes`, etc.) instead of nested `_payload: contact.*`. The APIs currently use `_object.assign` with individual `profile.*` field mappings. This task rewrites them to use pipeline update syntax with `$mergeObjects`.

## Task

### 1. Rewrite `api/update-contact.yaml`

**Current pattern (simplified):**

```yaml
update:
  _build.array.concat:
    - - $set:
          _object.assign:
            - profile.name: _string.concat(given_name, family_name)
              profile.avatar_color: _payload: contact.profile.avatar_color
              profile.picture: _payload: contact.profile.picture
              profile.given_name: _payload: contact.profile.given_name
              profile.family_name: _payload: contact.profile.family_name
              global_attributes.company_ids: _payload: contact.global_attributes.company_ids
              updated: change_stamp
            - profile_set_fields
            - attributes_set_fields
    - request_stages.update_contact
```

**New pattern:**

```yaml
update:
  _build.array.concat:
    # Stage 1: Merge data objects
    - - $set:
          profile:
            $mergeObjects:
              - $ifNull:
                  - "$$ROOT.profile"
                  - {}
              - _payload: profile
          global_attributes:
            $mergeObjects:
              - $ifNull:
                  - "$$ROOT.global_attributes"
                  - {}
              - _payload: global_attributes
          updated:
            _ref:
              module: events
              component: change_stamp
    # Stage 2: Compute derived fields
    - - $set:
          profile.name:
            $concat:
              - $trim:
                  input: "$profile.given_name"
              - " "
              - $trim:
                  input: "$profile.family_name"
    # Consumer pipeline stages
    - _module.var: request_stages.write
```

Key changes:

- `profile` uses `$mergeObjects` — merges payload onto existing, preserving fields like `profile_created`, `avatar_color`, `picture`
- `global_attributes` same pattern — preserves `company_ids` and any other fields
- `profile.name` computed in separate stage after merge
- No more `_module.var: components.profile_set_fields` or `_module.var: components.attributes_set_fields`
- `request_stages.write` replaces `request_stages.update_contact`
- All `_payload: contact.*` → `_payload: *` (flat)

**Filter update:**

```yaml
filter:
  _object.assign:
    - _id:
        _payload: _id
      updated.timestamp:
        _payload: updated.timestamp
    - _object.defineProperty: ...is_user guard stays the same...
```

(was `_payload: contact._id` and `_payload: contact.updated.timestamp`)

**Event logging updates:**

- `_payload: contact.profile.given_name` → `_payload: profile.given_name` (or better: reference the step result since name is now computed server-side)
- `_payload: contact.profile.family_name` → `_payload: profile.family_name`
- `_payload: contact._id` → `_payload: _id`
- `_payload: contact.global_attributes.company_ids` → `_payload: global_attributes.company_ids`

### 2. Rewrite `api/create-contact.yaml`

**New pattern:**

```yaml
update:
  _build.array.concat:
    # Stage 1: Insert-only + merge
    - - $set:
          _id:
            $ifNull:
              - $_id
              - _payload: _id
          email:
            _payload: email
          lowercase_email:
            _string.toLowerCase:
              _payload: email
          hidden: false
          disabled: false
          created:
            $ifNull:
              - $created
              - _ref:
                  module: events
                  component: change_stamp
          profile:
            $mergeObjects:
              - $ifNull:
                  - "$$ROOT.profile"
                  - {}
              - _payload: profile
          global_attributes:
            $mergeObjects:
              - $ifNull:
                  - "$$ROOT.global_attributes"
                  - {}
              - _payload: global_attributes
          updated:
            _ref:
              module: events
              component: change_stamp
    # Stage 2: Compute derived
    - - $set:
          profile.name:
            $concat:
              - $trim:
                  input: "$profile.given_name"
              - " "
              - $trim:
                  input: "$profile.family_name"
    # Consumer pipeline stages
    - _module.var: request_stages.write
```

Key changes:

- Same `$mergeObjects` pattern for `profile` and `global_attributes`
- No more `_module.var: components.profile_set_fields` or `_module.var: components.attributes_set_fields`
- `request_stages.write` replaces `request_stages.insert_contact`
- All `_payload: contact.*` → `_payload: *` (flat)
- The duplicate email check also updates: `_payload: contact.email` → `_payload: email`

**Duplicate check update:**

```yaml
query:
  lowercase_email:
    _string.toLowerCase:
      _string.trim:
        _if_none:
          - _payload: email
          - ""
```

(was `_payload: contact.email`)

**Event logging updates:**
Same pattern as update-contact — all `_payload: contact.*` → flat.

## Acceptance Criteria

- Both `update-contact.yaml` and `create-contact.yaml` use pipeline update syntax
- All data objects use `$mergeObjects` with `$ifNull` fallback
- `profile.name` computed in separate `$set` stage
- No `_module.var: components.profile_set_fields` or `components.attributes_set_fields` references remain
- `request_stages.write` replaces per-operation stage vars
- All `_payload: contact.*` references updated to flat `_payload: *`
- Filter, duplicate check, and event logging payload references updated

## Files

- `modules/contacts/api/update-contact.yaml` — **modify** — rewrite to pipeline update with $mergeObjects
- `modules/contacts/api/create-contact.yaml` — **modify** — rewrite to pipeline update with $mergeObjects

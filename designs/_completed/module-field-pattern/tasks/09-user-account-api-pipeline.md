# Task 9: Rewrite user-account APIs to Pipeline Update with $mergeObjects

## Context

Task 8 flattened the user-account state namespace. API payloads now send `_payload: profile` (flat object) instead of `_payload: contact.profile.*` (individual fields). The APIs currently use a shared `api/profile-set-fields.yaml` file that maps individual profile fields with `_payload: contact.profile.*` paths. This task rewrites to pipeline update syntax with `$mergeObjects`.

## Task

### 1. Rewrite `api/update-profile.yaml`

**Current pattern:**

```yaml
- id: update
  type: MongoDBUpdateOne
  properties:
    filter:
      _id:
        _user: id
    update:
      $set:
        _ref: api/profile-set-fields.yaml
```

**New pattern:**

```yaml
- id: update
  type: MongoDBUpdateOne
  properties:
    filter:
      _id:
        _user: id
    update:
      _build.array.concat:
        # Stage 1: Merge profile
        - - $set:
              profile:
                $mergeObjects:
                  - $ifNull:
                      - "$$ROOT.profile"
                      - {}
                  - _payload: profile
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

- Pipeline update syntax replaces `$set` document syntax
- `$mergeObjects` replaces per-field mapping — preserves fields like `profile_created`, `avatar_color`, `picture`
- `profile.name` computed in separate stage
- No more `_ref: api/profile-set-fields.yaml`
- `request_stages.write` added for consumer extensibility

**Validation update:** The existing validation checks `_payload: contact.profile.given_name` and `_payload: contact.profile.family_name`. Update to:

```yaml
- :if:
    _or:
      - _eq:
          - _payload: profile.given_name
          - null
      - _eq:
          - _payload: profile.family_name
          - null
  :then:
    :reject: Missing required profile fields.
```

### 2. Rewrite `api/create-profile.yaml`

Same pattern as update, plus setting `profile.profile_created: true`:

```yaml
update:
  _build.array.concat:
    - - $set:
          profile:
            $mergeObjects:
              - $ifNull:
                  - "$$ROOT.profile"
                  - {}
              - _payload: profile
          updated:
            _ref:
              module: events
              component: change_stamp
    - - $set:
          profile.name:
            $concat:
              - $trim:
                  input: "$profile.given_name"
              - " "
              - $trim:
                  input: "$profile.family_name"
          profile.profile_created: true
    - _module.var: request_stages.write
```

Note: `profile.profile_created: true` is set in the second stage alongside `profile.name` — both are derived/internal fields set after the merge.

Same validation update as update-profile.

### 3. Delete `api/profile-set-fields.yaml`

This shared file is no longer needed — the `$mergeObjects` pattern replaces the per-field mapping.

### 4. Update event logging

Both APIs have event logging that references the updated user. The current pattern fetches `updated_user` after the update and passes it to the event. The payload ref `_payload: contact.profile.*` doesn't appear in the event section (it uses `_result: updated_user`), so minimal changes needed. Just verify no `contact.*` references remain.

## Acceptance Criteria

- Both `update-profile.yaml` and `create-profile.yaml` use pipeline update syntax
- `profile` uses `$mergeObjects` with `$ifNull` fallback
- `profile.name` computed in separate `$set` stage
- Validation uses `_payload: profile.given_name` / `_payload: profile.family_name` (not `contact.*`)
- `api/profile-set-fields.yaml` is deleted
- `request_stages.write` appended for consumer extensibility
- No `_payload: contact.*` references remain

## Files

- `modules/user-account/api/update-profile.yaml` — **modify** — rewrite to pipeline update
- `modules/user-account/api/create-profile.yaml` — **modify** — rewrite to pipeline update
- `modules/user-account/api/profile-set-fields.yaml` — **delete** — no longer needed

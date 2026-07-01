# Task 3: Rewrite user-admin APIs to Pipeline Update with $mergeObjects

## Context

Task 2 flattened the user-admin state namespace. API payloads now send flat keys (`_payload: profile`, `_payload: global_attributes`, etc.) instead of nested `_payload: user.profile.*`. The APIs currently use `_object.assign` with individual `profile.*` field mappings and `_module.var: components.profile_set_fields` for per-field writes. This task rewrites them to use MongoDB pipeline update syntax with `$mergeObjects` for whole-object saves.

## Task

### 1. Rewrite `api/update-user.yaml`

Replace the existing `$set` with `_object.assign` pattern with a two-stage pipeline:

**Stage 1: Merge data objects**

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
    - - $set:
          _object.assign:
            - profile.name:
                $concat:
                  - $trim:
                      input: "$profile.given_name"
                  - " "
                  - $trim:
                      input: "$profile.family_name"
            - _object.defineProperty:
                on: {}
                key:
                  _string.concat:
                    ["apps.", { _module.var: app_name }, ".disabled"]
                descriptor:
                  value:
                    _if_none:
                      - _payload: disabled
                      - false
            - _object.defineProperty:
                on: {}
                key:
                  _string.concat: ["apps.", { _module.var: app_name }, ".roles"]
                descriptor:
                  value:
                    _payload: roles
            - _object.defineProperty:
                on: {}
                key:
                  _string.concat:
                    ["apps.", { _module.var: app_name }, ".invite.open"]
                descriptor:
                  value:
                    _if_none:
                      - _payload: invite.open
                      - false
            - _object.defineProperty:
                on: {}
                key:
                  _string.concat:
                    ["apps.", { _module.var: app_name }, ".app_attributes"]
                descriptor:
                  value:
                    $mergeObjects:
                      - _string.concat:
                          - "$apps."
                          - _module.var: app_name
                          - ".app_attributes"
                      - _payload: app_attributes
    # Consumer pipeline stages
    - _module.var: request_stages.write
```

Key changes:

- `profile` uses `$mergeObjects` with `$ifNull` fallback — merges payload onto existing, preserving fields like `profile_created` and `profile.avatar_color`
- `global_attributes` same pattern
- `app_attributes` same `$mergeObjects` pattern with dynamic key
- `profile.name` computed in a **separate $set stage** after merge (sees merged values)
- No more `_module.var: components.profile_set_fields` — eliminated, whole-object merge replaces per-field mapping
- No more individual `profile.given_name`, `profile.family_name`, `profile.avatar_color`, `profile.picture` fields — they come in via the merge
- `request_stages.write` replaces `request_stages.update_user`

Also update the payload references in the event logging section:

- `_payload: user.profile.name` → `_payload: profile.name` (but since profile.name is computed server-side, use `_step: update.value.profile.name` or just pass the name from state)
- `_payload: user.email` → `_payload: email`
- `_payload: user._id` → `_payload: _id`

### 2. Rewrite `api/invite-user.yaml`

Same pipeline pattern. The invite uses `upsert: true` so `$ifNull` handles both insert (no existing doc) and update (existing doc) cases:

```yaml
update:
  _build.array.concat:
    - - $set:
          _id:
            $ifNull:
              - $_id
              - _uuid: true
          email:
            $ifNull:
              - $email
              - _string.trim:
                  _if_none:
                    - _payload: email
                    - ""
          lowercase_email:
            $ifNull:
              - $lowercase_email
              - _string.toLowerCase:
                  _string.trim:
                    _if_none:
                      - _payload: email
                      - ""
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
          created:
            $ifNull:
              - $created
              - _ref:
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
          # app-scoped fields (same _object.defineProperty pattern)
          ...
    - _module.var: request_stages.write
```

Key changes:

- Same `$mergeObjects` pattern for `profile` and `global_attributes`
- `created` preserved with `$ifNull` (only set on first insert)
- `request_stages.write` replaces `request_stages.invite_user`
- No `components.profile_set_fields`
- Payload refs updated from `_payload: user.*` to `_payload: *` (flat)

### 3. Update payload references in event logging

Both APIs reference payload fields in the event display section. Update all `_payload: user.*` to `_payload: *`:

- `_payload: user.profile.name` → compute from `_payload: profile` or use step result
- `_payload: user.email` → `_payload: email`
- `_payload: user._id` → `_payload: _id`

## Acceptance Criteria

- Both `update-user.yaml` and `invite-user.yaml` use pipeline update syntax (array of `$set` stages)
- All data objects (`profile`, `global_attributes`, `app_attributes`) use `$mergeObjects` with `$ifNull` fallback
- `profile.name` is computed in a separate `$set` stage after the merge stage
- No `_module.var: components.profile_set_fields` references remain
- `request_stages.write` replaces per-operation stage vars (`request_stages.update_user`, `request_stages.invite_user`)
- All `_payload: user.*` references updated to flat `_payload: *`
- Event logging payload references updated

## Files

- `modules/user-admin/api/update-user.yaml` — **modify** — rewrite to pipeline update with $mergeObjects
- `modules/user-admin/api/invite-user.yaml` — **modify** — rewrite to pipeline update with $mergeObjects

## Notes

- The `$mergeObjects` approach means consumer-provided fields in `profile` (like `phone_number`, `department`) are automatically saved without needing `profile_set_fields`. This is the key simplification.
- The title field (`profile.title`) is also included via the merge — no need for conditional `_build.if` in the API anymore.
- `resend-invite.yaml` doesn't write profile data, just re-sends the notification. It may need minor payload ref updates if it reads `user.*`.

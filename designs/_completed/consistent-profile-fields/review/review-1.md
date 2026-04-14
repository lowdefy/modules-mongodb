# Review 1 — Structural Completeness and Technical Correctness

## Missing File Changes

### 1. `create-profile.yaml` not listed in user-account changes

> **Resolved.** The design's API composition pattern now uses `_build.object.assign` (not runtime `_object.assign`), so `profile-set-fields.yaml` resolves to a flat object at build time. `create-profile.yaml` needs no changes — its existing `_build.object.assign` merge with `profile.profile_created` continues to work.

`modules/user-account/api/create-profile.yaml` (lines 24-27) uses `_build.object.assign` to merge the `_ref: profile-set-fields.yaml` result with `{profile.profile_created: true}`:

```yaml
$set:
  _build.object.assign:
    - _ref: profile-set-fields.yaml
    - profile.profile_created: true
```

After the design's changes, `profile-set-fields.yaml` will return `_object.assign: [...]` (a runtime operator) instead of a flat object. At build time, `_build.object.assign` will merge `{_object.assign: [...]}` with `{profile.profile_created: true}`, producing an object with both a runtime operator key and a plain key. Lowdefy treats an object with an operator key as that operator, so `profile.profile_created` would be silently dropped.

**Fix:** Add `create-profile.yaml` to the changes table. Change it to use runtime `_object.assign` so both the ref result and `profile.profile_created` are merged at runtime:

```yaml
$set:
  _object.assign:
    - _ref: profile-set-fields.yaml
    - profile.profile_created: true
```

### 2. `create-contact.yaml` structural mismatch with shared `set_fields.yaml`

> **Resolved.** Adopted option (a) — restructure `create-contact.yaml` from `MongoDBInsertOne` to `MongoDBUpdateOne` with `upsert: true` and a `$set` aggregation pipeline stage, following the existing `invite-user.yaml` pattern. Use `$ifNull` for insert-only fields (`_id`, `created`). Flat dot-notation keys allow direct reuse of shared `set_fields.yaml`.

The shared `set_fields.yaml` uses flat dot-notation keys (`profile.work_phone`, `profile.department`) designed for `$set` operations. But `create-contact.yaml` (lines 17-96) uses `MongoDBInsertOne` with a nested doc structure:

```yaml
profile:
  name: ...
  title: ...
  given_name: ...
  work_phone: ... # nested, not "profile.work_phone"
```

You cannot merge flat `$set`-style keys (`profile.work_phone: value`) into a nested `profile: {name: ..., title: ...}` doc with `_object.assign` — the flat key becomes a literal top-level key `"profile.work_phone"`, not a nested property.

**Options:**

- **(a)** Restructure `create-contact.yaml` to use `MongoDBUpdateOne` with `upsert: true` + `$set`, matching the update API pattern. This allows reusing `set_fields.yaml` directly.
- **(b)** Create a second shared file (`insert_fields.yaml`) with nested structure for insert operations.
- **(c)** Keep create hardcoded and only apply the shared `set_fields` to the update API. Document this explicitly.

The design should choose an approach and document it. Option (a) is cleanest — both contacts APIs would follow the same flat `$set` pattern.

### 3. `updated` change_stamp field not mentioned in design patterns

> **Resolved.** Added `updated: change_stamp` to the core fields in the API composition pattern.

`profile-set-fields.yaml` (lines 60-63) includes:

```yaml
updated:
  _ref:
    module: events
    component: change_stamp
```

Similarly, `update-contact.yaml` (lines 70-73) includes the same `updated` change_stamp. The design's API composition pattern (lines 332-362) doesn't show this field. It must be preserved as part of the core `$set` fields — it's the audit trail timestamp.

**Fix:** Include `updated: change_stamp` in the core fields section of the API pattern.

## Layout and Content Regressions

### 4. Contacts "Details" divider lost

> **Rejected.** The shared file is a consumer-app choice, not mandatory. If the contacts consumer wants a divider, it can reference a contacts-specific `form_fields.yaml` instead of the shared one. The `components.profile_fields` var mechanism already supports per-module customization at the consumer level.

`form_contact.yaml` (lines 46-49) has a Divider with title "Details" between the phone fields and department/job_title/birthday:

```yaml
- id: divider_details
  type: Divider
  properties:
    title: Details
```

The shared `form_fields.yaml` (design lines 152-177) lists all extended fields sequentially without this divider. After the change, contacts would lose this visual grouping. If the divider is still desired, it either needs to be part of the shared file or added as a contacts-specific element between the injected profile fields and the notes section.

### 5. Phone field `defaultRegion` and placeholders dropped

> **Rejected.** The shared file lives in the consumer app (`modules/shared/`), so `defaultRegion`, placeholders, and other app-specific properties are the consumer's responsibility. The design's example is illustrative, not prescriptive. The current `ZA` value is actually wrong for demo (should be CA).

user-account's phone fields (`form_profile.yaml` lines 87-88, 95-96) include `defaultRegion: ZA` and placeholder text:

```yaml
properties:
  title: Work Number
  defaultRegion: ZA
  placeholder: 11 001 2233
```

The shared `form_fields.yaml` omits `defaultRegion` and `placeholder`. If these are app-specific (ZA = South Africa), the consumer's shared file should include them. If they're intentionally dropped, the design should note this.

### 6. Phone field label normalization not acknowledged

> **Resolved.** Added Decision #8 documenting the intentional label change from "Work Phone"/"Mobile Phone" to "Work Number"/"Mobile Number".

user-account uses "Work Number" / "Mobile Number" (`form_profile.yaml` lines 86, 94). contacts uses "Work Phone" / "Mobile Phone" (`form_contact.yaml` lines 41, 45). The shared file picks user-account's labels ("Work Number" / "Mobile Number"). This is a user-facing label change for the contacts module that should be documented as intentional.

## Structural Gaps

### 7. `request_stages` injection points in contacts APIs

> **Resolved.** Added "Preserve `request_stages` injection point" note to both contacts API entries in the changes table.

`update-contact.yaml` (lines 74-76) has a `request_stages.update_contact` injection point for additional MongoDB pipeline stages:

```yaml
- _module.var:
    key: request_stages.update_contact
    default: []
```

Similarly, `create-contact.yaml` (lines 94-96) has `request_stages.insert_contact`. The design focuses on profile field changes but should note that these existing injection points must be preserved in the refactored APIs.

### 8. Contacts module not in consumer app

> **Resolved.** Clarified the contacts entry in the consumer app changes table as "Future/planned — the demo consumer app does not currently include the contacts module."

The design's consumer app example (lines 135-147) shows a contacts module entry in `modules.yaml`, but the demo consumer app (`apps/demo/modules.yaml`) does not currently include contacts. The design should clarify this is a future/planned entry, not an existing one to modify.

## Technical Patterns

### 9. `_array.map` is a novel pattern in this codebase

> **Rejected.** `_array.map` is valid Lowdefy code. The codebase happens not to use it yet, but that doesn't require special validation.

The view fields composition (design lines 386-401) relies on `_array.map` with `_function`/`__args`/`_get`. While `_array.filter` with `_function` callbacks is used in the codebase (e.g., `get_all_users.yaml` line 86-95), `_array.map` does not appear in any existing module code. The pattern should be validated with a Lowdefy build/runtime test before committing to it across all view components.

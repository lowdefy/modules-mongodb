# Contact Fields & Data Model

How contact documents are structured in the `user_contacts` collection — the unified person record shared across contacts, users, and invites.

## Pattern

All people live in one collection: `user_contacts`. A "contact" is any person in the system. A contact becomes a "user" when `apps.{app_name}.is_user` is set to true. This unified model avoids data migration when promoting contacts to users and de-duplicates by `lowercase_email`.

The document has four layers: **root fields** (identity + flags), **profile** (display name, phone, job info — the person), **global_attributes** (cross-app data like company links), and **apps.{app_name}** (per-app roles, access, invite state). Each layer has different ownership rules — contacts module owns profile and global_attributes, user-admin module owns the apps layer, and email/lowercase_email are immutable after creation.

Fields are extensible via `_module.var` injection. The contacts module defines core profile fields (given_name, family_name, email); consuming apps inject extended fields (work_phone, mobile_phone, job_title, department, birthday) through `components.profile_set_fields` and `components.profile_fields`. This means the form, API, and view all stay in sync — the same var controls what's collected, stored, and displayed.

## Document Schema

### Root fields

| Field | Type | Set by | Mutable | Notes |
|---|---|---|---|---|
| `_id` | UUID | create | No | `$ifNull` on upsert to preserve |
| `email` | String | create | No | Case-preserved original |
| `lowercase_email` | String | create | No | Unique index, used for dedup |
| `verified` | Boolean | create | Yes | Email verification status |
| `hidden` | Boolean | create | Yes | Excluded from list queries |
| `disabled` | Boolean | create | Yes | Global disable flag |
| `created` | change_stamp | create | No | `$ifNull` / `$setOnInsert` guarded |
| `updated` | change_stamp | every write | Yes | Always set unconditionally |

### profile (the person)

| Field | Type | Notes |
|---|---|---|
| `profile.name` | String | **Computed**: `given_name + " " + family_name` — never set from user input |
| `profile.picture` | String | **Auto-generated**: DiceBear initials URL seeded by name |
| `profile.given_name` | String | First name (required) |
| `profile.family_name` | String | Last name (required) |
| `profile.title` | String | Honorific (Mr/Ms/Dr/Prof) — only if `show_title` var is true |
| `profile.mobile_phone` | PhoneObject | `{ input, region: { name, code, dial_code }, phone_number }` |
| `profile.work_phone` | PhoneObject | Same structure as mobile_phone |
| `profile.birthday` | Date | Nullable |
| `profile.department` | String | Nullable |
| `profile.job_title` | String | Nullable |

Phone, birthday, department, and job_title are **not core** — they're injected by consuming apps via `components.profile_set_fields` and `components.profile_fields`.

### global_attributes (cross-app)

| Field | Type | Notes |
|---|---|---|
| `global_attributes.company_ids` | String[] | References to `companies._id` — a contact can belong to multiple companies |
| `global_attributes.internal_details` | String | Free-text notes field |

On update, `company_ids` can be replaced (contacts module) or union-merged via `$setUnion` (to never lose existing links).

### apps.{app_name} (per-app access)

| Field | Type | Notes |
|---|---|---|
| `apps.{app_name}.is_user` | Boolean | `true` = has app access; blocks contact-edit (must use user-admin) |
| `apps.{app_name}.disabled` | Boolean | Per-app disable (independent of global `disabled`) |
| `apps.{app_name}.roles` | String[] | Role names for this app (e.g., `["admin", "procurement-lead"]`) |
| `apps.{app_name}.invite.open` | Boolean | `true` = invite link is active/pending |
| `apps.{app_name}.sign_up` | Object | `{ timestamp, method }` — set when user accepts invite |
| `apps.{app_name}.app_attributes` | Object | App-specific custom data, merged via `$mergeObjects` |

The `apps` layer is set by user-admin (invite-user, update-user). The contacts module never touches it. The `is_user` guard in update-contact's filter (`apps.{app_name}.is_user: { $ne: true }`) prevents editing user records through the contacts form.

## Computed Fields

**`profile.name`** — always recomputed from given_name + family_name on every create/update:
```yaml
profile.name:
  _string.concat:
    - _if_none:
        - _payload: contact.profile.given_name
        - ""
    - " "
    - _if_none:
        - _payload: contact.profile.family_name
        - ""
```

**`profile.picture`** — DiceBear initials avatar, seeded by the computed name:
```yaml
profile.picture:
  _string.concat:
    - "https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed="
    - _if_none:
        - _payload: contact.profile.given_name
        - ""
    - " "
    - _if_none:
        - _payload: contact.profile.family_name
        - ""
```

## Data Flow

`Form collects given_name + family_name → CallAPI payload wraps _state: contact → create-contact API computes name + picture → $set with _object.assign merges core fields + _module.var: components.profile_set_fields + request_stages → stored in user_contacts → table renders profile.name with profile.picture avatar → detail page shows profile via DataView + _module.var: components.profile_view_config`

## Variations

**Contact vs User** — same collection, different access level:
- Contact: `apps` is empty or `is_user` is falsy. Editable via contacts module.
- User: `apps.{app_name}.is_user: true`. Editable only via user-admin module.

**Dedup on create** — FindOne by `lowercase_email`. If exists: skip insert, return existing `_id` with `existing: true`. If not: upsert with `$ifNull` guards on `_id` and `created`.

**Dynamic app-scoped fields** — user-admin uses `_object.defineProperty` to set paths like `apps.{app_name}.roles` where the app name comes from `_module.var: app_name`:
```yaml
- _object.defineProperty:
    on: {}
    key:
      _string.concat:
        ["apps.", { _module.var: app_name }, ".roles"]
    descriptor:
      value:
        _payload: user.roles
```

## Anti-patterns

- **Don't set email on update** — email and lowercase_email are immutable after creation. The update-contact API omits them entirely. The form shows email as read-only `Descriptions` during edit.
- **Don't set profile.name from user input** — it's always computed from given_name + family_name. Setting it directly causes name to diverge from its parts.
- **Don't edit user records through the contacts form** — the `is_user` guard in update-contact's filter prevents this. Use user-admin instead.
- **Don't hardcode profile fields in module APIs** — use `_module.var: components.profile_set_fields` for extended fields (phone, birthday, job_title, department). This keeps the module portable.
- **Don't replace `global_attributes` wholesale on update** — use `$mergeObjects` to merge, or update individual sub-fields. Replacing the whole object can lose `company_ids` added by other modules.

## Reference Files

- `docs/data-design/app-schema-example/user_contacts.yaml` — full schema definition with example documents and indexes
- `modules/contacts/api/create-contact.yaml` — create with dedup, computed fields, `$ifNull` guards, module var injection
- `modules/contacts/api/update-contact.yaml` — update with `is_user` guard, optimistic concurrency, immutable email
- `modules/contacts/components/form_contact.yaml` — form with `show_title` conditional, `profile_fields` injection, email disabled on edit
- `modules/contacts/components/view_contact.yaml` — detail view with DataView for profile, `profile_view_config` injection
- `modules/contacts/components/table_contacts.yaml` — AgGrid with avatar renderer, `table_columns` injection
- `modules/contacts/components/contact-selector.yaml` — reusable selector projecting `label: "name (email)"`, `value: _id`
- `modules/contacts/connections/contacts-collection.yaml` — MongoDBCollection on `user-contacts` with changeLog
- `modules/user-admin/api/invite-user.yaml` — sets `apps.{app_name}` layer with `_object.defineProperty` for dynamic paths
- `modules/user-account/api/profile-set-fields.yaml` — shared `$set` fields injected via `_module.var: components.profile_set_fields`

## Template

**Event display defaults** (`modules/{module}/defaults/event_display.yaml`):
```yaml
default:
  create-{entity}: "{{ user.profile.name }} created {{ target.name }}"
  update-{entity}: "{{ user.profile.name }} updated {{ target.name }}"
```

**Extended profile fields injection** (referenced as `_module.var: components.profile_set_fields`):
```yaml
# This file is _ref'd into the app's module vars for contacts/user-admin/user-account
profile.work_phone:
  _payload: {entity}.profile.work_phone
profile.mobile_phone:
  _payload: {entity}.profile.mobile_phone
profile.birthday:
  _payload: {entity}.profile.birthday
profile.job_title:
  _string.trim:
    _if_none:
      - _payload: {entity}.profile.job_title
      - ""
profile.department:
  _string.trim:
    _if_none:
      - _payload: {entity}.profile.department
      - ""
```

**Extended profile form fields** (referenced as `_module.var: components.profile_fields`):
```yaml
- id: {entity}.profile.work_phone
  type: PhoneNumberInput
  properties:
    title: Work Phone
    defaultRegion: {REGION_CODE}
- id: {entity}.profile.mobile_phone
  type: PhoneNumberInput
  properties:
    title: Mobile Phone
    defaultRegion: {REGION_CODE}
- id: {entity}.profile.job_title
  type: TextInput
  properties:
    title: Job Title
- id: {entity}.profile.department
  type: TextInput
  properties:
    title: Department
- id: {entity}.profile.birthday
  type: DateSelector
  properties:
    title: Birthday
```

## Checklist

- [ ] `email` and `lowercase_email` set only on create, omitted from update `$set`
- [ ] `profile.name` computed from `given_name + " " + family_name` — never from user input
- [ ] `profile.picture` auto-generated from DiceBear initials seeded by computed name
- [ ] `created` guarded with `$ifNull` or `$setOnInsert` on upsert
- [ ] Extended fields (phone, job_title, etc.) injected via `_module.var: components.profile_set_fields`, not hardcoded
- [ ] Update filter includes `apps.{app_name}.is_user: { $ne: true }` guard in contacts module
- [ ] Form shows email as read-only `Descriptions` during edit (via `email_disabled` var)
- [ ] Selector projects `{ label: "name (email)", value: _id }` for dropdown display
- [ ] `global_attributes.company_ids` is an array — use `$mergeObjects` or field-level updates, not wholesale replace
- [ ] `apps.{app_name}` fields set only by user-admin module, never by contacts module

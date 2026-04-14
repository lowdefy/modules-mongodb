# Review 2 — Contacts Coverage and Edge Cases

## Contacts Module Gaps

### 1. "What this replaces" table only covers user-admin vars

> **Deferred to implementation.** Finalise the pattern with user-admin first, then extend the mapping table when updating contacts and user-account modules.

The mapping table (design lines 72-82) lists `components.profile_fields`, `components.profile_set_fields`, `components.profile_view_config`, `components.global_attributes_fields`, `components.app_attributes_fields`, `components.attributes_view_config`, and `request_stages.update_user` / `request_stages.invite_user`. These are all user-admin vars.

Contacts has four additional vars not mentioned:

| Contacts var                       | Current purpose                                             | New equivalent? |
| ---------------------------------- | ----------------------------------------------------------- | --------------- |
| `components.form_fields`           | Full form component override (default: `form_contact.yaml`) | Not mapped      |
| `components.detail_fields`         | Full view component override (default: `view_contact.yaml`) | Not mapped      |
| `components.form_attributes`       | Single attributes section (details like notes, company)     | Not mapped      |
| `components.attributes_set_fields` | `$set` field map for attributes on write                    | Not mapped      |

Similarly, contacts' `request_stages` use different names: `request_stages.update_contact` and `request_stages.insert_contact` (not `update_user`/`invite_user`).

**Fix:** Extend the table with a contacts-specific section, or add a per-module mapping in the Implementation Scope section showing old → new for each module.

### 2. Contacts' single `form_attributes` doesn't map to the dual global/app pattern

The design proposes two separate field groups: `fields.global_attributes` and `fields.app_attributes`. User-admin has both. But contacts uses a single `components.form_attributes` var for all additional detail fields. The demo's contacts `attributes_form_fields.yaml` only uses `contact.global_attributes.internal_details` — it has no `app_attributes` at all.

The design doesn't explain how contacts' single attributes bucket maps to the new dual-var structure. Does contacts only get `fields.global_attributes`? Does `fields.app_attributes` stay null? What happens to `components.attributes_set_fields` — does it fold into `request_stages.write`?

**Fix:** Add a note clarifying the contacts mapping. Likely: contacts uses `fields.global_attributes` only, `fields.app_attributes` defaults to null. `components.attributes_set_fields` is eliminated (same as `profile_set_fields`) since the API does whole-object save via `$mergeObjects`.

## Build-Time Safety

### 3. `_build.array.concat` with null field vars in combined attributes view

The combined attributes view (design lines 277-281) concatenates both field groups:

```yaml
fields:
  _build.array.concat:
    - _module.var: fields.global_attributes
    - _module.var: fields.app_attributes
```

The `visible` check (lines 261-267) hides the component when **both** are null. But when only one is provided (e.g. contacts provides `global_attributes` only), `_build.array.concat` receives one array and one null. The existing module code guards against this — `form_global_attributes.yaml` and `form_app_attributes.yaml` use `_build.array.length` + `_build.gt` checks before concatenating.

**Fix:** Wrap each var in a null guard:

```yaml
fields:
  _build.array.concat:
    - _build.if:
        test:
          _build.ne:
            - _module.var: fields.global_attributes
            - null
        then:
          _module.var: fields.global_attributes
        else: []
    - _build.if:
        test:
          _build.ne:
            - _module.var: fields.app_attributes
            - null
        then:
          _module.var: fields.app_attributes
        else: []
```

Or default both vars to `[]` in the manifest so they're never null.

## Implementation Scope

### 4. User-account API migration is understated

> **Resolved.** Updated implementation scope table to call out user-account's architectural change: switch from document-style `$set` to pipeline syntax with `$mergeObjects`, add `request_stages.write` var, eliminate `profile-set-fields.yaml`.

The implementation scope table (design line 397) says user-account needs "Same state root change, update form and view components, update API." This undersells the API change.

User-admin and contacts already use pipeline-style updates with `_build.array.concat` and `request_stages` injection (`update-user.yaml`, `update-contact.yaml`). User-account uses a structurally different approach:

- Simple document-style `$set` with `_ref: api/profile-set-fields.yaml` for per-field mapping (`update-profile.yaml:24`)
- No `request_stages` vars in the manifest at all
- `create-profile.yaml` uses `_build.object.assign` for field assembly

Switching user-account to pipeline style means:

- Converting from document-style `$set` to pipeline array with `$mergeObjects`
- Adding `request_stages.write` to the manifest (new var section)
- Eliminating `profile-set-fields.yaml`
- Converting `create-profile.yaml` to the same pattern

This is a larger architectural change for user-account than for the other two modules, which already have the pipeline plumbing.

**Fix:** Update the implementation scope table to call out user-account's API change as "Switch from document-style `$set` to pipeline syntax, add `request_stages` var" rather than the generic "update API."

# Task 7: Update `module.lowdefy.yaml` with new vars and file registrations

## Context

`modules/contacts/module.lowdefy.yaml` is the contacts module's manifest. After Tasks 4 and 6 land, three new files exist in the module tree (Task 5 was obsoleted by review-2 — the form reuses the existing `validate/email.yaml`):

- `requests/search_contacts.yaml` (Task 4)
- `requests/get_contacts_data.yaml` (Task 4)
- `components/form_contact_short.yaml.njk` (Task 6)

The manifest needs to register these, declare the three new module-level vars (`verified`, `all_contacts`, `phone_label`), and leave the `components.contact-selector` entry untouched (Task 8 swaps its `_ref` target from `.yaml` to `.yaml.njk` as part of the wrapper swap).

## Task

**In `modules/contacts/module.lowdefy.yaml`, declare the three new module-level vars** under the `vars:` block, preserving the existing vars:

```yaml
vars:
  # ... existing vars (label, label_plural, app_name, event_display, fields, components, request_stages, filter_requests, avatar_colors) ...
  verified:
    type: string
    enum: [off, trusted, untrusted]
    default: off
    description: |
      Contact verification mode for the contact-selector picker.
      - off: no verification UI or payload writes.
      - trusted: contacts created/edited via the picker are marked verified; unverified rows render a Verify button.
      - untrusted: contacts created via the picker are marked unverified; apps provide their own verify flow.
  all_contacts:
    type: boolean
    default: false
    description: When true, the picker searches across all companies. When false, scope to the user's global_attributes.company_ids.
  phone_label:
    type: boolean
    default: false
    description: When true, the search results label includes phone numbers.
```

**Add `get_contact` to the existing `request_stages:` group** so Task 3's parameterised `get_contact.yaml` has a default empty injection point:

```yaml
vars:
  # ... existing request_stages group has get_all_contacts, write, selector, filter_match ...
  request_stages:
    type: object
    properties:
      # ... existing keys ...
      get_contact:
        type: array
        default: []
        description: Additional pipeline stages appended to get_contact (e.g. $lookup, $addFields).
```

**Register the new request files** in the `requests:` block (file list form):

```yaml
requests:
  # ... existing requests (get_all_contacts, get_contact, get_contact_companies, get_contact_excel_data) ...
  - _ref: requests/search_contacts.yaml
  - _ref: requests/get_contacts_data.yaml
```

Actually — check the existing shape. If the requests list is not a top-level manifest section (requests usually live on pages/components, not module-manifest-level), SKIP registering them here. They're pulled in via `_ref` from the wrapper (Task 8); explicit manifest registration is only needed if the module ships them as shared exports. Verify by looking at how `get_all_contacts`, `get_contact`, etc. are registered in the current manifest, and match that pattern.

**Remove the stale reference to `get_contacts_for_selector.yaml`** — check if the manifest references it and, if so, delete that line. The file itself is deleted in Task 8.

**Leave `components.contact-selector` entry untouched.** Task 8 swaps the `_ref: components/contact-selector.yaml` → `_ref: components/contact-selector.yaml.njk`; we could do it here, but keeping it atomic with the wrapper swap in Task 8 is cleaner (the old `.yaml` file still exists until Task 8 deletes it).

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` succeeds.
- `lowdefy build` reports the three new vars as valid.
- `modules/contacts/module.lowdefy.yaml` references only files that exist at this point in the task sequence (no references to Task 8's wrapper yet — that comes next).
- Existing behaviour of the contacts module is unchanged; the module still loads and its pages still work.

## Files

- `modules/contacts/module.lowdefy.yaml` — modify — add three new vars; register/deregister requests as the manifest pattern requires; leave `components.contact-selector` entry untouched

## Notes

- Before editing, read the existing manifest top-to-bottom to match the shape of `vars:`, `requests:`, etc. The design calls out these three module-level vars; don't add `form`, `form_blocks`, or `form_required` here — those are per-call wrapper vars (see design decision #3's per-call table).
- If `get_contacts_for_selector.yaml` is NOT referenced in `module.lowdefy.yaml` today (which is likely — it's a pure request file that's `_ref`'d from the old wrapper), no registration removal is needed. Just confirm by grep.
- The new vars' `description:` text becomes the module's public documentation. Keep wording consistent with the design's decision #7 (`verified` tri-state) and decision #3 (table).

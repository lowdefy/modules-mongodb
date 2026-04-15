# Review 1 — Completeness and Consistency

## Var Summary Gaps

### 1. `attributes_set_fields` missing from Module Var Summary

> **Resolved.** Added "New vars (contacts only)" table to section 6 with `attributes_set_fields`.

The file changes table (contacts section) introduces `components.attributes_set_fields` — a new var for the contacts API to replace hardcoded `internal_details` set fields. But section 6 (Module Var Summary) only lists `attributes_view_config` and `view_extra` as new vars for "all modules."

`attributes_set_fields` is contacts-specific and should be listed under a contacts-only table, similar to how `view_access_tile` is listed under user-admin only.

**Fix:** Add a "New vars (contacts only)" table to section 6 with `attributes_set_fields` and `form_attributes` (already exists but now load-bearing for `internal_details`).

### 2. User-admin view page needs `profile_view_config`

> **Resolved.** Added `profile_view_config` to user-admin module.lowdefy.yaml var description and consumer vars.yaml file changes. User-admin references the same shared `view_config.yaml` as user-account.

The user-admin `vars.yaml` defines `profile_fields` and `profile_set_fields` but NOT `profile_view_config`. The DataDescriptions formConfig logic (section 2, lines 338-362) falls through to `else: null` when `profile_view_config` is null, triggering auto-render mode.

Auto-render derives labels from keys — `given_name` becomes "Given Name" instead of "First Name", `family_name` becomes "Family Name" instead of "Last Name". User-account and contacts both have `profile_view_config` set (via shared `view_config.yaml`), so they render correct labels. The new user-admin view page would be the odd one out.

The consumer file changes table lists additions to `user-account/vars.yaml` and `user-admin/vars.yaml` for `attributes_view_config`, but doesn't mention adding `profile_view_config` to user-admin.

**Fix:** Add `profile_view_config: _ref: modules/shared/profile/view_config.yaml` to the user-admin vars changes, or document that auto-render is intentionally acceptable for user-admin.

## Request Dependency

### 3. `get_my_profile` request should be unconditional on user-account

> **Resolved.** Made `get_my_profile` unconditional. Updated section 3 (data access note) and section 5 (user-account page details) to describe the request as always-present, serving both the identity header signed-up date and the optional attributes section.

The design introduces signed-up date display in the user-account identity header `extra` (lines 234-247), sourcing from `_request: get_my_profile.0.sign_up.timestamp`. Section 5 (line 522) describes this request as conditional: "When `attributes_view_config` is provided, the profile page needs a request to fetch the full user document."

The signed-up date also depends on this request. If a consumer provides no `attributes_view_config`, the request would be absent, and the signed-up date silently disappears (the `_ne: null` visibility check fails gracefully). But the identity header YAML is hardcoded with `_request: get_my_profile` references — these resolve to null without the request, which works but means the signed-up date feature is silently coupled to the attributes feature.

Two options:

- **Make the request unconditional** — always fetch `get_my_profile` on the profile page. The user-account module already has a `user-contacts-collection` connection (`module.lowdefy.yaml` line 32). Minor query cost, signed-up date always works.
- **Move signed-up date into `view_extra`** — consumers who want it provide it alongside the request. But this undermines the identity header pattern.

**Suggested fix:** Make `get_my_profile` unconditional. A single `findOne` by `_user: sub` is negligible, and it makes the identity header self-contained.

## Underspecified Sections

### 4. Access sidebar tile has no implementation detail

> **Resolved.** Added full YAML sketch for `view_access.yaml` with data bindings — status tag (active/disabled/invite), role tags built from module var, signed-up date, and invite link.

The identity header (section 1), profile data (section 2), and attributes (section 3) all include full YAML with data bindings. The access sidebar tile for user-admin (section 5, lines 592-597) has only a wireframe and prose: "roles (as tags), active/disabled status, signed-up date, invite link (if pending)."

Missing details:

- Data bindings for roles (presumably `_state: user.apps.{app_name}.roles` — but needs the dynamic app path resolution like attributes)
- How roles render as tags (Tag blocks? Descriptions with a tag component?)
- Status derivation (is it `_state: user.disabled`? `_state: user.apps.{app_name}.disabled`?)
- Whether the access tile reuses the same signed-up/invite-link blocks from the identity header `extra`, or duplicates them

The `view_access.yaml` file is listed as new but its structure is undefined compared to other new files.

**Fix:** Add a YAML sketch for `view_access.yaml` with data bindings, or mark it as a detail to resolve during implementation.

## Breaking Changes

### 5. `internal_details` removal needs migration acknowledgment

> **Resolved.** Added breaking change migration note to decision 4. Updated contacts `form_contact.yaml` file changes to include the conditional "Details" divider wrapping `form_attributes`.

The contacts module currently provides `internal_details` out of the box — the view (conditional Notes), form (TextArea field with "Details" divider at `form_contact.yaml:72-80`), and both APIs (`create-contact.yaml:81`, `update-contact.yaml:58`) all hardcode it. Consumers get Notes functionality without any var configuration.

After this design, all three touchpoints require explicit consumer configuration:

- View: add `{key: "internal_details", title: "Notes"}` to `attributes_view_config`
- Form: inject TextArea via `components.form_attributes`
- API: provide set field mapping via `components.attributes_set_fields`

This is a breaking change for existing consumers. The rationale (decision 4) is sound — `internal_details` is a consumer attribute, not a module concept. But the Decisions section should note that this requires consumer migration and won't work out of the box after the change.

Additionally, the form position changes: `internal_details` currently sits between profile fields and companies (at `form_contact.yaml:72-80` with its own "Details" divider). After migration to `form_attributes`, it moves to whatever position `form_attributes` occupies (currently after the profile fields, line 82). The "Details" divider disappears — the module only wraps `form_attributes` if the design adds a conditional divider (mentioned in Resolved Question 2, but not in the contacts file changes).

**Fix:** Add a sentence to decision 4 acknowledging the consumer migration requirement. Ensure the contacts file changes include the conditional "Details" divider wrapping `form_attributes` (per Resolved Question 2).

### 6. Contacts `module.lowdefy.yaml` vars description needs updating

> **Resolved.** Added `attributes_set_fields` to contacts `module.lowdefy.yaml` file changes row.

The contacts module's vars description (line 33) lists overrideable components:

```
detail_fields, form_fields, form_attributes, profile_fields, profile_set_fields,
profile_view_config, table, filters, main_tiles, sidebar_tiles, download_columns
```

The new vars `attributes_view_config`, `view_extra`, and `attributes_set_fields` are not listed. The file changes table for contacts `module.lowdefy.yaml` only mentions adding `attributes_view_config` and `view_extra` — `attributes_set_fields` is again omitted.

**Fix:** Add all three new component vars to the contacts module.lowdefy.yaml file changes.

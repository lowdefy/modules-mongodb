# Task 2: Refactor user-account Form to Core + Injection Pattern

## Context

`modules/user-account/components/form_profile.yaml` currently hardcodes all profile fields: title, given_name, family_name, email (disabled TextInput), work_phone, mobile_phone, department, job_title, birthday. The avatar is at the top.

After this task, the form will have: avatar, conditional title (via `show_title` flag), core fields (given_name, family_name), email as plain text, and injected extended fields via `_module.var: components.profile_fields`.

The user-account pages reference this component via `_module.var: components.form_profile` with a default of `_ref: ../components/form_profile.yaml` (see `pages/edit-profile.yaml:31-33` and `pages/create-profile.yaml:41-43`). Those page references do NOT change — only the component file itself changes.

## Task

Rewrite `modules/user-account/components/form_profile.yaml` to use the core + injection pattern:

1. **Keep the avatar** at the top (unchanged).

2. **Replace the hardcoded blocks list** with `_build.array.concat`:
   - **Title (conditional):** Use `_build.if` on `_module.var: show_title`. When true, include the title Selector with `layout.span: 3`. When false, return `[]`.

   - **Core fields:** `given_name` (TextInput, required) with `layout.span` conditional on `show_title` (9 when true, 12 when false). `family_name` (TextInput, required, span 12).

   - **Email display:** Replace the disabled TextInput with a `Descriptions` block showing email as plain text:

     ```yaml
     - id: email_display
       type: Descriptions
       properties:
         bordered: false
         column: 1
         size: small
         items:
           - label: Email
             value:
               _state: contact.email
     ```

   - **Extended fields injection:**
     ```yaml
     - _module.var:
         key: components.profile_fields
         default: []
     ```

3. **Remove** the hardcoded work_phone, mobile_phone, department, job_title, birthday fields.

The current file structure:

```yaml
id: form_profile
type: Box
layout:
  gap: 8
style:
  margin: auto
blocks:
  # avatar (keep)
  # title (make conditional)
  # given_name (keep, adjust span)
  # family_name (keep)
  # email disabled TextInput (replace with Descriptions)
  # work_phone, mobile_phone, department, job_title, birthday (REMOVE — now injected)
```

## Acceptance Criteria

- Avatar block unchanged at top
- Title field appears only when `_module.var: show_title` is true, with `span: 3`
- `given_name` span is 9 when title is shown, 12 when not
- `family_name` always span 12
- Email displayed as `Descriptions` with `bordered: false`, not a disabled TextInput
- Extended fields injected via `_module.var: components.profile_fields` with default `[]`
- No hardcoded work_phone, mobile_phone, department, job_title, birthday fields
- `_build.array.concat` used to compose the blocks array

## Files

- `modules/user-account/components/form_profile.yaml` — modify — replace hardcoded fields with core + injection pattern

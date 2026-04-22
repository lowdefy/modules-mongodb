# Task 6: Add `form_contact_short.yaml.njk` default modal form

## Context

The `ContactSelector` wrapper (Task 8) renders its modal form as nested `blocks:`. By default it passes a `_ref` to `modules/contacts/components/form_contact_short.yaml.njk` — the 5-field form shipped with the module. Consumers who need something different override via the wrapper's `form_blocks` var (design decision #8).

The form binds its inputs to `{key}.profile.given_name`, `{key}.profile.family_name`, `{key}.email`, `{key}.profile.work_phone`, `{key}.profile.mobile_phone`, where `{key}` is a Nunjucks-interpolated prefix passed in by the wrapper (typically `{id}_contact`). Required flags are forwarded from the wrapper's `form_required` var. Email is disabled when editing (it's the dedup key; editing emails is a separate concern).

Task 5 ships `modules/contacts/validate/validate_email.yaml`; this form references it via `../validate/validate_email.yaml` to wire the email input's validation.

## Task

**Create `modules/contacts/components/form_contact_short.yaml.njk`.** Port the reference implementation's `form_contact_short.yaml.njk` (seen at `the reference implementation at <external-repo>/apps/<app>/pages/contacts/components/form_contact_short.yaml.njk`) with the following adaptations:

1. Top-level `id: form_contact`, `type: Box`, `layout: { contentGutter: 8 }`, `style: { margin: auto }`.
2. Five nested blocks:
   - `{{ key }}.profile.given_name` — TextInput, `span: 12`, title "First Name", `required` from `_var: required.given_name` (default `true`), disabled unless `new_contact === true`.
   - `{{ key }}.profile.family_name` — TextInput, `span: 12`, title "Last Name", `required` from `_var: required.family_name` (default `true`), disabled unless `new_contact === true`.
   - `{{ key }}.email` — TextInput, full width, title "Email", `required` from `_var: required.email` (default `false`), `validate: _ref: { path: ../validate/validate_email.yaml, vars: { field_name: {{ key }}.email } }`, disabled unless `new_contact === true`.
   - `{{ key }}.profile.work_phone` — PhoneNumberInput, `span: 12`, title "Work Number", `defaultRegion: ZA`, `placeholder: 11 001 2233`. Validate clause: warning when input length > 9 chars, error when `required.phones: true` and both work+mobile are blank. Disabled when `!new_contact && existing work_phone.input is non-empty` (see the reference implementation for the `_and` conditional shape).
   - `{{ key }}.profile.mobile_phone` — PhoneNumberInput, `span: 12`, title "Mobile Number", `defaultRegion: ZA`, `placeholder: 82 111 2222`. Same warning-length validate. Same required-phones clause. Same disabled conditional. Include the `label.extra` warning banner the reference implementation has (yellow text when length > 9).
3. Vars accepted (documented in a top comment block):
   - `key` (string, required) — state prefix for input ids
   - `new_contact` (boolean) — when `true`, inputs are enabled
   - `required` (object) — `{ given_name, family_name, email, phones, company_ids }` flags
   - `get_contact` (object) — raw loaded contact data used to decide whether to lock phone fields
   - `loading` (boolean) — request-details loading flag; wire through to input-block `loading` props if needed

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` succeeds.
- When Task 8 lands and a consumer opens the wrapper's Add modal, the five fields render with correct titles.
- Entering "not-an-email" in the email field shows the Task 5 validator's error.
- Opening the Edit modal disables email, first name, last name inputs; phone fields are disabled only if the existing contact already has a phone number (prevents wiping).
- Setting `required.phones: true` in the wrapper's `form_required` surfaces the "Please provide either a work number or a mobile number" error when both are blank.

## Files

- `modules/contacts/components/form_contact_short.yaml.njk` — create

## Notes

- File extension must be `.yaml.njk` — the `{{ key }}` interpolation requires Nunjucks.
- Top comment block documenting vars (the reference implementation does this). Keep the template declarative; no `_js` blocks unless absolutely needed for phone-input quirks.
- `PhoneNumberInput` is a built-in Lowdefy block type that ships with this project's Lowdefy version — confirmed via the module's existing components. If it's missing on the version used, swap to `TextInput` with a regex validate clause and note it in the task follow-up.
- Don't wire `onAddContact` / `onEditContact` actions in this file — those live on the wrapper (Task 8), not on the form. This form only provides inputs and validation.

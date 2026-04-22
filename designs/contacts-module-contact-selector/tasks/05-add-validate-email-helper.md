# Task 5: Add `validate_email.yaml` helper to the contacts module

## Context

The default modal form (Task 6) validates the email field. the reference implementation's version of this validator lives at `apps/shared/validate_email.yaml` and is referenced via `../shared/validate_email.yaml` relative to the form. This module doesn't have a shared validate directory outside itself, so the design bundles a local copy inside the contacts module at `modules/contacts/validate/validate_email.yaml`.

The validator is `_ref`'d from `form_contact_short.yaml.njk` (Task 6) with a `field_name` var so it can pull the current value from state.

## Task

**Create `modules/contacts/validate/validate_email.yaml`.** Minimal email validator — returns a Lowdefy `validate` array entry (status + message + pass):

```yaml
- message: Please provide a valid email address.
  status: error
  pass:
    _or:
      - _eq:
          - _state:
              _var: field_name
          - null
      - _eq:
          - _state:
              _var: field_name
          - ""
      - _regex:
          on:
            _state:
              _var: field_name
          pattern: '^[^\s@]+@[^\s@]+\.[^\s@]+$'
```

The `_or` wraps three cases: empty, null, or matching the basic email regex. Required-ness is enforced separately by the form's `required:` flag, not by this validator.

## Acceptance Criteria

- `pnpm ldf:b:i` in `apps/demo` succeeds.
- When Task 6 lands, the form's email field shows "Please provide a valid email address." for strings like `not-an-email` and clears for valid addresses or empty input.

## Files

- `modules/contacts/validate/validate_email.yaml` — create

## Notes

- Keep the regex deliberately loose — it's a client-side first-pass check, not RFC 5322 compliance. Server-side APIs (`create-contact`) normalise via `_string.toLowerCase` already.
- If a `validate/` subdirectory doesn't exist under `modules/contacts/`, create it.
- This file is NOT registered in `module.lowdefy.yaml` directly — it's pulled in via `_ref` from `form_contact_short.yaml.njk`. Module-manifest wiring happens in Task 7 if needed.

# Review 2 — Reuse existing `validate/email.yaml` instead of bundling a new `validate_email.yaml`

Single finding, scoped to Task 5 + references from Task 6, design decision #8, and the Files-changed list.

## Finding

### 1. The contacts module already ships `validate/email.yaml`; Task 5's new `validate_email.yaml` is redundant

`modules/contacts/validate/email.yaml` already exists on this branch and is identical to the copies in `user-admin`, `user-account`, and `companies`:

```yaml
- message: Please provide a valid email address.
  status: error
  pass:
    _or:
      - _regex: '^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$'
      - _eq:
          - _state:
              _var:
                key: field_name
                default: email
          - null
```

Current references:

- `modules/contacts/components/form_email.yaml:8` — `_ref: validate/email.yaml`
- `modules/user-admin/pages/check-invite-email.yaml:29`
- `modules/user-account/pages/login.yaml:81`
- `modules/companies/components/fields/contact.yaml:13`

The file already has the `field_name` var (defaults to `email`) the design wants, and it already handles the null/empty case via the second `_or` branch. The regex is stricter than the deliberately-loose one Task 5 proposes (`^[^\s@]+@[^\s@]+\.[^\s@]+$`), but "stricter" isn't a blocker — it still admits any valid email and rejects garbage.

The design's note at `design.md:270` says "this module doesn't ship that file today, so the design bundles a local `validate_email.yaml` inside the contacts module." That premise is wrong: the module does ship an email validator already, under the name `email.yaml`.

**Cross-module consolidation** (moving to `modules/shared/validate/email.yaml` and `_ref`ing via `../shared/...`) was considered and rejected in-session: Lowdefy modules are advertised as distributable by GitHub subpath (`source: "github:.../modules/contacts@v1"`), which would break `../shared/` resolution. The per-module duplication stands.

### Proposed fix

1. **Design #8 (`design.md:270`)** — rewrite the last sentence. Replace:

   > "`_ref: validate_email.yaml` is referenced via `../shared/...` — this module doesn't ship that file today, so the design bundles a local `validate_email.yaml` inside the contacts module."

   With:

   > "The email input uses `_ref: { path: ../validate/email.yaml, vars: { field_name: {{ key }}.email } }`, reusing the validator the contacts module already ships (identical to the user-admin / user-account / companies copies, per the per-module duplication policy documented in-session)."

2. **Files changed → New** — drop `modules/contacts/validate/validate_email.yaml`. Totals become **4 new, 2 deleted, 8 modified**.

3. **Task 5 (`05-add-validate-email-helper.md`)** — obsoleted. Mark the task as resolved ("no work required; use existing `modules/contacts/validate/email.yaml`"). Task 6's Depends-On on Task 5 drops.

4. **Task 6 (`06-add-default-contact-form.md`)** — update the two references:
   - Context paragraph: "Task 5 ships…" → "The existing `modules/contacts/validate/email.yaml` (already on the branch) is referenced via `../validate/email.yaml`."
   - Bullet on the email input's validate clause: `../validate/validate_email.yaml` → `../validate/email.yaml`.

5. **Task 7 (`07-update-module-manifest.md`)** — drop the `validate/validate_email.yaml` line from the Context list of new files.

6. **`tasks/tasks.md`** — drop Task 5 from the table; update ordering rationale (Form chain becomes just Task 6); Task 7 no longer depends on Task 5.

## Summary

Task 5 as specified creates a new file that duplicates an existing one in the same module. Switch the form to reference `../validate/email.yaml` and drop Task 5 from the plan. No impact on the wrapper (Task 8), the block (Task 2), or the manifest beyond pruning one bullet from Task 7's context.

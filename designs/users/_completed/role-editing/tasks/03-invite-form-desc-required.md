# Task 3: Invite form — description search, drop `required`, gap note gone

## Context

`modules/user-admin/components/invite_form.yaml` is the invitation-details form.
Its role `MultipleSelector` (id `roles`) builds a rich two-line option label from
the catalog and already carries a compact `tag: { title, color: purple }`, but:

- its `filterString` is the label only, so typing a word from a role's description
  matches nothing (D4 search);
- it sets `required: true`, which is inert on an array input but draws a wrong
  asterisk (D6);
- it carries a stale `NOTE (running-engine gap)` about `_build.authConfig` (D5-notes).

Task 1 must be complete: the `filterString` change reads `description`, now carried
per resolved catalog entry.

## Interfaces

- **Consumes:** the catalog option's `description` (available via
  `_build.authConfig.roles` at build time; the resolved-entry `description` from
  task 1 is what makes search meaningful across surfaces).

## Task

Edit `modules/user-admin/components/invite_form.yaml`, on the `roles`
`MultipleSelector` (around lines 48–94):

1. **Add `description` to `filterString`.** It is currently
   `filterString: { __build.args: 0.label }`. Change to:

```yaml
filterString:
  __build.string.concat:
    - __build.args: 0.label
    - " "
    - __build.if_none:
        - __build.args: 0.description
        - ""
```

2. **Delete `required: true`** from the `roles` `MultipleSelector` (D6) — an
   invite with an empty role array already mints a role-less member successfully,
   so the asterisk marks a field the flow does not require. The `org_role` single
   `Selector` in this file keeps its `required: true`.
3. **Delete the `NOTE (running-engine gap)` comment block** on the options (the
   `# NOTE …` lines through `upstream ask 7`). `_build.authConfig` resolves; the
   note is false. Keep the surrounding "options from the app role catalog" comment
   that describes what the config does.

Leave the existing `renderTags: true`, the two-line label, and the
`tag: { title, color: purple }` unchanged.

## Acceptance Criteria

- The `roles` `MultipleSelector`'s `filterString` includes the description.
- No `required: true` on the `roles` field; `org_role`'s remains.
- No `NOTE (running-engine gap)` text remains in the file.
- `pnpm ldf:b` succeeds.

## Notes

The `Validate` action in this form's submit (`regex: ['^profile\.', '^roles$',
'^org_role$', '^member_attributes\.']`) is left untouched — after `required` is
gone, `^roles$` matches a field with no rules, which is harmless.

# Task 13: Normalize DiceBear Avatar URLs Across Contacts Module

## Context

The contacts module uses a shorter DiceBear avatar URL format than user-account and user-admin:

- **user-account/user-admin:** `https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed=...`
- **contacts:** `https://api.dicebear.com/6.x/initials/svg?seed=...`

The missing `backgroundType=gradientLinear&scale=75` parameters cause contacts avatars to look different (solid background instead of gradient, different scale).

## Task

Update the avatar URL in both contacts API files to include the full parameter set.

### `modules/contacts/api/create-contact.yaml`

Find the `profile.picture` (or `picture` if nested) value:

```yaml
picture:
  _string.concat:
    - "https://api.dicebear.com/6.x/initials/svg?seed="
```

Replace with:

```yaml
picture:
  _string.concat:
    - "https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed="
```

### `modules/contacts/api/update-contact.yaml`

Find the `profile.picture` value:

```yaml
profile.picture:
  _string.concat:
    - "https://api.dicebear.com/6.x/initials/svg?seed="
```

Replace with:

```yaml
profile.picture:
  _string.concat:
    - "https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed="
```

## Acceptance Criteria

- Both `create-contact.yaml` and `update-contact.yaml` use the full avatar URL: `https://api.dicebear.com/6.x/initials/svg?backgroundType=gradientLinear&scale=75&seed=`
- Avatar URLs match the format used by user-account and user-admin
- No other changes to these files

## Files

- `modules/contacts/api/create-contact.yaml` — modify — normalize avatar URL
- `modules/contacts/api/update-contact.yaml` — modify — normalize avatar URL

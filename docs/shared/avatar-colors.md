---
type: shared
module: shared
title: Avatar colors
concepts:
  - avatar_colors
  - gradient palette
  - user avatars
---

# Avatar colors

Modules that render user/contact avatars (`contacts`, `user-account`, `user-admin`) deterministically pick an avatar gradient from a shared palette so the same person always shows the same colors across the app.

## Default palette

`modules/shared/profile/avatar_colors.yaml` is an array of `{ from, to }` gradient pairs:

```yaml
- from: "#c62828"
  to: "#ad1457"
- from: "#ad1457"
  to: "#6a1b9a"
# …
```

Modules reference this file as the default for the `avatar_colors` var.

## How modules pick a color

A hash of the user id is taken modulo the palette length to pick an index. Same id → same index → same gradient on every page. New users land on whatever index their hash produces, with the palette's distribution determining the spread.

## Overriding

To use a custom palette, write your own `{ from, to }` array and pass it as the `avatar_colors` var:

```yaml
- id: contacts
  vars:
    avatar_colors:
      - from: "#0d47a1"
        to: "#1565c0"
      - from: "#1565c0"
        to: "#0277bd"
      # …
```

For a single brand color, pass an array of length 1 — every user gets the same gradient.

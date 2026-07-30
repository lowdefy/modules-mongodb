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

Modules that render user/contact avatars (`contacts`, `user-account`, `user-admin`) pick an avatar gradient from a shared palette and store it, so the same person always shows the same colors across the app.

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

The **write** owns the choice, in one place for every write path. When a profile is saved, the seam resolves the gradient in this order:

1. An explicit pick, if the profile carries one — the "Change colour" button on the onboarding page and the profile edit modal writes `profile.avatar_color` directly.
2. Otherwise the colour already stored on the contact, so it stays put across every later save.
3. Otherwise one random draw from the palette.

Whatever it resolves to is **stored** on `profile.avatar_color`, and the rendered avatar is stored alongside it as an SVG data URI on `profile.picture`. That is what makes the guarantee hold: same person, same colors on every page, because nothing re-picks at read time.

Two consequences worth knowing:

- **A palette change does not migrate existing people.** Because a resolved `{ from, to }` pair is stored, changing the `avatar_colors` var only affects profiles that have no colour yet. Clearing `profile.avatar_color` in a migration is the escape hatch — the next write through any seam then draws from the new palette.
- **A profile with no name carries no picture at all.** Rather than an avatar showing `?`, which reads as a deliberate identity, the Avatar block's person icon renders. An invited user who has not onboarded is the case this covers; the seam derives a real avatar on the write that first supplies a name.

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

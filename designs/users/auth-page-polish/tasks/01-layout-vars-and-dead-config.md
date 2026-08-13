# Task 1: Layout shell vars & dead-config removal

## Context

The `layout` module manifest (`modules/layout/module.lowdefy.yaml`) declares the `auth_page`
var object that every public auth page reads through the shared `auth-page` shell. Today it has
`max_width` (default `360`), `card_style`, `cover_background`, `logo_max_width`, and
`brand_panel_background`. The last var is consumed by exactly one file —
`modules/shared/layout/auth-page-copy.yaml`, an **unexported** split-screen ("brand panel +
form panel") alternate layout that nothing references (`layout` exports only `auth-page`).

This task lays the foundation for the rest of the design: it introduces the new brand-treatment
var, standardizes the card width, and clears the dead config in one commit. Removing
`brand_panel_background` and deleting the file that solely consumes it must happen together —
otherwise you leave either an orphan var or a file referencing a deleted var.

## Interfaces

- **Produces:**
  - `auth_page.logo_style` — new var, `enum: [band, minimal]`, `default: band`. Consumed by
    Task 2 (shell branch) and Task 3 (demo).
  - `auth_page.max_width` default = `420`. Relied on by Tasks 4 and 5 (which drop their `560`
    overrides to inherit it).

## Task

In `modules/layout/module.lowdefy.yaml`, under `vars.auth_page.properties`:

1. **Add `logo_style`** with exactly this shape (manifest is the source of truth for var
   schema — description, type, default, enum all required):

   ```yaml
   logo_style:
     type: string
     default: band
     enum: [band, minimal]
     description: >-
       Brand treatment applied to every auth page. `band` renders the logo in the
       gradient cover band (default). `minimal` renders a small logo centred above
       a bandless card — for logos that read poorly reversed-out on the cover
       gradient, or a lighter look.
   ```

2. **Change `max_width` default** from `360` to `420` (keep its `description`).

3. **Remove the `brand_panel_background` property** entirely (currently the block whose
   description mentions "auth-page brand panel (alternate auth layout)"). Also drop the
   `brand_panel_background` mention from the `auth_page` object's top-level `description` string
   (line ~118, `"Auth page overrides: { cover_background, card_style, max_width, logo_max_width, brand_panel_background }"`)
   so the summary no longer advertises a removed var.

4. **Delete** `modules/shared/layout/auth-page-copy.yaml`.

5. **Regenerate docs:** run `pnpm docs:gen` (regenerates `docs/layout/reference/vars.md` from
   the manifest and re-lints front-matter). Commit the regenerated `vars.md`.

Do **not** touch `cover_background` or `logo_max_width` — they still tune the `band` variant.

## Acceptance Criteria

- `auth_page.logo_style` present in the manifest with the enum/default/description above;
  `max_width` default is `420`; `brand_panel_background` gone from both the property list and
  the object description.
- `modules/shared/layout/auth-page-copy.yaml` no longer exists; `grep -rn "auth-page-copy\|brand_panel_background" modules/ apps/ docs/`
  returns nothing.
- `pnpm docs:check` passes (no drift; `docs/layout/reference/vars.md` shows `logo_style` and
  `max_width: 420`, and no longer shows `brand_panel_background`).
- `pnpm ldf:b` from `apps/demo` succeeds.

## Files

- `modules/layout/module.lowdefy.yaml` — modify — add `logo_style`; bump `max_width` default to
  `420`; remove `brand_panel_background` (property + description mention).
- `modules/shared/layout/auth-page-copy.yaml` — delete.
- `docs/layout/reference/vars.md` — regenerate via `pnpm docs:gen` (do not hand-edit).

## Notes

- `vars.md` is generated — never hand-edit it; always go through the manifest + `pnpm docs:gen`.
- The default `band` deliberately keeps every existing deployment (including the demo before
  Task 3) visually unchanged.

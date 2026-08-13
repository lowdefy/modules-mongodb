# Task 2: Branch the auth-page shell on `logo_style`

## Context

`modules/shared/layout/auth-page.yaml` is the shared shell every public auth page renders
through. Today it **always** draws the brand logo inside a colored gradient **cover band** —
the `auth-card` Card's `cover` slot holds an `auth-cover` Box (`padding: "32px 32px 24px 32px"`,
`background: {_module.var: auth_page.cover_background}`, `borderRadius: "12px 12px 0 0"`)
containing an `auth-logo` `Img` with `src: {_module.var: logo.primary_dark}` and
`maxWidth: {_module.var: auth_page.logo_max_width}` (default 160).

Task 1 added `auth_page.logo_style` (`enum: [band, minimal]`, default `band`). This task makes
the shell honor it: `band` keeps today's cover; `minimal` drops the cover and renders a small
logo centered **above** the card instead. The choice is app-wide and applies to every auth page
uniformly (see `mockups/logo-variation.html` — the same "Sign in" page drawn both ways).

## Interfaces

- **Consumes:** `auth_page.logo_style` (from Task 1); existing `logo.primary` / `logo.primary_dark`,
  `auth_page.cover_background`, `auth_page.logo_max_width` vars.

## Task

Edit `modules/shared/layout/auth-page.yaml`. Use a **build-time** branch on `logo_style`
(`_build.eq` / `_build.if`) since `logo_style` is a static consumer var, not runtime state.

1. **Gate the existing `cover` slot on `band`.** The `auth-card` Card's `slots.cover.blocks`
   currently unconditionally contains the `auth-cover` Box. Make the cover render only when
   `logo_style == band` — e.g. wrap the cover blocks in `_build.if` (test
   `_build.eq: [{_module.var: auth_page.logo_style}, band]`, else `[]`). When `minimal`, the
   card has no cover slot (bandless).

2. **Add a small above-card logo for `minimal`.** Above the `auth-card` Card, inside
   `auth-page-container` (the `maxWidth` Box), prepend a logo block that renders only when
   `logo_style == minimal`:
   - An `Img` (id e.g. `auth-logo-minimal`) with `src: {_module.var: logo.primary}` (the
     standard logo, **not** `logo.primary_dark` — there's no dark cover to reverse out on).
   - Small and centered: target ~26–40px tall, horizontally centered above the card, with a
     small bottom margin before the card (the mock uses `margin-bottom: 20px`). Center it via a
     wrapper Box (`layout.justify: center` / `textAlign: center`) so it sits centered over the
     `420`-wide card.
   - Confirm the exact `Img` sizing/props against `lowdefy_get_schema` for `Img` before
     wiring.

3. Leave everything else (title block, `nav`, `footer`, `card_style`, request/event wiring)
   unchanged.

Look up the current `Card`/`Box`/`Img` schemas and any `slots.cover` semantics via
`lowdefy_get_schema` before editing — don't guess prop names. After editing, run
`lowdefy_build_status`, then `lowdefy_screenshot_page` on a simple auth page (e.g. `login`) in
both variants to confirm.

## Acceptance Criteria

- With `logo_style: band` (default), the rendered auth page is **visually identical** to before
  this change — cover band + `logo.primary_dark`.
- With `logo_style: minimal`, the card has no cover band and a small centered `logo.primary`
  sits above the card.
- `pnpm ldf:b` from `apps/demo` succeeds. `lowdefy_build_status` reports no errors for the auth
  pages.

## Files

- `modules/shared/layout/auth-page.yaml` — modify — branch the `cover` slot and add the
  above-card minimal logo, both gated on `logo_style`.

## Notes

- Keep the branch build-time (`_build.*`) — a runtime `_if` would leave both DOM branches in
  the tree.
- Do not remove `cover_background` / `logo_max_width` usage — they still drive the `band`
  variant.

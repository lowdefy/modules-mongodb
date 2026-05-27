# Task 10: Migrate demo chrome to read `_app: name`

## Context

The demo hardcodes the app's display name in two chrome locations today:

1. `apps/demo/pages/home.yaml` — `title: Module Demo App`.
2. `apps/demo/modules/layout/vars.yaml` — footer HTML containing `<p>Modules Demo</p>`.

Both should read from `_app: name` so the value flows from a single declaration on `apps/demo/lowdefy.yaml` (task 1). This is also the canonical example for the docs update in task 12 — when `docs/idioms.md` documents `_app: name`/`_app: description` for page chrome, these two demo sites are the worked examples.

## Task

1. **Home page title** — edit `apps/demo/pages/home.yaml`: change the page `title:` (or whatever string field currently holds "Module Demo App") to `{ _app: name }`. Page titles are resolved at build time; this needs `_app: name` at build time.

2. **Layout footer** — edit `apps/demo/modules/layout/vars.yaml`: the footer is currently an HTML block with a literal "Modules Demo" string. Change it to use Nunjucks templating so the app name comes from the operator:

    - If the footer is an `Html` block, change its `properties.html` to a `_nunjucks` operator that references `_app: name`, OR
    - If the footer can be expressed without raw HTML, use a more idiomatic Lowdefy block (Markdown, Title) that reads `_app: name` directly.

    Prefer the more idiomatic block per the project rule "Prefer Lowdefy blocks over Html". Only fall back to Nunjucks-rendered HTML if the design requires inline HTML.

## Acceptance Criteria

- `apps/demo/pages/home.yaml` no longer contains the literal `Module Demo App` (or `Modules Demo`) — the title is sourced from `_app: name`.
- `apps/demo/modules/layout/vars.yaml` footer no longer contains a literal "Modules Demo" string — it is sourced from `_app: name`.
- The home page renders "Modules Demo" as its title (after task 1's `name:` rename).
- The layout footer renders "Modules Demo" in the demo.
- `pnpm ldf:b` succeeds.

## Files

- `apps/demo/pages/home.yaml` — modify — `title` reads `_app: name`.
- `apps/demo/modules/layout/vars.yaml` — modify — footer reads `_app: name`.

## Notes

- The home page title is resolved at build time. `_app: name` must therefore evaluate at build time per the upstream Lowdefy requirement.
- `_app: description` has no obvious site to migrate today. Don't manufacture one — task 12 documents it as available but no module migrates to it.

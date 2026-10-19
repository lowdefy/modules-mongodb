# Task 3: Demo consumer for `logo_style: minimal`

## Context

`auth_page.logo_style` is new consumer-facing surface, so per the repo rule ("always add a demo
consumer when adding module functionality") it needs a build-verified example. The demo's
`layout` module entry vars live in `apps/demo/modules/layout/vars.yaml` (referenced from
`apps/demo/modules.yaml` at the `- id: layout` entry via `_ref: modules/layout/vars.yaml`).
Today that file sets `page_type` and `footer` only — no `auth_page` block — so the demo runs on
all `auth_page` defaults (`band`).

The default `band` variant is already exercised by every deployment that omits the var (the demo
today, and every other module consumer). What needs a worked reference is `minimal`.

## Interfaces

- **Consumes:** `auth_page.logo_style` (Task 1) and the shell branch that renders it (Task 2).

## Task

In `apps/demo/modules/layout/vars.yaml`, add an `auth_page` block that sets the minimal
treatment:

```yaml
auth_page:
  logo_style: minimal
```

Keep the existing `page_type` and `footer` entries. The design accepts a single demo-wide
treatment ("if a single treatment is acceptable demo-wide"), so setting it on the layout entry
is sufficient — `minimal` gets a worked, build-verified reference while `band` remains the
documented default exercised by omission.

Build the demo (`pnpm ldf:b` from `apps/demo`), then inspect the generated artifacts to confirm
the shell resolved the `minimal` branch end-to-end: check
`apps/demo/.lowdefy/server/build/pages/**` for a public auth page (e.g. `login`) and verify the
cover band block is absent and the above-card minimal logo block is present. Optionally confirm
visually with `lowdefy_screenshot_page` on `login`.

## Acceptance Criteria

- `apps/demo/modules/layout/vars.yaml` sets `auth_page.logo_style: minimal` and retains
  `page_type` + `footer`.
- `pnpm ldf:b` from `apps/demo` succeeds.
- The built `login` page artifact shows the bandless / above-card-logo (minimal) structure, not
  the cover band.

## Files

- `apps/demo/modules/layout/vars.yaml` — modify — add `auth_page: { logo_style: minimal }`.

## Notes

- This flips the whole demo to `minimal`; that's intended — it gives the non-default variant its
  reference. Task 9's visual check confirms both variants (band via a default/no-var render,
  minimal via the demo).

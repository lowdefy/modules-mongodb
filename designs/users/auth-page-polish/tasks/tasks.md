# Implementation Tasks — Auth-page consistency & polish

## Overview

Implements `designs/users/auth-page-polish/design.md`: make the shared `layout`
`auth-page` shell enforce one card width, give consumers a single app-wide brand-treatment
choice (`auth_page.logo_style`), rebuild the two-factor enrolment page at the standard width,
wire Enter-to-submit on every code input, normalize heading typography, and delete dead
split-screen config. Addresses F32 (visual polish / card-width consistency) and F49 (TOTP
manual key too long).

These are modifications to **existing** pages and shell config — not new screens — so the
work decomposes into atomic edits, not a mock→frame→layout→content→wire pipeline. The
mockups (`mockups/logo-variation.html`, `mockups/enrol-redesign.html`) are visual references,
not screen blueprints.

## Global Constraints

- **Card width default:** `auth_page.max_width` default becomes `420` (was `360`). No page
  keeps a `max_width: 560` override.
- **`logo_style`:** `enum: [band, minimal]`, `default: band`. Applied uniformly to **every**
  auth page by the shell — never a per-page split. Default `band` must leave every existing
  deployment visually unchanged.
- **Logo source per variant:** `band` renders `logo.primary_dark` in the gradient cover;
  `minimal` renders `logo.primary` small (~26–40px), centered above a bandless card.
- **F49 secret is fixed upstream, display-side only:** BetterAuth (`better-auth@1.6.23`)
  hardcodes the TOTP secret at `generateRandomString(32)` (256-bit) → **52-char base32**; no
  secret-length option exists. Do not attempt to shorten it. Render it grouped in **4-char
  chunks (13 chunks)** as monospace pills, in a **copyable `Paragraph`** (never a disabled
  `TextInput` — browsers can't select disabled-input text).
- **Headings:** every auth-page heading is `Title` level 3 with the same top margin.
- **Enter-to-submit:** each `onPressEnter` runs the **same action chain as that page's primary
  button** — no new logic.
- **Out of scope (do not build):** shortening the TOTP secret; `autocomplete="one-time-code"`
  / `inputMode="numeric"` on inputs (needs an upstream `TextInput` change); any change to auth
  _logic_ / flow; reviving or replacing the `auth-page-copy` split-screen layout.
- Repo conventions inherited: snake_case block/action/request IDs, look up all block/operator
  names via the `lowdefy-docs` MCP (`lowdefy_get_schema` / `lowdefy_get_examples`) — never
  guess a type or prop.

## Tasks

| #   | File                                | Summary                                                                                                                       | Depends On    |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | `01-layout-vars-and-dead-config.md` | Manifest: add `logo_style`, bump `max_width` default, drop `brand_panel_background`; delete `auth-page-copy.yaml`; regen docs | —             |
| 2   | `02-shell-logo-style-branch.md`     | `auth-page.yaml`: branch cover (band) vs above-card small logo (minimal) on `logo_style`                                      | 1             |
| 3   | `03-demo-logo-style-minimal.md`     | Demo: set `auth_page.logo_style: minimal`, build-verify both variants                                                         | 2             |
| 4   | `04-enrol-scan-rebuild.md`          | `two-factor-enrol.yaml`: drop 560; single-column QR-first scan, key disclosure in 4-char chunks; onPressEnter on code         | 1             |
| 5   | `05-onboarding-restack.md`          | `onboarding.yaml`: drop 560; restack honorific+name row for 420 (verify `form_core` reads in both consumers)                  | 1             |
| 6   | `06-modal-enroltotp-key-chunks.md`  | `modal_enroltotp.yaml`: 4-char chunk key display; onPressEnter on confirmation code                                           | —             |
| 7   | `07-two-factor-enter-submit.md`     | `two-factor.yaml`: onPressEnter on TOTP `code` and `backup_code` inputs                                                       | —             |
| 8   | `08-heading-normalization.md`       | All auth pages: Title level 3 + uniform margin; move login's resting title in-block                                           | 4, 5, 7       |
| 9   | `09-visual-consistency-check.md`    | Dev-server pass: uniform 420 width, consistent headings, band/minimal, enrol redesign                                         | 3, 4, 5, 6, 8 |

## Ordering Rationale

- **Task 1 is foundational.** The shell branch (2), the demo consumer (3), and the width
  changes on the enrol/onboarding pages (4, 5) all depend on the new `logo_style` var and the
  `420` default landing first. Task 1 also removes `brand_panel_background` and deletes the
  file that solely consumes it — the two must go together (orphan var ↔ orphan file), so they
  are one commit, with `pnpm docs:gen` folded in to keep `vars.md` in sync.
- **2 → 3.** The demo can only _exercise_ `minimal` once the shell actually branches on it, so
  the demo consumer depends on the shell task, not just the var.
- **4 and 5 are independent of each other** and of the shell branch — each depends only on
  Task 1 (the `420` default). They can run in parallel.
- **6 and 7 are fully independent** (depend on nothing): the Manage-modal (`modal_enroltotp`)
  and the sign-in `two-factor` page each get self-contained input changes. `onPressEnter` for
  the enrol page lives in Task 4, and for the modal in Task 6 — folded into the task that owns
  that file rather than split out.
- **8 depends on 4, 5, 7** purely for same-file conflict avoidance: the heading pass re-touches
  `two-factor-enrol.yaml`, `onboarding.yaml`, and `two-factor.yaml`, so it runs after those
  pages reach final shape. It does **not** touch `modal_enroltotp.yaml`, so it's independent of 6.
- **9 is last** — the only task that opens the running app and verifies the design's core goal
  (cross-page width and heading _consistency_), which no single page task can confirm. Needs
  the Lowdefy dev server.

Parallel batches after Task 1: `{2, 4, 5, 6, 7}` can run together (6, 7 could even start
before 1); then `3` (after 2); then `8` (after 4, 5, 7); then `9`.

## Scope

**Source:** `designs/users/auth-page-polish/design.md`
**Context read:** `design.md`, `mockups/logo-variation.html`, `mockups/enrol-redesign.html`;
grounded against `modules/layout/module.lowdefy.yaml`, `modules/shared/layout/auth-page.yaml`,
`modules/shared/layout/auth-page-copy.yaml`, `modules/user-account/pages/*.yaml`,
`modules/user-account/components/view/modal_enroltotp.yaml`,
`modules/shared/profile/form_core.yaml`, `apps/demo/modules/layout/vars.yaml`.
**Review files skipped:** none present in this design folder.

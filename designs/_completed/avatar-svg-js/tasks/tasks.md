# Implementation Tasks — Avatar SVG: Replace Nunjucks with \_js and Shared \_ref

## Overview

These tasks implement the avatar-svg-js design: replacing duplicated `_nunjucks` SVG generation across 8 files in 3 modules with a single shared `.njk` text template that produces `_js` code, moving SVG generation from server-side APIs to client-side forms (SetState-before-CallApi pattern), and adding display fallback for missing pictures.

## Tasks

| #   | File                                 | Summary                                                                                              | Depends On |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-shared-avatar-infrastructure.md` | Create shared .njk template, move avatar_colors, update module vars, delete deprecated component     | —          |
| 2   | `02-user-account-forms.md`           | Update user-account forms: \_js preview, shuffle, create-profile color init, SetState-before-CallApi | 1          |
| 3   | `03-user-admin-forms.md`             | Update user-admin forms: \_js preview, invite random color, SetState-before-CallApi                  | 1          |
| 4   | `04-contacts-forms.md`               | Update contacts forms: add avatar preview, create random color, SetState-before-CallApi              | 1          |
| 5   | `05-remove-server-side-svg.md`       | Remove nunjucks SVG generation from all 5 API files, replace with payload passthrough                | 2, 3, 4    |
| 6   | `06-display-fallback.md`             | Add fallback rendering for null profile.picture in display components and tables                     | —          |

## Ordering Rationale

**Task 1 is the foundation.** The shared `.njk` template and `avatar_colors` module vars must exist before any client form can reference them.

**Tasks 2, 3, 4 can run in parallel** (all depend only on task 1). Each updates one module's client forms to generate SVG via SetState-before-CallApi. They're separated by module because each has distinct patterns:

- User-account has shuffle button, ID-hash color default, and an existing preview to replace.
- User-admin has an existing preview component (`view_user_avatar_preview.yaml`) and needs random color on invite init.
- Contacts has no existing preview (needs to be added) and needs random color on create init.

**Task 5 (API cleanup) depends on tasks 2-4.** The APIs must not stop generating SVGs until all client forms generate them. Between tasks 2-4 and task 5, both client and server generate SVGs (harmless duplication). Reversing this order would produce null `profile.picture` values.

**Task 6 (display fallback) is independent.** It handles the case where `profile.picture` is null for existing users who were created before avatar generation existed, or for invited/created users who haven't yet re-saved. It can be done at any point but is placed last for logical flow.

## Scope

**Source:** `designs/avatar-svg-js/design.md`
**Context files considered:** None (no non-review context files in design folder)
**Review files skipped:** `review/review-1.md`, `review/consistency-2.md`

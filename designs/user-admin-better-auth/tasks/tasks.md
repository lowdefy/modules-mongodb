# Implementation Tasks — User Admin on BetterAuth

## Overview

These tasks rebuild the `user-admin` module against the BetterAuth-based auth
engine, per `designs/user-admin-better-auth/design.md`. The module becomes the
operator console for a person's access lifecycle in one pinned org — native
`$lookup` reads over the auth collections joined to `user-contacts`, and
per-concern write routines driven through the sanctioned admin-step surface. The
three UI screens (`all`, `view`, `invite`) are each built through the
`mock-to-lowdefy` pipeline (frame → layout → content → wire); the scaffold,
shared fragments, write-side routines, docs, and verify tasks wrap them.

## Tasks

| #   | File                             | Summary                                                                                                                                                               | Depends On |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-scaffold-module.md`          | Rewrite the manifest + skeleton (vars, exports, connections, deps, plugins), stub the three pages, retire old pages/vars, wire the demo consumer — a buildable target | —          |
| 2   | `02-shared-contact-fragments.md` | Create the `modules/shared/contact/` `create-or-link-contact` + `write-profile` fragments                                                                             | —          |
| 3   | `03-detail-write-routines.md`    | Profile / access / global-attribute save routines (`update-profile`, `update-access`, `update-user-attributes`)                                                       | 1, 2       |
| 4   | `04-security-write-routines.md`  | Lifecycle routines (`suspend`, `reinstate`, `revoke-sessions`, `remove-member`, `delete-user`)                                                                        | 1          |
| 5   | `05-invite-write-routines.md`    | Invite routines (`invite`, `check-invite-email`, `cancel-invitation`, `resend-invitation`)                                                                            | 1, 2       |
| 6   | `06-all-frame.md`                | `all` screen — pipeline phase 1 (frame)                                                                                                                               | 1          |
| 7   | `07-all-layout.md`               | `all` screen — pipeline phase 2 (layout)                                                                                                                              | 6          |
| 8   | `08-all-content.md`              | `all` screen — pipeline phase 3 (content)                                                                                                                             | 7          |
| 9   | `09-all-wire.md`                 | `all` screen — wire: members/invitations reads, export merge, invitation actions                                                                                      | 8, 5       |
| 10  | `10-view-frame.md`               | `view` screen — pipeline phase 1 (frame)                                                                                                                              | 1          |
| 11  | `11-view-layout.md`              | `view` screen — pipeline phase 2 (layout)                                                                                                                             | 10         |
| 12  | `12-view-content.md`             | `view` screen — pipeline phase 3 (content)                                                                                                                            | 11         |
| 13  | `13-view-wire.md`                | `view` screen — wire: detail joins, sessions/accounts/cross-app reads, tile edits + security actions                                                                  | 12, 3, 4   |
| 14  | `14-invite-frame.md`             | `invite` screen — pipeline phase 1 (frame)                                                                                                                            | 1          |
| 15  | `15-invite-layout.md`            | `invite` screen — pipeline phase 2 (layout)                                                                                                                           | 14         |
| 16  | `16-invite-content.md`           | `invite` screen — pipeline phase 3 (content)                                                                                                                          | 15         |
| 17  | `17-invite-wire.md`              | `invite` screen — wire: check-email resolve + invite/cancel/resend actions                                                                                            | 16, 5      |
| 18  | `18-docs.md`                     | Docs: module index, generated `vars.md`, co-location precondition, migration guide                                                                                    | 1–17       |
| 19  | `19-verify.md`                   | `pnpm ldf:b` build gate, then render/e2e against the dev server                                                                                                       | 1–18       |

## Ordering Rationale

**Scaffold first, wire last.** Task 1 rewrites the module skeleton so every
`_ref` resolves and there is a buildable target to render UI into — everything
depends on it. The green-build gate is deferred to the very end (task 19): a UI
page carrying mock data and `TODO(request-substitute)` YAML-comment markers
builds fine, so gating each UI phase on a green build would be premature.

**Shared fragments and write-side feed the wire steps.** Task 2 creates the two
`modules/shared/contact/` fragments; tasks 3–5 build the write routines that the
`view` and `invite` wire steps call. These are independent of the UI structure
work, so tasks 2–5 run in parallel with the frame/layout/content phases.

**Per-screen chains are strictly ordered internally, independent across screens.**
Within a screen, frame → layout → content → wire is a hard chain (each phase
consumes the previous phase's output). The three screens are independent of one
another, so once the scaffold (task 1) exists, the three chains
(6→7→8→9, 10→11→12→13, 14→15→16→17) can run in parallel. The `mockups/screens/`
mocks are already pipeline-ready (normalised full-bleed screens), so the
`lowdefy-mock` authoring step is skipped for all three.

**Wire steps join UI with write-side.** Each wire step depends on its screen's
content phase _and_ the write routines it invokes: `all` wire needs the invite
routines (task 5) for the Invitations-tab resend/cancel; `view` wire needs the
detail (task 3) and security (task 4) routines; `invite` wire needs the invite
routines (task 5). The read aggregations are authored inside the wire steps
(that is where the `TODO(request-substitute)` markers live), guided by the
design's read spec.

**Docs and verify close out.** Task 18 updates consumer docs and regenerates the
manifest-derived `vars.md`; task 19 runs the build gate and drives the screens
against a dev server.

## Scope

**Source:** `designs/user-admin-better-auth/design.md`
**Context files considered:** `upstream-asks.md`, `mockups/index.html`, `mockups/screens/all.html`, `mockups/screens/view.html`, `mockups/screens/invite.html`
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-1.md`

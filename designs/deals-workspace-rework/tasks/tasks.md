# Implementation Tasks — Deals workspace rework

## Overview

Eight tasks implementing `designs/deals-workspace-rework/design.md` — targeted edits to the
existing `deals` module (layout, related-deals bounding, number formatting, form-data keying)
plus a docblock fix in `activities`. No new module vars, no new exported components, no new
pages. All work is in this repo; the consuming app's follow-through is deliberately out of
scope (see Scope).

## Global Constraints

From `design.md`:

- **Display-only formatting.** No stored value is recomputed or migrated; formatting happens at render.
- **No new module vars and no new exported components.** The design rejects both explicitly; if a task seems to need one, stop and re-read the decision rather than adding surface.
- **`info_grid_slots` is not renamed.** Its position changes, its name and the host's config do not.
- **The related-deals card width is a module constant (180px), not a var.**

From the repo (`CLAUDE.md`):

- **Never use client or app names** in commits, task output, or anything tracked in git. Refer to "the host app".
- **Build check is `pnpm ldf:b` from `apps/demo`** (or `pnpm --filter @lowdefy/modules-demo ldf:b` from the root). Never the `:i` (Infisical) variants — the sandbox blocks them.
- **Never run a dev server or e2e in the foreground.** They never exit.
- **A build check is not a smoke test.** Running `apps/demo` needs real secrets and a reachable MongoDB, so visual verification is a human step, not an autonomous one.
- **`docs/deals/reference/vars.md` is generated** by `scripts/gen-var-docs.mjs`. Never hand-edit it; run `pnpm docs:gen` and commit the result. `pnpm docs:check` must pass.

## Tasks

| #   | File                                       | Summary                                                                    | Depends On |
| --- | ------------------------------------------ | -------------------------------------------------------------------------- | ---------- |
| 1   | `01-form-data-by-workflow-type.md`         | Key `get_selected_deal`'s workflow form data by workflow type (breaking)     | —          |
| 2   | `02-related-deals-single-row.md`           | Fixed-width ellipsised cards, one non-wrapping row, lookup limit 20 → 10     | 1          |
| 3   | `03-info-grid-slot-position.md`            | Move `info_grid_slots` injection above People/Files; update var description | —          |
| 4   | `04-open-items-stacked.md`                 | Stack the Actions and Tasks sections full-width instead of two columns      | —          |
| 5   | `05-workspace-columns-and-card-numbers.md` | Pipeline/detail columns to 12/12; card volume to 2dp                        | —          |
| 6   | `06-left-panel-button-and-collapse.md`     | New-deal button in the list card header; collapsible left panel            | 5          |
| 7   | `07-capture-activity-docblock.md`          | Correct `capture_activity`'s stale `prefill` docblock in `activities`        | —          |
| 8   | `08-changeset-and-verify.md`               | Changeset with the breaking-config note; build check; human verify list      | 1–7       |

## Ordering Rationale

**Two dependency chains, everything else parallel.**

Task 1 → 2 exists purely because both edit `requests/get_selected_deal.yaml` — task 1 restructures
its workflow `$lookup`, task 2 changes the related-deals `$limit` in the same file. Serialising
avoids a merge conflict between agents; there is no logical dependency.

Task 5 → 6 exists for the same reason: both edit `pages/view.yaml`. Task 5 makes two small
presentational edits (column spans, the card's number filter); task 6 adds the new-deal button and
the collapse state, which is the larger and more stateful of the two. Doing the small edits first
keeps task 6's diff readable.

Tasks 3, 4, 5 and 7 touch four different files and can all run concurrently with the 1 → 2 chain.

Task 8 is last because a changeset should describe what actually landed, and the build check is
only meaningful once every edit is in.

**Boundary calls worth noting:**

- **Task 3 includes running `pnpm docs:gen`.** The var description change and the regenerated
  `vars.md` belong in one commit, otherwise `pnpm docs:check` fails on the intermediate state.
- **Task 1 includes a hand-written docs addition** (`docs/deals/index.md`), because the read shape
  it changes is consumer-observable and breaking but isn't covered by the generated vars reference.
- **Number formatting is split by surface, not bundled.** Only the module-side card change is here
  (task 5); the currency site with thousands separators lives in the host app and is out of scope.
- **The design's items 2, 3, 4 and 8 are one layout change** per its own rationale. They are
  separate tasks for reviewability, but they should land together — reviewing task 5's column
  narrowing without tasks 2 and 4 makes it look like a regression.

## Scope

**Source:** `designs/deals-workspace-rework/design.md`
**Context read:** `design.md`; repo `CLAUDE.md`; `docs/deals/index.md`, `docs/deals/reference/vars.md`; the deals and activities module sources; Lowdefy engine and build sources for the layout, var-validation and Nunjucks facts the design cites.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`.

**Deliberately excluded — the host app's follow-through.** The design's "Host follow-through"
section lists work in the consuming app's repo: re-keying three read sites for task 1, formatting
its currency and volume fields, and its workflow-type rename. The design fixes the ordering as
module release → host bump → host work, so that is a separate unit of work in a separate repo, not
a task here. Task 1's acceptance criteria include the changeset note that tells the host what to change.

**Excluded — the `deal-status-chip` export defect.** The design records it as an unresolved open
question (fix here or separately), so it is not decomposed. It is a genuine bug: the manifest
declares an export with no top-level `components:` list for it to resolve against.

**Blocking question still open.** The design carries one blocking open question — whether the issue
author accepts the new info-grid tile pairing. A "no" reverts task 3 to a materially larger change
(a breaking var rename or added module surface). Task 3 is otherwise the smallest task here; it is
also the one that could be invalidated.

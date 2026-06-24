# Task 12: Finalization — CLAUDE.md, llms.txt, Var Tables, Audit (Phase 5b)

## Context

All docs content now exists: the skeleton + index (Task 2), shared idioms (Task 6), the workflows exemplar (Tasks 7–9), the remaining ten modules (Task 10), and the plugin docs (Task 11). This closing task makes the doc system self-consistent and durable: it amends `CLAUDE.md` to describe the new layout **and** to encode the docs/designs source-of-truth boundary, regenerates the machine index over the now-complete tree, ensures every module's var table is current, and audits stubs and cross-links repo-wide.

The CLAUDE.md principle amendment is load-bearing, not cosmetic: the top-level "Designs are the source of truth" rule, left unamended, will lead an agent to "fix" docs to match a stale design — exactly the failure decision 3 sets out to prevent.

## Task

**1. Update `CLAUDE.md` — describe the new doc layout.** Replace the old "Documentation" section (which describes per-module READMEs + `idioms.md`) with the central `docs/` tree: the per-module folder shape (`index.md` + proportional `concepts/`/`how-to/`/`reference/`), `docs/shared/` idioms, `docs/plugins/`, front-matter schema, generated `vars.md`/`llms.txt`, and the `docs:check` gate. Confirm the "Manifest is the source of truth for var schema" rule still holds and now points at the generator.

**2. Amend the "Designs are the source of truth" principle** to encode decision 3's boundary explicitly:
- Designs stay source-of-truth for **code decisions and rationale** (why it was built this way, rejected alternatives).
- Docs become source-of-truth for **consumer-observable authoring behavior** (how it behaves, how to author it).
- Conflict resolution: when docs and a design disagree about **behavior**, docs win — and the design gets a note. When they disagree about **rationale**, the design wins.

Word this so an agent reading the principle in isolation will not "fix" docs to match a stale design.

**3. Regenerate `llms.txt` and all var tables over the complete tree:**
- `node scripts/gen-var-docs.mjs` — every module's `vars.md` current.
- `node scripts/gen-llms-txt.mjs` — `docs/llms.txt` covers every doc (modules, shared, plugins, index), source-side stubs excluded.

**4. Repo-wide audit:**
- Every `modules/{name}/README.md`, the plugin package README, and all six block READMEs are stubs pointing at the right `docs/` page.
- No surviving links to `docs/idioms.md` anywhere.
- `docs/idioms.md` and `modules/activities/VARS.md` are gone.
- Every doc has valid front-matter.
- `pnpm docs:check` passes clean.
- `pnpm ldf:b` compiles.

## Acceptance Criteria

- `CLAUDE.md` "Documentation" section describes the central `docs/` tree (folders, front-matter, generators, `docs:check`), not the old README model.
- `CLAUDE.md` "Designs are the source of truth" principle is amended with the docs/designs boundary and conflict-resolution rules from decision 3.
- `docs/llms.txt` indexes every doc under `docs/` and excludes source-side stubs.
- Every module with vars has a current generated `reference/vars.md` (`pnpm docs:check` confirms no drift).
- `grep -rn "idioms.md" .` (excluding `designs/` history and `node_modules/`) returns nothing.
- All source-side READMEs (modules + plugins + blocks) are stubs.
- `pnpm docs:check` exits 0; `pnpm ldf:b` compiles.

## Files

- `CLAUDE.md` — modify — rewrite "Documentation" section; amend "Designs are the source of truth" principle.
- `docs/llms.txt` — regenerate.
- `docs/{module}/reference/vars.md` (all) — regenerate.
- Audit-only (fix if found): any remaining non-stub `README.md`, dangling `idioms.md` link, or doc missing front-matter.

## Notes

- This is the closing barrier — run it only after Tasks 5, 7, 8, 9, 10, and 11 are all complete, since it regenerates over and audits the whole tree.
- The CLAUDE.md amendment is the single most important non-content change in the design — give it the same care as the docs themselves. An agent must be able to read the amended principle alone and not regress docs to a stale design.
- The `grep "idioms.md"` audit should exclude `designs/` (historical design docs may legitimately mention the old file) and `node_modules/`.

# Implementation Tasks — Documentation v2

## Overview

These tasks implement `designs/documentation-v2/design.md`: replacing the per-module-README docs model with a central, intent-separated `docs/` tree (`concepts/` / `how-to/` / `reference/` per module), migrating workflows concepts out of `designs/`, splitting `idioms.md` by audience, adding front-matter + a generated `llms.txt` index, and gating it all with a `docs:check` CI workflow.

## Tasks

| #   | File                              | Summary                                                                 | Depends On       |
| --- | --------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| 1   | `01-manifest-reconciliation.md`   | Phase 0: resolve workflows `contacts_collection` TODO + layout `logo.*` keys | —                |
| 2   | `02-docs-skeleton-and-index.md`   | Create `docs/` skeleton, front-matter schema, move root README → `docs/index.md`, README stub | —                |
| 3   | `03-gen-var-docs.md`              | `scripts/gen-var-docs.mjs` — generate `reference/vars.md` from manifests (`--check`) | 1, 2             |
| 4   | `04-gen-llms-txt.md`             | `scripts/gen-llms-txt.mjs` — generate `docs/llms.txt` + front-matter linter (`--check`) | 2                |
| 5   | `05-docs-check-ci.md`            | `pnpm docs:check` script + first PR-CI workflow (`.github/workflows/ci.yaml`) | 3, 4             |
| 6   | `06-split-idioms.md`            | Phase 2: split `docs/idioms.md` → `docs/shared/*.md`, fold conventions into CLAUDE.md, delete idioms.md | 2                |
| 7   | `07-workflows-index-reference.md` | Phase 3a: workflows `index.md` + `reference/` pages (incl. generated `vars.md`) | 2, 3             |
| 8   | `08-workflows-concepts.md`       | Phase 3b: workflows `concepts/` (7 files migrated from designs)          | 2, 6             |
| 9   | `09-workflows-how-to.md`         | Phase 3c: workflows `how-to/` (6 task guides from demo configs)          | 2, 6             |
| 10  | `10-remaining-modules.md`        | Phase 4: migrate the other ten modules → `docs/{module}/` + stubs, delete `VARS.md` | 2, 3, 6          |
| 11  | `11-plugin-docs.md`             | Phase 5a: migrate plugin package + 6 block READMEs → `docs/plugins/` + stubs | 2, 4             |
| 12  | `12-finalize.md`                | Phase 5b: amend CLAUDE.md principle + layout, regen `llms.txt`, all var tables, final audit | 5, 7, 8, 9, 10, 11 |

## Ordering Rationale

The work is a dependency chain anchored on two independent foundations that can start in parallel:

- **Task 1 (manifest reconciliation)** is a prerequisite for any *generated* var table — `gen-var-docs.mjs` (Task 3) cannot emit clean output from a manifest that still carries a TODO or mismatched keys.
- **Task 2 (skeleton + front-matter schema)** establishes the output tree and front-matter contract that every generator and content task targets.

From there:

- **Tasks 3 and 4 (generators)** depend on the skeleton/schema; `gen-var-docs` also needs the clean manifest (Task 1). They are independent of each other.
- **Task 5 (CI gate)** wires both generators' `--check` modes, so it depends on 3 and 4.
- **Task 6 (idioms split)** depends only on the skeleton — it just needs `docs/shared/` to exist. It is sequenced before the content tasks because workflows concepts/how-to and the remaining modules link to `docs/shared/` natively.
- **Tasks 7–9 (workflows exemplar)** prove the structure end-to-end. Reference (7) needs the var generator; concepts (8) and how-to (9) link to `docs/shared/`, so they follow the idioms split (6). 7/8/9 can run in parallel once their deps are met.
- **Task 10 (remaining modules)** reuses the exemplar pattern and the generator; it follows the idioms split for the same shared-link reason.
- **Task 11 (plugin docs)** is independent content under `docs/plugins/`; needs the skeleton and the llms walk.
- **Task 12 (finalize)** is the closing barrier: it amends `CLAUDE.md`, regenerates `llms.txt` over the now-complete tree, ensures every module's var table is generated, and audits all stubs/cross-links. It depends on everything that produces docs.

**Parallelizable:** {1, 2} at the start; {3, 4} after 2; {7, 8, 9} after their deps; {10, 11} alongside the workflows tasks.

## Scope

**Source:** `designs/documentation-v2/design.md`
**Context files considered:** none beyond `design.md` (the design folder contains only `design.md` and `review/`). Repo state was mined directly: `docs/idioms.md`, root `README.md`, all 11 `module.lowdefy.yaml` manifests (esp. workflows + layout), `scripts/`, `package.json`, `designs/workflows-module-concept/`, `plugins/.../src/blocks/`.
**Review files skipped:** `designs/documentation-v2/review/review-1.md`

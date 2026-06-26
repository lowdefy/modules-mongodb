# Task 11: Plugin Docs Migration (Phase 5a)

## Context

Decision 1 of the design applies to the plugin package and its blocks exactly as it does to modules: their canonical docs move into the central `docs/` tree, and the source-side READMEs shrink to stubs (the "a developer browsing the block source wants the doc right there" door is preserved by the stub). The plugin package has a package README plus six per-block READMEs already shipped — `ActionSteps`, `ContactSelector`, `DataDescriptions`, `EventsTimeline`, `FileManager`, `SmartDescriptions` — each at `plugins/modules-mongodb-plugins/src/blocks/{Block}/README.md`. There is also a `FetchRequest` action documented in the package README.

This task migrates that content into `docs/plugins/` and stubs the source-side READMEs.

## Task

**1. `docs/plugins/index.md`** (`type: index`, `module: plugins`) — package overview, install instructions, peer dependencies, and the `FetchRequest` action — mined from `plugins/modules-mongodb-plugins/README.md`. Link to each block reference page.

**2. One reference file per block** (`type: reference`, `module: plugins`), kebab-cased filenames matching the design tree:

```
docs/plugins/action-steps.md         (← ActionSteps)
docs/plugins/contact-selector.md     (← ContactSelector)
docs/plugins/data-descriptions.md    (← DataDescriptions)
docs/plugins/events-timeline.md      (← EventsTimeline)
docs/plugins/file-manager.md         (← FileManager)
docs/plugins/smart-descriptions.md   (← SmartDescriptions)
```

Mine each from its `src/blocks/{Block}/README.md` (props, events, slots, examples), adding front-matter.

**3. Stub the source-side READMEs:**

- `plugins/modules-mongodb-plugins/README.md` → stub pointing to `../../docs/plugins/`.
- Each `plugins/modules-mongodb-plugins/src/blocks/{Block}/README.md` → stub pointing to the matching `docs/plugins/{block}.md`.

## Acceptance Criteria

- `docs/plugins/index.md` exists with package overview, install, peer deps, and `FetchRequest`, plus links to all six block pages.
- Six `docs/plugins/{block}.md` reference files exist with `type: reference` front-matter and content migrated from each block's source README (props, events, slots, examples).
- `plugins/modules-mongodb-plugins/README.md` and all six `src/blocks/{Block}/README.md` are stubs pointing at the corresponding `docs/plugins/` page.
- The source-side stubs are **not** indexed by `gen-llms-txt.mjs` (they point at `docs/` pages the walk already covers) — confirm they live outside `docs/`.
- `node scripts/gen-llms-txt.mjs` picks up the new `docs/plugins/*.md` files; `pnpm docs:check` passes.

## Files

- `docs/plugins/index.md` — create.
- `docs/plugins/action-steps.md`, `contact-selector.md`, `data-descriptions.md`, `events-timeline.md`, `file-manager.md`, `smart-descriptions.md` — create.
- `plugins/modules-mongodb-plugins/README.md` — modify → stub.
- `plugins/modules-mongodb-plugins/src/blocks/{Block}/README.md` × 6 — modify → stub.

## Notes

- Filenames are kebab-case (`smart-descriptions.md`), matching the design's tree, even though the block directories are PascalCase.
- `FetchRequest` is an _action_, not a block — it belongs in `index.md` (package-level), not a per-block file.

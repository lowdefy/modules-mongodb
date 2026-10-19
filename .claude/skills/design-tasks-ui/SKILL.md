---
name: design-tasks-ui
description: Break a design that has a mockups/ folder into an ordered implementation task set, fanning each UI screen out into a mock → frame → layout → content → wire pipeline chain, plus the shared scaffold / write-side / docs / verify tasks. Use for a mockup-driven UI design; use r:design-task for non-UI designs.
---

# Design Tasks (mockup-aware)

Produce the complete ordered task set for a design that has a `mockups/` folder,
expanding each UI screen into a `mock-to-lowdefy` pipeline chain. This is the
mockup-aware variant of `r:design-task` — same output shape (a `tasks/` folder of
self-contained prompt files + a `tasks.md` map), different decomposition for the
UI screens. Non-UI designs keep using `r:design-task`.

## When to use

The design under `designs/<feature>/` has a `mockups/` folder (screens authored
by `lowdefy-mock`, or hand/AI mocks). If it has no mockups, use `r:design-task`.

## How this works

`design.md` is the **source of truth**; other non-review files are supporting
context; `review/` and `review*.md` are already-addressed feedback — **ignored**.
Output is `designs/<feature>/tasks/` (`tasks.md` + `NN-<name>.md` prompt files),
exactly as `r:design-task` specifies. Follow `r:design-task`'s Phase 3 file
formats (`tasks.md` table + per-task `Context / Task / Acceptance Criteria /
Files / Notes`) verbatim; this skill only changes the decomposition.

## Workflow

### Phase 1 — read the design

1. Read `designs/<feature>/design.md` thoroughly.
2. Read all other `.md` files in the design folder EXCEPT `review/` /
   `reviews/` subfolders and top-level `review*.md`.
3. Note the `mockups/` folder — enumerate the screens (each `mockups/screens/*`
   or equivalent is one UI screen to fan out).

### Phase 1b — read project context (flexible docs discovery)

Do NOT hardcode a docs path. Find the docs entry point flexibly so this skill
stays portable across Lowdefy projects: read the docs root starting from
whatever overview-type file exists at its root — `index.md`, then `README.md`,
then `Overview.md` — and follow its links to the entity/architecture docs for the
areas the design touches. (This repo's docs root is `docs/index.md`; older
projects use `docs/Overview.md`. Discover, don't assume.)

### Phase 1c — mine commit history

Search commit history for the design's keywords (feature/module names, file
paths) to reveal coupling and past decisions that affect ordering:

```bash
git log --all --grep="<keyword>" --format="%h %s%n%b" -20
git log --format="%h %s%n%b" -5 -- path/from/changes
```

Use the touched-file patterns to refine each task's Files section.

### Phase 2 — decompose (the UI fan-out)

Produce the complete ordered task set:

1. **Scaffold** the feature/module skeleton first — the module/app entry, page
   stubs, manifest wiring, and (per CLAUDE.md's mandatory demo-consumer rule) the
   `apps/demo/` consumer — so refs resolve and there is a buildable target to
   render into before the UI tasks run. Everything downstream depends on this.

2. **Per mockup screen, an ordered chain** — one task per phase, each referencing
   the exact skill/phase file and the design section it implements:
   - `lowdefy-mock` — only if the screen's mock needs authoring or normalising;
     skip when the design already ships a pipeline-ready mock.
   - **frame** — `mock-to-lowdefy` phase `phases/01-frame.md`. Output to
     `mockups/frames/`.
   - **layout** — `mock-to-lowdefy` phase `phases/02-layout.md`. Writes page +
     `components/*.yaml` into the module/feature source; does shared-component
     discovery first.
   - **content** — `mock-to-lowdefy` phase `phases/03-content.md`. Fills slots
     with real blocks + mock data + `TODO(request-substitute)` markers; consults
     the design's behavioural spec.
   - **wire** — resolve every `TODO(request-substitute)` marker into real
     `connections:`/`requests:`/operators/state/events, driven by the design's
     request+logic spec, using the `lowdefy-docs` MCP (request/operator/connection
     schemas, examples, docs). No bespoke wiring skill — this task consumes the
     markers directly.

   Within a screen the chain is strictly ordered (frame → layout → content →
   wire). Screens are independent of each other and can run in parallel once the
   scaffold exists — note that in the ordering rationale.

3. **Write-side** — routines/APIs from the design's spec, using the existing
   Lowdefy API/routine skills (`r:lowdefy-api-routines`, etc.). These feed the
   wire tasks' requests.

4. **Docs + verify** — a docs-update task (per the design's docs impact), and a
   final verify task: `pnpm ldf:b` build check, then render/e2e against the dev
   server the developer runs. The green-build gate belongs HERE, at the end —
   not after each UI phase (a UI page with mock data and `TODO` markers builds
   fine; those markers are YAML comments).

### Phase 3 — write the tasks

Create `designs/<feature>/tasks/` with `tasks.md` and the `NN-<name>.md` prompt
files, following `r:design-task`'s formats. Zero-padded kebab-case names
(`01-scaffold-module.md`, `02-members-frame.md`, …). Each UI task prompt names
the skill/phase to invoke, the mock/screen it operates on, the design section it
implements, and the files it writes — self-contained, no need to re-read the
design.

### Phase 4 — present

Summarise: total task count and decomposition rationale, the `tasks.md` table,
the per-screen chains and what can run in parallel, then ask whether to adjust
granularity, reorder, or merge/split.

## Guidelines

- **design.md is king** — implement what it says; don't add or reinterpret scope.
- **Don't repeat the design** — task prompts are self-contained instructions, not
  a copy of the design.
- **Be concrete** — real file paths, module names, skill/phase references.
- **Scaffold first, wire last** — the ordering that makes a buildable target
  exist before UI tasks, and defers the green-build gate to the end.
- **Skip review files completely.**

## Relationship to r:design-task

`design-tasks-ui` does not shadow or replace `r:design-task`; it reuses its
conventions for the non-UI tasks (scaffold, write-side, docs, verify) and its
output formats, and adds the per-screen pipeline fan-out. Non-UI designs, or
designs without a `mockups/` folder, use `r:design-task` directly.

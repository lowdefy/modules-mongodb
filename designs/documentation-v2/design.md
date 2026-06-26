# Documentation Design

The repo's docs are currently one README per module plus a shared `docs/idioms.md`. That model worked for getting every module _covered_, but it collapses four different reader needs — concept, task, reference, and contributor convention — into a single spec-like file per module, which fails badly for the concept-heavy modules (workflows above all). This design replaces the single-README model with a **central, intent-separated `docs/` tree** (`concepts/`, `how-to/`, `reference/` per module), migrates the rich conceptual material currently buried in `designs/` into consumer docs, splits cross-cutting idioms by audience, and adds front-matter + an `llms.txt` index so the docs serve human readers (incl. Obsidian), a future Lowdefy markdown-rendering app, and LLM agents equally well.

This is a **successor to the prior version of this design** (the one that produced today's per-module READMEs). The decisions that still hold — manifest as source of truth, a strong root landing page, derived var tables — are carried forward; the single-README structure is what changes.

## Proposed change

1. **Move canonical docs into a central `docs/` tree with one folder per module** (`docs/{module}/`). Each `modules/{name}/README.md` shrinks to a one-paragraph stub linking to `docs/{name}/`.
2. **Separate docs by intent within each module folder** — `concepts/` (explanation), `how-to/` (task guides), `reference/` (lookup) — applied proportionally to module complexity. **No tutorials.**
3. **Migrate the conceptual material from `designs/workflows-module-concept/` into `docs/workflows/concepts/`**, establishing a boundary: docs explain _how it behaves and how to author it_; designs keep _why it was built this way_.
4. **Split `docs/idioms.md` by audience**: consumer cross-cutting idioms become per-idiom files under `docs/shared/`; pure repo authoring conventions consolidate into `CLAUDE.md` so each fact lives in one place.
5. **Add front-matter (`title`, `module`, `type`, `concepts`) to every doc and generate `docs/llms.txt`** — a machine index of the whole doc set for agents and the future renderer.
6. **Derive reference var tables from `module.lowdefy.yaml`** so reference docs cannot drift from the manifest, and keep the manifest the source of truth for var schema.
7. **Author the workflows docs in full as the exemplar**, then migrate the remaining ten modules onto the same structure.

## Key decisions

### 1. Central `docs/` tree, not co-located per-module READMEs

The prior design co-located each module's docs at `modules/{name}/README.md` so they'd "travel with the module on a git tag." That reasoning is preserved by central docs anyway: consumers pull a whole repo tag (`github:lowdefy/modules-mongodb/...@tag`), so `docs/{name}/` is present at the same ref as the module's code. Nothing is lost by relocating.

What's _gained_ is navigation. A central tree reads like a documentation site, is Obsidian-friendly for any contributor who opens the repo as a vault (central tree + front-matter gives graph view and backlinks), and gives the future Lowdefy markdown app a single root to walk. A thin `modules/{name}/README.md` stub stays so GitHub still renders something useful when browsing the module directory, and so a reader who lands on the code finds the door to the docs.

The **same rule applies to the plugin package and its blocks**: their docs move into a central `docs/plugins/` folder, and the source-side READMEs (`plugins/.../README.md`, `src/blocks/{Block}/README.md`) shrink to stubs. The "a developer browsing the block source wants the doc right there" argument is the _same_ source-proximity case decision 1 already weighed for modules — the stub preserves that door without making the block docs an exception to the central tree.

### 2. Intent-separated docs (concepts / how-to / reference), no tutorials

The single-README model fails because it answers four questions in one voice:

- **Understanding** ("how does signal→status work?") → `concepts/`
- **Doing** ("how do I add a review step?") → `how-to/`
- **Looking up** ("what vars exist? what are the 8 statuses?") → `reference/`
- **Contributor conventions** ("snake_case request IDs") → `CLAUDE.md`, not the docs tree

Tutorials (a guided "build your first workflow from zero" walkthrough) are explicitly **out** — the team doesn't want to maintain them, and concept + how-to + reference cover the consumer's needs.

This is applied **proportionally**. A concept-heavy module (workflows) gets all three subfolders with many files; a simple module (release-notes) gets a single `index.md` and nothing else. We don't manufacture empty `concepts/` folders to look symmetric — docs scale to the module, matching the repo's "build for concrete needs, not speculation" principle.

### 3. Promote concepts from `designs/` into consumer docs

The best explanation of workflows — signals vs. status, the FSM, the three action kinds, hooks, groups, the worked onboarding example — already exists, well-written, in `designs/workflows-module-concept/` (8 sub-designs: `action-authoring/`, `action-groups/`, `engine/`, `state-machine/`, `submit-pipeline/`, `ui/`, `module-surface/`, `call-api/`). But it's build-time source-of-truth, mixed with implementation-part tracking and review critiques, and consumers never see it.

We migrate the **explanation** content into `docs/workflows/concepts/`, rewriting it for a consumer audience (drop implementation-part numbering, review findings, and "why we chose X over Y" rationale). The design folders stay as the historical record of _why_ — the boundary is:

| Question                                                    | Lives in   |
| ----------------------------------------------------------- | ---------- |
| How does this behave? How do I author it?                   | `docs/`    |
| Why was it built this way? What alternatives were rejected? | `designs/` |

This resolves a latent tension in `CLAUDE.md` ("designs are the source of truth"): designs remain source-of-truth for **code decisions**; docs become source-of-truth for **authoring behavior as a consumer experiences it**. When the two would disagree about _behavior_, docs win and the design gets a note; when they disagree about _rationale_, the design wins.

### 4. Split idioms by audience

`docs/idioms.md` (437 lines) currently mixes two audiences:

- **Consumer cross-cutting idioms** — `change_stamp`, `event_display`, `fields/components/request_stages` slots, `app_name`, `avatar_colors`, `secrets`. These describe how a _consumer_ uses shared behavior across modules. → split into per-idiom files under **`docs/shared/`**, linked from each module's reference docs instead of re-explained per module.
- **Repo authoring/code conventions** — naming, file structure, "payload not state", operator preferences. These are for people _working in this repo_. → these already live in `CLAUDE.md`; any such content currently in `idioms.md` folds back into `CLAUDE.md` so it isn't duplicated.

Per-idiom files (rather than one big page) match the "one concept per file" rule that serves the renderer and LLM agents, and keep Obsidian's graph meaningful. `idioms.md` itself is deleted once its content is split.

### 5. Front-matter + `llms.txt`

Every doc opens with YAML front-matter:

```yaml
---
title: Signals vs Status
module: workflows
type: concept # concept | how-to | reference | index | shared
concepts: [signals, fsm, status]
---
```

Obsidian reads front-matter natively; the future Lowdefy app reads it for titles/nav; LLM agents read it to filter. This **reverses the prior design's "front-matter forbidden" rule**, which was justified by "no renderer uses it" — we now have three consumers that do.

`docs/llms.txt` is a generated, flat index of every doc: path + one-line description, grouped by module. An agent reads one file and knows the entire doc surface. (Format follows the emerging `llms.txt` convention — a markdown list of links with descriptions.)

### 6. Manifest stays source of truth; reference var tables are derived

Carried forward from the prior design and strengthened: `module.lowdefy.yaml` holds every var's `type`, `default`, `required`, `enum`, and `description` (including nested properties). `docs/{module}/reference/vars.md` is **generated** from the manifest by a small script (`scripts/gen-var-docs.mjs`) rather than hand-restated. The generator is in scope for this design (it's small, and the central tree makes the output path predictable). Other reference pages (exports, indexes, grammar) stay hand-written.

Generation alone does _not_ kill drift, though — `vars.md` (and `llms.txt`) are **committed** files, so they go stale the moment someone edits a manifest and forgets to re-run the generator. Generation removes drift only when a check _enforces_ regeneration. So both generators gain a `--check` mode (regenerate to a temp, fail on any diff against the committed output), exposed as `pnpm docs:check` and run by a CI workflow on every PR (the front-matter linter rides along in the same check). The repo has no PR-CI today, so this adds its first such workflow — a deliberate, in-scope cost, because without the gate this is the same drift risk the prior design accepted, just relocated.

The bulk manifest audit from the prior design — filling every missing nested `description:` — is already done across all 11 manifests. What remains is narrow: closing the workflows `contacts_collection` TODO and reconciling the layout `logo.*` keys (see Phase 0). A clean, fully-described manifest is the prerequisite for generated var tables.

## Current state

What the prior design successfully produced and we keep (re-homing, not discarding):

- **Root `README.md`** (121 lines) — module list, Mermaid dep graph, "what to use when", consumer basics. Its _content_ is good; most of it becomes `docs/index.md`, with `README.md` kept as a short repo landing that links into `docs/`.
- **`docs/idioms.md`** (437 lines) — split per decision 4.
- **11 per-module READMEs** — content is mined into the new `docs/{module}/` trees, then each README becomes a stub.
- **Plugin package README + per-block READMEs** — all six blocks (`ActionSteps`, `ContactSelector`, `DataDescriptions`, `EventsTimeline`, `FileManager`, `SmartDescriptions`) already have a co-located `src/blocks/{Block}/README.md` (shipped by the prior design), plus a package README. Their _content_ is good and gets mined into a new central `docs/plugins/` folder (decision 1 applies to blocks too); each source-side README then becomes a stub, exactly like the module READMEs.

Loose ends to clean up:

- `modules/activities/VARS.md` — last surviving legacy VARS file; folded into `docs/activities/` and deleted.
- Two remaining manifest items — the workflows `contacts_collection` TODO and the layout `logo.*` key inconsistency (see Phase 0). The rest of the nested-description audit is complete.

Modules (11): `activities`, `companies`, `contacts`, `events`, `files`, `layout`, `notifications`, `release-notes`, `user-account`, `user-admin`, `workflows`. (`modules/shared/` is not a module — it holds referenced resources and gets no folder of its own; its contents are documented via `docs/shared/` idioms and the modules that consume them.)

## The doc tree

```
README.md                        ← short repo landing → links into docs/
docs/
  index.md                       ← module set, dep graph, when-to-use (from old root README)
  llms.txt                       ← generated machine index of every doc
  shared/                        ← consumer cross-cutting idioms (split from idioms.md)
    change-stamps.md
    event-display.md
    slots.md
    app-name.md
    avatar-colors.md
    secrets.md
  workflows/                     ← exemplar (full treatment)
    index.md                     ← overview, when-to-use, dependencies, quickstart snippet
    concepts/                    ← migrated from designs/workflows-module-concept/
      mental-model.md
      signals-vs-status.md
      action-kinds.md
      groups-and-blocking.md
      access.md
      hooks.md
      events.md
    how-to/
      add-a-review-step.md
      conditional-actions.md
      multi-app-access.md
      track-a-child-workflow.md
      instanced-actions.md
      write-a-hook.md
    reference/
      vars.md                    ← GENERATED from manifest
      authoring-grammar.md
      fsm-and-signals.md
      form-components.md
      exports.md
      indexes.md
  companies/
    index.md
    how-to/ ...                  ← only the subfolders the module actually needs
    reference/
      vars.md                    ← generated
      exports.md
  release-notes/
    index.md                     ← single page; nothing else
  ...one folder per module
  plugins/                       ← plugin package: 6 blocks + FetchRequest action
    index.md                     ← package overview, install, peer deps, FetchRequest
    contact-selector.md          ← per-block reference (type: reference)
    action-steps.md
    data-descriptions.md
    events-timeline.md
    file-manager.md
    smart-descriptions.md
modules/
  workflows/README.md            ← stub → "Full docs: ../../docs/workflows/"
  ...
plugins/modules-mongodb-plugins/
  README.md                      ← stub → "Full docs: ../../docs/plugins/"
  src/blocks/{Block}/README.md   ← stub → "Full docs: …/docs/plugins/{block}.md" (6 blocks)
```

### Per-module folder shape

Every module folder has an `index.md`. Beyond that, subfolders appear **only when the module has content for them**:

- `index.md` (required) — one-paragraph description, dependencies table, "when to use", a single worked `lowdefy.yaml` quickstart snippet, and links to the module's concept/how-to/reference pages and to relevant `docs/shared/` idioms.
- `concepts/` (concept-heavy modules only) — explanation, one concept per file.
- `how-to/` (modules with non-obvious tasks) — task-oriented, "to do X: …".
- `reference/` — `vars.md` (generated) always; `exports.md`, `indexes.md`, and module-specific grammar pages as needed.

`index.md` front-matter uses `type: index`; it replaces the old README's job and carries the dependency/quickstart content the prior template put under "How to Use".

## Front-matter schema

| Field      | Required | Values                                                      | Purpose                                     |
| ---------- | -------- | ----------------------------------------------------------- | ------------------------------------------- |
| `title`    | yes      | string                                                      | Human/nav title; renderer + Obsidian use it |
| `module`   | yes      | module name, or `plugins` / `shared` / `root`               | Grouping in `llms.txt` and the app          |
| `type`     | yes      | `index` \| `concept` \| `how-to` \| `reference` \| `shared` | Intent filter for agents/renderer           |
| `concepts` | no       | string[]                                                    | Topic tags for cross-linking and search     |

`llms.txt` is generated by walking `docs/**/*.md`, reading front-matter, and emitting grouped `- path: title — <first paragraph summary>` lines. A `docs/**` walk is complete coverage: every canonical doc — modules, shared idioms, **and the plugin package + blocks** — lives under `docs/`. The source-side `modules/{name}/README.md` and `plugins/.../README.md` stubs are intentionally _not_ indexed; each only points at a `docs/` page the walk already covers. Same script can validate that every doc has required front-matter (a cheap lint).

## Workflows exemplar — content sources

The workflows docs are authored first and drive the structure. Each target page maps to existing material so authoring is migration + rewrite, not invention:

| Target doc                        | Source                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `concepts/mental-model.md`        | `designs/workflows-module-concept/design.md` (worked onboarding example)                     |
| `concepts/signals-vs-status.md`   | `.../state-machine/` (FSM, signals, button bars) — the #1 confusion point                    |
| `concepts/action-kinds.md`        | `.../action-authoring/` (form / check / tracker)                                             |
| `concepts/groups-and-blocking.md` | `.../action-groups/` (rollup status, `blocked_by`, conditional-action rule)                  |
| `concepts/access.md`              | `.../action-authoring/` access model (per-app/per-verb, review-verb signal flip)             |
| `concepts/hooks.md`               | `.../submit-pipeline/` (pre/post, out-of-band writes, failure modes)                         |
| `concepts/events.md`              | `.../engine/` event logging + `docs/shared/event-display.md`                                 |
| `how-to/*`                        | demo workflows in `apps/demo/modules/workflows/workflow_config/` (onboarding, company-setup) |
| `reference/vars.md`               | generated from `modules/workflows/module.lowdefy.yaml`                                       |
| `reference/fsm-and-signals.md`    | `.../state-machine/` tables                                                                  |
| `reference/form-components.md`    | `modules/workflows/components/fields/README.md`                                              |
| `reference/authoring-grammar.md`  | current `modules/workflows/README.md` action-authoring sections                              |
| `reference/indexes.md`            | current README index requirements (+ the `actions` validator constraint)                     |

The complexity hotspots the exploration surfaced get **dedicated** treatment so they're findable, not buried: signals-vs-status, the conditional-action `blocked_by` anti-pattern, per-app/per-verb access, tracker `start_link` wiring, instanced-action form-data paths, and `allow_not_required`.

## Migration plan (all modules)

**Phase 0 — Manifest reconciliation.** The bulk audit (every nested `description:` across all 11 manifests) is already done. Remaining: resolve the workflows `contacts_collection` TODO (`modules/workflows/module.lowdefy.yaml:114`), and reconcile the layout `logo.*` keys against the actual layout block — the manifest defines `primary` / `primary_dark` / `style`, while `tasks.md:21` references `primary_light` / `icon`, so a real cross-check is owed. Prerequisite for generated var tables.

**Phase 1 — Scaffolding.** Create `docs/` skeleton, the front-matter convention, and `scripts/gen-var-docs.mjs` + `scripts/gen-llms-txt.mjs` (the latter doubles as the front-matter linter). Both generators take a `--check` mode (regenerate to a temp, exit non-zero on diff); wire them into a `pnpm docs:check` script and a new `.github/workflows/ci.yaml` that runs it on `pull_request` (the repo's first PR-CI workflow). Move root README content into `docs/index.md`; reduce `README.md` to a landing stub.

**Phase 2 — Shared idioms.** Split `docs/idioms.md` into `docs/shared/*.md`; fold contributor-convention content into `CLAUDE.md`; delete `idioms.md`. Update cross-links **only in files that survive as prose** — the root `README.md` and `CLAUDE.md`. The 9 module READMEs that currently link to `idioms.md#anchor` are intentionally _not_ rewritten here: they become stubs in Phase 4, so their idiom links vanish with the body — rewriting them now is wasted. The new `docs/{module}/` pages instead link to `docs/shared/` natively as they're authored (Phase 3–4).

**Phase 3 — Workflows exemplar.** Author `docs/workflows/` in full per the table above. Migrate concept content from `designs/workflows-module-concept/`. This proves the structure end-to-end before the other ten follow.

**Phase 4 — Remaining modules.** Migrate the other ten module READMEs into `docs/{module}/` trees, proportional to each module's complexity. Unlike workflows, these are all small — a single README has served each adequately to date — so most will collapse to an `index.md` plus a generated `reference/vars.md` (and `reference/exports.md` where it helps); `concepts/` and `how-to/` are the exception, added only where a module actually has non-obvious material. The per-module subfolder call is **delegated to the implementer at authoring time** rather than pre-specified here: the modules are simple enough that the judgment is cheap and low-risk, so a sizing table would be busywork that drifts. Fold and delete `modules/activities/VARS.md`. Reduce each `modules/{name}/README.md` to a stub.

**Phase 5 — Plugin docs + cleanup.** Migrate the package README and the six per-block READMEs (`ActionSteps`, `ContactSelector`, `DataDescriptions`, `EventsTimeline`, `FileManager`, `SmartDescriptions`) into `docs/plugins/` (`index.md` + one file per block), adding front-matter; reduce each source-side README to a stub. Regenerate `llms.txt`. Update `CLAUDE.md`: describe the new doc layout **and** amend the top-level "Designs are the source of truth" principle to encode decision 3's boundary — designs stay source-of-truth for code decisions and rationale, docs become source-of-truth for consumer-observable authoring behavior (behavior disagreement → docs win + note the design; rationale disagreement → design wins). Describing the layout is not enough; an agent reading the unamended principle will "fix" docs to match a stale design. Generate var tables for every module.

## Files changed (shape, not exhaustive)

**New:** `docs/index.md`, `docs/llms.txt` (generated), `docs/shared/{6 idioms}.md`, `docs/{11 modules}/...` trees, `docs/plugins/` (`index.md` + 6 block reference files), `scripts/gen-var-docs.mjs`, `scripts/gen-llms-txt.mjs`, `.github/workflows/ci.yaml` (runs `pnpm docs:check` on PRs).

**Modified:** root `README.md` (→ stub), all 11 `module.lowdefy.yaml` (manifest audit), all 11 `modules/{name}/README.md` (→ stubs), `plugins/.../README.md` + the 6 `src/blocks/{Block}/README.md` (→ stubs), `package.json` (add `docs:check` script), `CLAUDE.md` (absorb contributor idioms, describe new doc layout, **and amend the "Designs are the source of truth" principle** to encode the docs/designs boundary).

**Deleted:** `docs/idioms.md`, `modules/activities/VARS.md`.

## Open questions

1. **Generated var-table format** — full table (type/default/required/description) vs. a more readable nested layout for vars with deep object properties (workflows, companies). Decide when building `gen-var-docs.mjs`; lean table for flat vars, indented sub-lists for nested.
2. **Does the future Lowdefy markdown app live in this repo?** It could be dogfooded as a module, but that's a separate design. This design only commits to making the tree app-ready (consistent structure + front-matter), not to building the app.
3. **`llms.txt` granularity** — flat list of all docs vs. a tiered index (top-level pointers to per-module sub-indexes) if the doc count grows large. Start flat; revisit past ~80 docs.

## Non-goals

- Building the Lowdefy markdown-rendering app (future, separate design).
- Tutorials / guided walkthroughs (explicitly excluded).
- Versioned docs across releases — git tags are the version history.
- Auto-generating prose docs from manifests — only var _tables_ are generated; concepts and how-tos are hand-written.
- Documenting module _internals_ for maintainers — that audience is served by `designs/` and `CLAUDE.md`.

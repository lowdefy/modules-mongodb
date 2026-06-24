# Review 1

This design is a **successor** to the design that produced today's per-module READMEs. Most of its problems come from its "current state" snapshot having drifted from what that prior design *already shipped* — several things the design plans to build now exist, and several things it claims are "still owed" are already done. The structural proposal (central intent-separated tree) is sound; the migration plan needs re-baselining against the actual repo.

## Stale state assumptions

### 1. All six per-block plugin READMEs already exist — Phase 5 plans to write five of them

> **Resolved.** Verified all six block READMEs exist on disk (shipped by the prior design). Flipped `design.md:90` to state all six exist, rescoped Phase 5 from "write 5 missing" to "verify the six conform to the template + list in `llms.txt`", and removed "5 per-block READMEs" from the New files list.

The "Current state" section (`design.md:90`) says: *"`ContactSelector` has one; the other 5 blocks (`ActionSteps`, `DataDescriptions`, `EventsTimeline`, `FileManager`, `SmartDescriptions`) don't."* Phase 5 (`design.md:210`) then plans to *"Write the 5 missing per-block READMEs."*

All six already exist:

```
plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md
plugins/modules-mongodb-plugins/src/blocks/ContactSelector/README.md
plugins/modules-mongodb-plugins/src/blocks/DataDescriptions/README.md
plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/README.md
plugins/modules-mongodb-plugins/src/blocks/FileManager/README.md
plugins/modules-mongodb-plugins/src/blocks/SmartDescriptions/README.md
```

They were created by the prior design (`tasks.md:71-74`, all `[x]`). Phase 5 should be *"verify the six block READMEs conform to the template and list them in `llms.txt`"* — not author five. Re-check the current-state inventory against the tree before this design's tasks are generated, or the implementer wastes a phase re-writing existing docs.

### 2. The manifest audit (Phase 0) is largely already complete, not "still owed"

> **Resolved.** Confirmed the only remaining `TODO` across all 11 manifests is workflows `contacts_collection`, and the layout `logo.*` discrepancy is real (manifest has `primary`/`primary_dark`/`style`; `tasks.md:21` references non-existent `primary_light`/`icon`). Rescoped Phase 0 to "verify the audit holds + close those two items", softened `design.md:81`, and tightened the loose-ends list.

`design.md:81` and Phase 0 (`design.md:200`) state the manifest audit is *"still required"* / *"the prior design's Phase 1, still owed."* But `tasks.md:16-25` marks every manifest audit `[x]`, and spot-checking confirms it: `modules/companies/module.lowdefy.yaml` already has full nested `description:` text for every `components.*` property (`table_columns`, `filters`, `main_slots`, `sidebar_slots`, `download_columns`, `contact_card_extra_fields`).

The genuinely-remaining manifest work is narrow:
- the workflows `contacts_collection` `TODO` block (`modules/workflows/module.lowdefy.yaml:114-115`) — confirmed still present and the only `TODO` across all 11 manifests;
- the layout `logo.*` key reconciliation (`design.md:95`) — the manifest defines `primary` / `primary_dark` but `tasks.md:21` references `primary_light` / `icon` / `style`, so a real cross-check is owed.

Phase 0 should be scoped to *"verify the audit holds and close the workflows `contacts_collection` TODO + layout `logo.*` reconciliation"*, not re-run a full audit that's already done. As written it over-states the remaining effort.

### 3. `tasks.md` tracks the superseded design, not this one

> **Resolved.** Resolved structurally: the successor design was split into `designs/documentation-v2/`, leaving the stale `tasks.md` co-located with the prior design (`designs/documentation/`) it actually tracks. The successor folder has no `tasks.md`, so nothing masquerades as its plan — a fresh checklist gets generated from the Phase 0–5 migration plan via `/r:design-task` after this review.

`designs/documentation/tasks.md` is the prior design's checklist (per-module READMEs, single `docs/idioms.md`, "5 blocks + 1 action") — every box is `[x]`, and it references a `modules/data-upload/` module (`tasks.md:18`) that no longer exists in the tree. It contains **no** tasks for this design's Phase 0–5 migration. Anyone running an action/implementation pass off `tasks.md` will work the wrong, already-finished plan. Regenerate `tasks.md` from this design's Migration plan before implementation.

## Correctness / contradictions

### 4. `llms.txt` generator scope can't see the docs it's claimed to index

> **Resolved.** Closed structurally rather than by widening the walk: the plugin block docs were the one doc set left out of the central tree (an unjustified exception to decision 1), so they now migrate into a new `docs/plugins/` folder (`index.md` + per-block files) with source-side stubs, mirroring the module pattern. A plain `docs/**` walk is then complete coverage — every canonical doc lives under `docs/`. Module/plugin source-side READMEs are intentionally *not* indexed (each only points at a `docs/` page already covered). Applied across decision 1, the doc-tree diagram, current-state, front-matter schema (`module: plugins`), the generator note, Phase 5, and Files-changed.

`design.md:174` defines generation as *"walking `docs/**/*.md`."* But `design.md:90` says the co-located plugin block READMEs (under `plugins/...`) *"get listed in `llms.txt`"*, and the plan keeps `modules/{name}/README.md` stubs (under `modules/...`) as the door into the docs. Neither path is under `docs/**`, so a `docs/**`-only walk silently omits them.

Either the generator must also walk `plugins/**/README.md` and `modules/**/README.md`, or the design should state that `llms.txt` indexes the `docs/` tree only and link out to plugin/module READMEs by hand. Pick one and make the generator spec match the coverage claim.

### 5. "Generated var tables cannot drift" is overclaimed without a CI/pre-commit check

`design.md:78-79` says deriving `reference/vars.md` from the manifest *"kills the drift the prior design accepted as a known risk."* It doesn't — committed generated output drifts the moment someone edits a manifest and forgets to re-run `gen-var-docs.mjs`. Generation only removes drift if a check enforces it. The design specifies the generator but no enforcement. Add a CI step / pre-commit hook that runs both generators and fails if `vars.md` or `llms.txt` are out of date (the front-matter linter in `gen-llms-txt.mjs` is the natural home). Without it this is the same drift risk, just relocated.

### 6. CLAUDE.md's "Designs are the source of truth" principle conflicts with the new boundary, and only the "documentation section" is slated for update

Decision 3 (`design.md:49`) establishes docs-win-for-behavior, designs-win-for-rationale. But the top-level `CLAUDE.md` principle reads flatly *"Designs are the source of truth. Code implements designs; when they disagree, update the design first."* Phase 5 (`design.md:210`) only updates *"CLAUDE.md's documentation section"* to describe the new layout — it does not amend that core principle. An agent reading the literal principle will treat `designs/` as authoritative for behavior and "fix" docs to match a stale design. Phase 5 must explicitly amend the "Designs" principle to encode the docs/designs boundary, not just add a layout description.

## Scope / planning

### 7. The other ten modules are hand-waved as "proportional" with no per-module shape

The workflows exemplar is specified page-by-page with sources (`design.md:180-194`), which is excellent. Phase 4 (`design.md:208`) covers the remaining ten with only *"proportional to each module's complexity."* That's the bulk of the work (≈10 trees, dozens of files) with no per-module breakdown — which modules get `concepts/`, which collapse to a single `index.md`, what each `how-to/` covers. Without a rough per-module sizing, Phase 4 is unestimable and the "proportional" judgment gets re-litigated per module at authoring time. Add a short table: module → subfolders it gets → page count, even if approximate. `release-notes` (`index.md` only) and `workflows` (full) anchor the two ends; place the other nine.

### 8. Splitting `idioms.md` breaks the cross-links the prior design just wired in

Decision 4 deletes `docs/idioms.md` and splits it into `docs/shared/*.md`. The prior design wired `docs/idioms.md#anchor` links into all 11 module READMEs (`tasks.md:34-41` defines those anchors; the CLAUDE.md doc section references them: `#change-stamps`, `#event-display`, …). Phase 2 (`design.md:204`) says *"Update existing cross-links"* but those same READMEs become stubs in Phase 4. Sequencing them apart means rewriting links in Phase 2 that get deleted in Phase 4. Call out that the idiom-link rewrite and the README→stub reduction for each module should happen together, or that Phase 2 only needs to fix links in files that *survive* (root README, CLAUDE.md).

## Minor

### 9. The Obsidian rationale rests on a gitignored, per-user vault

> **Resolved (auto).** Verified `.obsidian` is gitignored (per-user, not a tracked repo artifact). Softened `design.md:23` to "is Obsidian-friendly for any contributor who opens the repo as a vault," dropping the "the repo already has a `.obsidian/` vault" framing that implied a committed, team-wide capability.

Decisions 1 and 5 lean on *"the repo already has a `.obsidian/` vault"* (`design.md:23`) to justify the central tree and front-matter (*"graph view and backlinks for free"*). `.obsidian` is **gitignored** (`git check-ignore .obsidian` → ignored; nothing tracked under it) — it's one contributor's local vault, not a shared repo artifact. The benefit is real for whoever opens the tree in Obsidian, but the phrasing implies a committed, team-wide capability that doesn't exist. Soften to "the central tree + front-matter is Obsidian-friendly for any contributor who opens it as a vault," and don't count it as an existing repo feature.

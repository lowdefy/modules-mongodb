# Mock → Lowdefy pipeline skills

This repo needs a repeatable way to turn a feature's UI mockups into real
Lowdefy page config, wired into the design workflow. The `ldf-evals` repo built
and measured a three-step pipeline (HTML mock → structural frame → Lowdefy
layout → content) that clearly beats an unguided agent at producing correct
Lowdefy. We are porting that proven pipeline into three project-local skills — a
mock author, the mock→Lowdefy pipeline itself, and a mockup-aware task
orchestrator — that emit real config on this repo's shared components and hand
off to existing wiring skills. The port carries the skills' hard-won discipline
faithfully; what it removes is the eval-harness scaffolding (grading tags,
answer-key tables, fixed palettes) that is noise anywhere there is no grader.

## Proposed change

1. Add **`.claude/skills/lowdefy-mock`** — authors a pipeline-ready HTML mockup
   in the app's Ant Design / Lowdefy look, tagging the shared components it
   expects to reuse. Doubles as a normaliser for an existing hand/AI mock.
2. Add **`.claude/skills/mock-to-lowdefy`** — one skill, three phases in separate
   files (**frame → layout → content**). Ports the eval skills' structural
   discipline faithfully, bundles the frame dialect (today a harness asset) as a
   skill asset, and strips the grading scaffolding. Output is real Lowdefy YAML
   written into module source, built on shared components, with
   `TODO(request-substitute)` markers for wiring.
3. Add **`.claude/skills/design-tasks-ui`** — a mockup-aware task orchestrator
   (distinct from `r:design-task`). When a design has a `mockups/` folder it fans
   out, per screen, into an ordered task chain (mock → frame → layout → content →
   wire) plus the shared scaffold / write-side / docs / verify tasks.
4. The new skills look up Lowdefy block knowledge via the dev server's
   **`lowdefy-docs` MCP** — schemas, props, examples, docs — and do **not**
   reference `.claude/guides/` or the `r:lowdefy-*` plugin skills. The MCP ships
   with the Lowdefy dev server, so it is present in every Lowdefy project by
   construction. The existing guides/skills are left as-is; the new skills simply
   don't depend on them (Decision 4).
5. No bespoke request-wiring phase for the data/logic seam: the pipeline stops at
   `TODO(request-substitute)` markers, and `design-tasks-ui` emits a wiring task
   that resolves them against the same `lowdefy-docs` MCP.

## Background

The source pipeline lives in `ldf-evals/skills/`:

- `01-mock-to-frame` — abstracts a detailed HTML mock into a **frame**: a
  structural wireframe written in a strict CSS "dialect" that replicates the
  Lowdefy layout engine (24-column spans, sizeless containers, sized leaf
  placeholders). The frame is both a geometry contract and a human-editable
  design surface (every area renders its own id).
- `02-frame-to-lowdefy` — mechanically translates the frame into a Lowdefy block
  tree: structural blocks (`Box`/`Card`/lists/page shell) carry no size, and
  every leaf becomes a sized `Html` placeholder slot carrying the block id.
- `03-fill-content` — replaces each placeholder slot with a real, mock-data-
  hydrated block (tables, inputs, tags, charts), leaving `TODO(request-substitute)`
  markers for the data wiring that never got a skill.

`ldf-evals/docs/real-world-recommendations.md` captures what breaks when these
run against a real app in an existing repo, and drove most of the decisions
below. The headline: the _structural discipline_ (sizeless structural blocks,
geometry from `layout:`, the placeholder-slot model, mechanical frame→YAML
translation) is the value and clearly beats an unguided agent; the _harness
assumptions_ (region tags, `er_` ids, the placeholder palette, a measured-region
answer key, palette-only output, the self-contained-buildable assumption) are
noise in real work and must go.

**Provenance — the port starts from HEAD, not an older revision.** The current
`ldf-evals` skills are essentially their own proven peak: skills 1 and 2 are
byte-identical to the highest-scoring eval run, and skill 3 carries only one
round of genuine per-corpus-case tuning to prune (see Section B, "Stripped").
The eval score does drop in later runs, but with the skill files unchanged —
those were infra/corpus-prep failures, not skill regressions. So there is no
cleaner earlier commit to recover; we take HEAD and strip the eval scaffolding
_by content_.

## The three skills

### A. `lowdefy-mock` — author a pipeline-ready mock

Guidance for **generating** a mockup that the pipeline can consume by
construction (authoring is the primary mode; normalising an existing mock is the
secondary mode). It produces one canonical 1440px HTML mock with self-contained
CSS, one element per semantic area with clean grouping, spacing from a small
consistent scale, and interaction states (modal/drawer/tab/collapse) as explicit
separable layers. It is a standalone authoring skill — invoked directly, not
wired into `r:design`'s Visual Companion (see Non-goals).

Two repo-specific responsibilities:

- **App look.** The mock should read as the Lowdefy Ant Design app it will
  become — antd-style components and spacing where accurate — so the eventual
  visual comparison is meaningful and shared-component regions are recognisable.
- **Shared-component tagging.** Where an area maps to a component the app already
  provides, the mock tags it (e.g. a `data-ldf-component` marker naming the
  component), so the frame/layout phases reuse it instead of hand-rolling chrome.

### B. `mock-to-lowdefy` — the pipeline

One skill, phases in separate files under the skill directory:

```
.claude/skills/mock-to-lowdefy/
  SKILL.md                       # overview + phase router
  phases/01-frame.md             # mock → frame (dialect)
  phases/02-layout.md            # frame → sizeless structure + slots
  phases/03-content.md           # fill slots with real blocks
  assets/frame.css               # the frame dialect stylesheet (ported asset)
  references/frame-dialect.md     # the dialect structure rules
  references/lowdefy-layout.md    # layout-engine mechanics + anti-patterns
  references/lowdefy-blocks.md    # structural block model, style slots, shell
  references/input-blocks.md      # the default input vocabulary
```

**Ported (the proven value).** This is a faithful port, not a stripped-down
sketch — the discipline below is what makes the output correct Lowdefy:

- The **frame dialect** (24-col spans, sizeless containers, sized leaves). It
  currently lives in the eval _harness_ (`ldf-evals/harness/frame.js`,
  `FRAME_CSS`) and is injected into the task prompt — not present in the skill
  files today. Porting means lifting it into `assets/frame.css` +
  `references/frame-dialect.md`.
- The **sizeless-structural-block + placeholder-slot model** and **mechanical,
  non-redesigning translation** between phases (skill 2's core).
- The **layout-engine reference** (`lowdefy-layout.md`): 24-column grid math, the
  `align`/`selfAlign` release-shim (a lone `align` is dropped — always pair it),
  the breakpoint cascade, and the geometry anti-patterns that stop containers
  inflating. The MCP does not teach any of this.
- The **structural block reference** (`lowdefy-blocks.md`): where flat `style:`
  lands (the `bl-<id>` wrapper), Card `.body` padding vs the v4 `bodyStyle`
  no-op, the `ListSelector → ControlledList → List` preference order, and the
  `PageHeaderMenu` 104px shell compensation.
- Skill 3's **block-archetype table** (mock visual → block type) and
  **production-polish rules**: dark-mode pinning, `Tag` presets over hand-rolled
  pills, `EChart` for chart-shaped visuals, the AgGrid `cell`-shorthand idiom,
  the "quote every `#` or your colours die" YAML rule, and the
  Tailwind-gradient-compile gotcha.
- The **input-block vocabulary** (`input-blocks.md`) and the
  **`TODO(request-substitute)` marker trail** — the seam to the wiring task.

**Stripped (harness-only noise):**

- `data-eval-region` / `data-eval-type` tags and the closed-multiset "region
  contract" grading.
- The `er_` id convention — real descriptive snake_case ids become the real
  block ids.
- The placeholder palette (`#101014` / `#1a1a1f` / `#2b2b31`) + the label/grading
  recipe, palette-only output, and the self-contained-buildable assumption.
- The measured-region-table used as an _answer key_ (adapted, not just dropped —
  see below).
- The "auto mode (headless test runs)" section and grader-internal leaks
  ("caps the Html share ~15%", "a graded failure").
- Skill 3's one genuinely over-fit block — the `s07/004` chart/tag recipe (a
  verbatim sparkline, status→hex `colorMap`s keyed to that corpus case, and the
  "EChart ALWAYS / Html is a graded failure" absolutism). Keep the _principle_
  (charts → `EChart`, pills → `Tag`, don't hand-roll) as a one-liner; drop the
  recipe and the absolutism.

**Adapted for a real app:**

- **Numbers derive from the mock's CSS, not an answer key.** Skill 1's "numbers
  are copied, not guessed" copies from the harness's measured-region-table — the
  grader's answer key. In real mode there is no answer key: spans come from the
  mock's column ratios, gaps/paddings from its real CSS, and the frame is
  verified by _rendering it beside the mock_, not checked against a measured
  table. The discipline (derive geometry faithfully, never hallucinate or nudge
  with margins) is preserved; the measured-table apparatus is dropped. This is
  the single load-bearing transform of the port.
- **Shared-component discovery** at the top of the layout phase. Map frame
  regions onto existing components _first_, hand-roll only what has no shared
  equivalent. Discovery is mechanical, not a maintained list (Decision 3).
- **Content phase looks up block schema/props via the `lowdefy-docs` MCP**
  (Decision 4). It pre-decides obvious block types from repo conventions
  (AgGridBalham for tables, the `Pagination` block, etc.) and reserves questions
  for genuine forks.
- **Design spec is a co-input**, not just the mock. A static mock can't show
  per-tab/per-state ownership, shared-vs-per-instance, conditional visibility, or
  data bindings; the content phase consults the design's behavioural spec for
  those. (The frame stays purely visual.)
- **No theme derivation.** Drop skill 3's opening "propose `theme.antd.token`
  from the mock" step. A module doesn't own the app theme, and on an app with an
  established theme, mock/theme mismatch is expected. Match intent within the
  existing theme; surface a genuine divergence as a flagged suggestion only.
- **Frame sizes on data blocks are placeholders.** A table drawn at a mock's
  row-count height becomes the repo idiom (`height: 70vh`), not the frame height.
  Only fixed-chrome regions inherit exact frame heights.

Output is real Lowdefy YAML written into the target module source (multi-file:
page + `components/*.yaml` via plain-path `_ref`), on shared components, with
`TODO(request-substitute)` markers at every mock-data site.

### C. `design-tasks-ui` — mockup-aware orchestrator

A project-local task skill, separate from and not shadowing `r:design-task`. It
produces the complete ordered task set for a design that has a `mockups/` folder,
expanding UI screens into pipeline chains:

1. **Scaffold** the feature/module skeleton (so refs resolve and there is a
   buildable target; also satisfies CLAUDE.md's mandatory demo-consumer rule).
2. **Per mockup:** `lowdefy-mock` → frame → layout → content → **wire**, each task
   referencing the relevant skill/phase and the design section it implements.
3. **Write-side** routines/APIs from the spec (existing skills).
4. **Docs + verify** (build with `pnpm ldf:b`; render/e2e against the dev server
   the developer is running).

Non-UI designs keep using `r:design-task`; `design-tasks-ui` is the mockup-aware
variant, "full multi-screen from the start" — the fan-out logic is complete.

## Key decisions

1. **Three skills, not one.** Mock authoring (A) is separate from the pipeline
   (B) because a mock is often authored independently and B should consume a
   finished mock regardless of origin. The pipeline's own three steps are phases
   of one skill (B) because they are a single mechanical sequence sharing one
   dialect and one contract.

2. **Keep the discipline, strip the grading — by content, not by revert.** "Strip
   the eval stuff" must not strip the frame dialect, the sizeless-block + slot
   model, or the layout/block references — that discipline is the mechanism that
   makes frame ≈ Lowdefy layout and is what beats an unguided agent. Only the
   grading apparatus is removed (region tags, `er_` ids, the placeholder palette,
   the measured-table answer key, palette-only output, auto/headless mode). The
   frame dialect must additionally be _lifted out of the harness_
   (`harness/frame.js`) since it is not in the skill files today. Because skills 1
   and 2 are already at their proven peak and only skill 3 carries per-case
   tuning, stripping is a content edit on HEAD, not a checkout of an older commit.

3. **Shared-component discovery is mechanical, not a maintained inventory.** A
   hand-maintained component list is another thing to drift. Instead: reusable
   components are the `exports.components` declared in each
   `modules/*/module.lowdefy.yaml` (e.g. `layout` → `page, card,
floating-actions, auth-page`; `events` → `change_stamp, event_types,
events-timeline`; `user-account` → `profile-avatar, user-selector,
user-multi-selector, user-avatar`), plus `modules/shared/layout/`
   (`title-block, pagination, sort-filters, card`). App-local components are
   discovered in `/components/` folders. The always-there fixed set is the layout
   module's exports. Specific intended components come from the design/mock's
   tags. This matches the repo's existing "manifest is the source of truth"
   stance and needs no new artifact.

   Discovery is two steps, because knowing an id exists is not enough to _reuse_
   it: the manifest export carries only `id` + `description`, but emitting a
   correct `_ref` needs the component's `vars`/`slots` interface. So (1)
   enumerate candidate ids from `exports.components` across the manifests (plus
   the `modules/shared/layout/` and app-local `/components/` files), then (2) for
   each region mapped onto a shared component, read that component's YAML to
   extract its `_ref` `vars`/`slots` contract before wiring it. Step 1 is the
   index; step 2 is the contract. (The `lowdefy-docs` MCP covers built-in _block_
   schemas; these composed components are repo source, so their contract lives in
   the component file, not the MCP.)

4. **The new skills look up block knowledge via the `lowdefy-docs` MCP, not via
   `.claude/guides/` or `r:lowdefy-*`.** `lowdefy agent-setup` writes a
   `.mcp.json` with an HTTP MCP served _by_ the dev server
   (`{"lowdefy-docs": {"type":"http","url":"http://localhost:<port>/lowdefy-docs/mcp"}}`),
   release-exact and including local plugins. Tools: `lowdefy_list_types`,
   `lowdefy_get_schema`, `lowdefy_get_examples`, `lowdefy_search_docs`,
   `lowdefy_get_doc`, plus live-app `lowdefy_build_status`,
   `lowdefy_get_page_config`, `lowdefy_screenshot_page`. Because the MCP is served
   by the dev server, it is present in every Lowdefy project by construction —
   these skills target all Lowdefy projects, so it is the one live reference they
   can rely on everywhere.

   This draws a clean line: the MCP is where the skills resolve **per-block
   schema, props, examples and docs** (release-exact, no drift, no vocabulary
   baked into the skill files); the skill's **own bundled references** carry the
   layout _discipline_ the MCP doesn't teach (Section B). The new skills therefore
   do not reference `.claude/guides/` or the `r:lowdefy-*` plugin skills for block
   knowledge. Those existing skills/guides are **left untouched** — this design
   does not modify or retire them; it just doesn't build on them, so the new
   skills stay portable across every Lowdefy project.

   Developers run the dev server themselves; the content/wire phases assume it is
   up. The only command the agent runs is `pnpm ldf:b` (build-only compile check),
   and the "view in the app" step is literally `lowdefy_screenshot_page` against
   the developer's server. _(Verified how agent-setup wires the MCP; watching it
   actually serve a schema is a v1 validation step, since it needs a live
   server.)_

5. **No "known-red until wired" ceremony.** A UI page with mock data and
   `TODO(request-substitute)` markers builds fine — the markers are YAML comments
   and missing requests just mean blocks render without data. The reason output
   is rendered in `apps/demo` is cross-module `_ref` resolution (a module page
   `_ref`s `layout`, `user-account`, `notifications`) plus the mandatory
   demo-consumer rule — not the markers. So: UI task produces a page (builds or
   not, no shims), the wire task follows, then it is testable. Validated
   empirically when the first screen is wired into `apps/demo`.

6. **No bespoke wiring phase.** The pipeline dead-ending at
   `TODO(request-substitute)` is intentional; `design-tasks-ui` emits a wiring
   task that consumes the markers and resolves them against the `lowdefy-docs`
   MCP (request/operator/connection schemas, examples, docs), rather than a
   bespoke fourth pipeline phase. Agents wire well given a good frame and the MCP.

## Artifacts: what ships vs. what's provenance

- **Frames (html + preview png), ledgers, mapping notes** — design intermediates.
  Kept beside the design (a `mockups/` folder), committed for provenance. Not
  shipped into the app source.
- **Lowdefy YAML** — the product. Lands directly in the module/feature source
  from the layout phase onward (the content phase edits in place).

## Non-goals

- Improving the skills _beyond_ the quality the eval pipeline already proved, and
  standing up any eval/optimisation loop of our own. The port faithfully carries
  the existing quality; extending it is separate, later work.
- A bespoke request-wiring skill (Decision 6).
- App-wide theme changes driven by a mock (Section B, "No theme derivation").
- Modifying or retiring `.claude/guides/` or the `r:lowdefy-*` skills — the new
  skills simply don't reference them (Decision 4).
- Upstreaming to the `r` plugin — these live in this repo's `.claude/skills/`
  first; upstreaming is a later, separate step.
- Visual Companion integration — an upstream `r`-plugin skill can't invoke a
  project-local skill, produces low-fidelity throwaway wireframes, and assumes
  an uncommitted `designs/` tree, none of which fit `lowdefy-mock`'s persisted,
  antd-accurate, pipeline-ready mock. A follow-up once these skills upstream, not
  a v1 responsibility.

## Open questions

- Exact mechanism/attribute for shared-component tags in the mock
  (`data-ldf-component="..."`?) — settle during `lowdefy-mock` authoring.
- How `design-tasks-ui` shares logic with `r:design-task` for the non-UI tasks
  (reference its conventions vs. delegate) — settle during that skill's authoring.
  Whichever direction: the context-reading step must discover the docs entry
  point flexibly — read the docs folder starting from whatever overview-type file
  exists at its root (`README.md` / `index.md` / `Overview.md`) and follow its
  links — rather than hardcoding a path. `r:design-task` reads `docs/Overview.md`
  (an older convention still used in client projects); this repo's docs root is
  `docs/index.md`. Flexible discovery keeps `design-tasks-ui` portable across all
  Lowdefy projects instead of inheriting a repo-specific filename.
  </content>
  </invoke>

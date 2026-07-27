# Review 1

Scope: `designs/mock-to-lowdefy-pipeline/design.md`. Verified against the `ldf-evals`
source pipeline (`/Users/sam/Developer/ldf-evals/skills/`), the `r` plugin skills
(`~/.claude/plugins/marketplaces/resonancy/skills/`), the module manifests, and the
installed Lowdefy toolchain.

## Coupling & wiring gaps

### 1. The `lowdefy-mock` ⇄ Visual Companion relationship doesn't hold up

> **Resolved.** Dropped both VC-coupling claims (the "generator the VC uses" line in Proposed change item 1, and the "what the VC invokes, replacing `mockup-template.html`" sentence in Section A). `lowdefy-mock` is now stated as a standalone authoring skill. Added a Non-goals entry recording why VC integration doesn't fit v1 (no cross-invocation path, different fidelity, uncommitted-`designs/` assumption) and marking it a follow-up once the skills upstream. Verified the VC's throwaway/scratch storage and wireframe-fidelity assumptions against `visual-companion.md`.

Two claims tie `lowdefy-mock` to `r:design`'s Visual Companion: it "replaces its
ad-hoc `assets/mockup-template.html` output" (design.md:82–84) and "is what
`r:design`'s Visual Companion invokes" (design.md:19–20). Both are problematic:

- **No invocation path.** The Visual Companion is an upstream `r`-plugin skill
  (`~/.claude/plugins/marketplaces/resonancy/skills/design/visual-companion.md`).
  `lowdefy-mock` is a project-local `.claude/skills/` skill (design.md:16). An
  upstream skill can't invoke a repo-local skill by name — nothing wires them —
  and "Upstreaming… is a later, separate step" is an explicit non-goal
  (design.md:226–227). So the integration as written has no mechanism.

- **Different artifact, different fidelity.** The Visual Companion produces
  deliberately low-fidelity wireframe fragments to elicit _verbal_ A/B/C feedback
  ("Keep mockups simple", "wireframes for layout" — visual-companion.md:249,241),
  in a single self-refreshing file it periodically "unloads" to a waiting screen
  (lines 99–111). `lowdefy-mock` needs the opposite: a persisted, per-screen,
  antd-accurate, shared-component-tagged 1440px mock the pipeline consumes by
  construction (design.md:66–80). One tool answers "which layout feels right?"; the
  other emits a build input. They are not the same skill wearing two hats.

- **Storage assumption clashes.** The Visual Companion treats the mock as scratch
  because "the `designs/` tree is not committed" (visual-companion.md:75–77). In
  _this_ repo `designs/` **is** tracked (`git ls-files designs/` returns files), and
  this design deliberately commits mockups "for provenance" (design.md:214). The VC's
  throwaway model is wrong for the pipeline's persistent-input model.

**Fix:** Make `lowdefy-mock` a standalone authoring skill and drop the
VC-replacement / VC-invocation claims from v1. If Visual Companion integration is
genuinely wanted, it needs its own design once these skills upstream — track it as a
follow-up, not a v1 responsibility.

## Dependency & factual risks

### 2. Decision 4 rests on an unreleased, unpinned experimental Lowdefy feature

> **Rejected.** Premise is incorrect. The `lowdefy-docs` MCP is served _by_ the Lowdefy dev server, so it ships with the toolchain and is present in every Lowdefy project by construction — not an unreleased/unpinned add-on. The review misread the experimental build's missing CLI string as the feature being absent. The MCP is not a risk to hedge against; the correct response is the opposite of the proposed fix. Decision 4 was reshaped to make the MCP the **sole** source of truth (not "primary + fallback"), and the legacy `.claude/guides/` + `r:lowdefy-*` fallback was removed outright (see #3). These skills target all Lowdefy projects, so the always-present MCP is the one reference they can rely on everywhere.

Decision 4 (design.md:181–195) makes the `lowdefy-docs` MCP the _primary_ source of
truth for block schemas in the content/wire phases, wired by `lowdefy agent-setup`.
But the installed toolchain is `lowdefy@0.0.0-experimental-20260714122106`
(`apps/demo/package.json:22`) — an experimental build dated one day before this
design — and `agent-setup`/`lowdefy-docs`/any `mcp` reference is absent from the
installed CLI (`grep -rl 'agent-setup\|lowdefy-docs\|mcp' node_modules/@lowdefy`
returns nothing; no `.mcp.json` exists in the repo). The design marks the wiring
"Verified" (design.md:195), but the primary-source-of-truth strategy for two of three
pipeline phases depends on a feature that isn't in a pinned release.

**Fix:** State the minimum Lowdefy version that ships `agent-setup`/`lowdefy-docs` and
pin it (or gate the MCP path on its presence, which the design already does as
fallback). Until pinned, treat the guides/`r:lowdefy-*` fallback as the _baseline_
the skills must work against, with the MCP as an enhancement — not the reverse.

### 3. Decision 4's offline fallback (`.claude/guides/`) does not exist in this repo

> **Resolved.** Correct that `.claude/guides/` doesn't exist — but the fix is to _remove_ the fallback, not repoint it at `r:lowdefy-*`. Both `.claude/guides/` and the `r:lowdefy-*` plugin skills are a legacy per-repo documentation attempt being retired; new projects won't have them, and these skills target all Lowdefy projects. Since the `lowdefy-docs` MCP (always present — see #2) covers the same ground, the skills now depend on it alone with no offline fallback. Removed the fallback from Decision 4, Proposed-change items 4 & 5, the Section B content-phase bullet, and Decision 6 (wiring), which previously pointed at `r:lowdefy-*` too.

Decision 4 names "`.claude/guides/` + `r:lowdefy-*`" as the offline fallback
(design.md:189, also Section B, design.md:118–120). But `.claude/guides/` does not
exist on disk and has never been committed on any branch
(`git log --all -- '.claude/guides/*'` is empty; `.claude/` tracks only
`settings.json`) — despite CLAUDE.md's extensive "Guides" table pointing there. The
only fallback that actually exists is the `r:lowdefy-*` plugin skills (confirmed at
`~/.claude/plugins/marketplaces/resonancy/skills/lowdefy-*`).

**Fix:** Make the fallback the `r:lowdefy-*` skills (which exist and the design
already lists). Treat the missing `.claude/guides/` as a separate pre-existing
CLAUDE.md inconsistency — don't have this design silently assume guides that aren't
there.

## Discovery mechanism underspecified

### 4. "Mechanical" shared-component discovery needs the `_ref` contract, not just ids

> **Resolved.** Verified the manifest export carries only `id` + `description` (`modules/layout/module.lowdefy.yaml`), while `components/page.yaml` is parameterized by `_var:` references and a `slots:` section — so ids alone can't correctly parameterize a `_ref`. Elaborated Decision 3 to make discovery explicitly two-step: (1) enumerate candidate ids from `exports.components`; (2) read the mapped component's YAML to extract its `vars`/`slots` contract before wiring. Also noted the MCP covers built-in block schemas but not these composed components, whose contract lives in the component file.

Decision 3 (design.md:170–179) says reusable components are discoverable from
`exports.components` in each `module.lowdefy.yaml`, needing "no new artifact." That's
true for _enumerating_ components, but knowing an id exists is not enough to _reuse_
one: emitting a correct `_ref` requires each component's `vars`/slots interface, and
the manifest carries only `id` + `description` (verified in
`modules/layout/module.lowdefy.yaml:148–170`, `modules/events/module.lowdefy.yaml:13–19`).
So the layout phase mapping a region onto `layout/page` still has to open
`components/page.yaml` to learn how to invoke it.

**Fix:** Spell out that discovery has two steps — enumerate ids from
`exports.components`, then read the mapped component's YAML to extract its `_ref`
vars/slots contract before wiring it. Otherwise the layout phase will reference shared
components it can't correctly parameterize.

### 5. Decision 3's export examples don't match the manifests

> **Resolved (auto).** Corrected Decision 3's illustrative lists: `events` → `change_stamp, event_types, events-timeline`; `user-account` → `profile-avatar, user-selector, user-multi-selector, user-avatar`. Verified against `modules/events/module.lowdefy.yaml` and `modules/user-account/module.lowdefy.yaml`.

Minor, but Decision 3's illustrative lists are the whole evidence for "the manifest is
the inventory," so they should be exact: `events` also exports `event_types`
(`modules/events/module.lowdefy.yaml:16`), and `user-account` also exports
`user-selector` and `user-multi-selector` (`modules/user-account/module.lowdefy.yaml:99–102`),
neither reflected in design.md:171–177. (`layout` and `modules/shared/layout/` lists
check out exactly.)

## Scope & sequencing

### 6. "Deliberately basic placeholder" framing conflicts with the actual scope

> **Resolved.** Kept all three skills in v1 — the sequencing risk is accepted, since the orchestrator's fan-out structure is orthogonal to pipeline transform quality and building all three lets the whole workflow be dogfooded end-to-end immediately. Fixed only the wording tension: the intro now scopes "placeholder" explicitly to the pipeline transforms' fidelity, and states that the three skills and the multi-screen fan-out ship complete in v1.

The design repeatedly frames itself as "a deliberately basic, working placeholder"
(design.md:11–12, 152–153, 222–223), yet proposes three skills, a three-phase
pipeline, MCP integration, Visual Companion replacement, _and_ a fan-out orchestrator
that is explicitly "full multi-screen from the start — the fan-out logic is complete"
(design.md:152–153). A complete multi-screen orchestrator is not placeholder-level,
and building C (`design-tasks-ui`) on top of B before B is proven risks baking in the
unvalidated assumptions from findings #1–#4.

**Fix:** Sequence it. Land B (`mock-to-lowdefy`) plus `lowdefy-mock`, run one real
screen through frame → layout → content wired into `apps/demo`, and validate the MCP
(#2), the guides fallback (#3), and the discovery contract (#4) empirically first.
Build `design-tasks-ui` once the per-screen chain is proven — its fan-out is only as
good as the chain it fans out to.

### 7. If `design-tasks-ui` reuses `r:design-task`, it inherits a broken context path

> **Resolved.** Confirmed the mismatch (`r:design-task/SKILL.md:54` reads `docs/Overview.md`; this repo's docs root is `docs/index.md`), but the "broken/dead path" framing overstates it — the existing skill tolerates the missing file. And hardcoding `docs/index.md` is wrong for portability: `docs/Overview.md` is an older convention still used in client projects, and these skills target all Lowdefy projects. Resolved by annotating open question 2 to discover the docs entry point flexibly (read the docs root starting from whatever overview-type file exists — `README.md` / `index.md` / `Overview.md` — and follow its links) rather than hardcoding any filename.

Open question 2 (design.md:233–234) defers how `design-tasks-ui` shares logic with
`r:design-task`. Note a concrete trap for whichever direction is chosen:
`r:design-task`'s Phase 1b instructs "Read `docs/Overview.md`" (design-task/SKILL.md,
Phase 1b), but this repo has no `docs/Overview.md` — its docs root is `docs/index.md`
(confirmed). If `design-tasks-ui` copies or delegates to that context-reading step, it
inherits a dead path. Resolve open question 2 with this in mind and correct the docs
path in the new skill.

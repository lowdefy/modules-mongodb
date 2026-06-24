# Task 2: Docs Skeleton, Front-matter Schema, and Root Index (Phase 1a)

## Context

The repo's docs today are: a 121-line root `README.md`, a 437-line `docs/idioms.md`, 11 per-module READMEs, and plugin/block READMEs. The new model is a central `docs/` tree that reads like a documentation site — one folder per module, intent-separated, Obsidian-friendly, and walkable by a future Lowdefy markdown app and by LLM agents.

This task lays the foundation: the directory skeleton, the front-matter contract every later doc must follow, and the relocation of the good root-README content into `docs/index.md` (leaving `README.md` as a short landing stub). Generators and content tasks build on this.

## Task

**1. Create the `docs/` skeleton.** Establish the top-level shape (empty dirs are fine where content lands later, but do not manufacture empty per-module `concepts/` folders — those are added proportionally by later tasks):

```
docs/
  index.md
  shared/            (created here; filled in Task 6)
  workflows/         (filled in Tasks 7–9)
  plugins/           (filled in Task 11)
  ...                (other module folders created by Task 10)
```

`docs/llms.txt` is generated later (Task 4) — do not hand-author it.

**2. Establish the front-matter schema.** Every doc opens with YAML front-matter:

```yaml
---
title: Signals vs Status
module: workflows        # module name, or `plugins` / `shared` / `root`
type: concept            # index | concept | how-to | reference | shared
concepts: [signals, fsm, status]   # optional string[]
---
```

| Field      | Required | Values                                               |
| ---------- | -------- | ---------------------------------------------------- |
| `title`    | yes      | string                                               |
| `module`   | yes      | module name, or `plugins` / `shared` / `root`        |
| `type`     | yes      | `index` \| `concept` \| `how-to` \| `reference` \| `shared` |
| `concepts` | no       | string[]                                             |

Document this schema in a short `docs/CONTRIBUTING.md` (or a clearly-marked section near the top of `docs/index.md`) so authors and the linter share one definition. The full CLAUDE.md write-up of the doc layout happens in Task 12 — here, just record the front-matter contract where the generators and authors can find it.

**3. Move root README content into `docs/index.md`.** The current `README.md` (module list, Mermaid dependency graph, "what to use when", consumer basics) becomes the body of `docs/index.md` with `type: index`, `module: root` front-matter. Adjust any relative links so they resolve from `docs/`.

**4. Reduce `README.md` to a landing stub.** Keep a short repo intro and point into the docs tree (e.g. "📚 Full documentation: [`docs/`](docs/index.md)"), plus whatever minimal install/consumer-basics one-liner is appropriate for someone who lands on the repo root. The detailed content now lives in `docs/index.md`.

## Acceptance Criteria

- `docs/index.md` exists with valid front-matter (`type: index`, `module: root`) and contains the migrated root-README content (module list, dep graph, when-to-use), with links that resolve from `docs/`.
- `README.md` is a short stub linking into `docs/`.
- The front-matter schema is documented in one place (`docs/CONTRIBUTING.md` or a section of `docs/index.md`).
- `docs/shared/`, `docs/workflows/`, and `docs/plugins/` directories exist (may be empty pending later tasks).
- No `docs/llms.txt` is hand-written.
- Markdown links in `README.md` and `docs/index.md` resolve (no broken relative paths).

## Files

- `docs/index.md` — create — migrated root-README content + index front-matter.
- `docs/CONTRIBUTING.md` — create (or add a section to `docs/index.md`) — front-matter schema reference.
- `README.md` — modify — reduce to landing stub.
- `docs/shared/`, `docs/workflows/`, `docs/plugins/` — create — empty placeholders for later tasks.

## Notes

- `modules/shared/` is **not** a module — it gets no `docs/` folder of its own; its behavior is documented via `docs/shared/` idioms and the modules that consume it.
- Keep the Mermaid dependency graph intact when moving it — it renders on GitHub and in Obsidian.
- Don't pre-create per-module subfolders speculatively; later tasks add only the subfolders each module needs (design's "build for concrete needs" principle).

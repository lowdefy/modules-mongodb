# Task 4: `gen-llms-txt.mjs` — Generate `llms.txt` + Front-matter Linter (Phase 1c)

## Context

`docs/llms.txt` is a generated, flat machine index of the whole doc set: one line per doc (path + one-line description), grouped by module. An agent reads one file and knows the entire doc surface. The format follows the emerging `llms.txt` convention — a markdown list of links with descriptions.

The same script doubles as the **front-matter linter**: walking `docs/**/*.md` to build the index requires reading every doc's front-matter, so it can cheaply validate that each doc has the required fields (`title`, `module`, `type`). Like `gen-var-docs`, it needs a `--check` mode so CI can enforce both regeneration and front-matter validity (Task 5 wires it).

Match the existing `.mjs` script style (Apache 2.0 header, ESM) from `scripts/release-notes.mjs`.

## Task

Create `scripts/gen-llms-txt.mjs`:

**Walk:** `docs/**/*.md`. This is complete coverage — every canonical doc (modules, shared idioms, plugin package + blocks) lives under `docs/`. **Do not index** the source-side stubs (`modules/{name}/README.md`, `plugins/.../README.md`, `src/blocks/{Block}/README.md`) — they only point at a `docs/` page the walk already covers.

**For each doc:** read front-matter (`title`, `module`, `type`, `concepts`) and the first paragraph of the body as a summary.

**Emit `docs/llms.txt`:** grouped by `module` (root/shared/plugins and each module), each entry a line like:

```
- docs/workflows/concepts/signals-vs-status.md: Signals vs Status — <first-paragraph summary>
```

Include a short header describing what the file is. Keep it flat (open question 3: start flat, revisit past ~80 docs).

**Front-matter linting:** while walking, validate every doc has the required front-matter fields with allowed `type` values (`index | concept | how-to | reference | shared`). Collect violations.

**Modes:**
- Default (write): regenerate `docs/llms.txt`; if any front-matter violations exist, print them and exit non-zero (a doc missing front-matter is a hard error, not a silent skip).
- `--check`: regenerate `llms.txt` to temp, diff against committed `docs/llms.txt`, AND run the front-matter lint; exit non-zero on any diff or any lint violation, naming the offending file(s). Do not modify committed files in `--check`.

## Acceptance Criteria

- `node scripts/gen-llms-txt.mjs` writes `docs/llms.txt` grouped by module, one line per doc with path, title, and summary; source-side README stubs are excluded.
- Front-matter validation flags any doc missing `title`/`module`/`type` or using an invalid `type`, with a clear message naming the file.
- `node scripts/gen-llms-txt.mjs --check` exits 0 on a clean tree and non-zero (naming the file) when `llms.txt` is stale or a doc has bad front-matter.
- Script carries the Apache 2.0 header and matches existing `.mjs` style.
- Running against the Task-2 skeleton (only `docs/index.md` present) produces a valid `llms.txt` with that one entry and passes its own lint.

## Files

- `scripts/gen-llms-txt.mjs` — create — index generator + front-matter linter with write + `--check` modes.
- `docs/llms.txt` — create (generated output) — committed.

## Notes

- This task can run against the Task-2 skeleton; it will be re-run by Task 12 once the full tree exists to capture every doc. Don't block on other content tasks.
- Reuse the same YAML/front-matter parsing approach chosen in Task 3 (same workspace dependency) for consistency.
- The `--check` mode here and in Task 3 are the two halves of `pnpm docs:check` (Task 5).

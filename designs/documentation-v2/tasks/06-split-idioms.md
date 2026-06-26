# Task 6: Split `idioms.md` by Audience (Phase 2)

## Context

`docs/idioms.md` (437 lines) mixes two audiences:

- **Consumer cross-cutting idioms** — `change_stamp`, `event_display`, `fields`/`components`/`request_stages` slots, `app_name`, `avatar_colors`, `secrets`. These describe how a _consumer_ uses shared behavior across modules.
- **Repo authoring/code conventions** — naming, file structure, "payload not state", operator preferences. These are for people _working in this repo_, and most already live in `CLAUDE.md`.

This task splits the file: consumer idioms become per-idiom files under `docs/shared/` (one concept per file — serves the renderer, LLM agents, and Obsidian's graph); repo conventions fold back into `CLAUDE.md` so each fact lives in exactly one place. Then `idioms.md` is deleted.

Today these files reference `docs/idioms.md#anchor`: root `README.md`, `CLAUDE.md`, `modules/workflows/module.lowdefy.yaml` (a `description` says `See docs/idioms.md#titles`), and 9 module READMEs (`layout`, `contacts`, `user-admin`, `files`, `user-account`, `notifications`, `events`, `companies`, plus workflows).

## Task

**1. Create `docs/shared/*.md`** — one file per consumer idiom, each with front-matter (`type: shared`, `module: shared`, a `title`, and relevant `concepts`):

```
docs/shared/change-stamps.md      (← #change-stamps)
docs/shared/event-display.md      (← #event-display)
docs/shared/slots.md              (← #slots: fields/components/request_stages)
docs/shared/app-name.md           (← #app-name)
docs/shared/avatar-colors.md      (← #avatar-colors)
docs/shared/secrets.md            (← #secrets)
```

Migrate the consumer-facing content from each `idioms.md` section, rewritten as standalone prose (each file must read on its own, not as a fragment of a larger page).

**2. Fold repo-authoring/convention content into `CLAUDE.md`.** Any content in `idioms.md` that is a repo authoring/code convention (naming, file structure, operator preferences, "payload not state") belongs in `CLAUDE.md`. Most is already there — for each such section, confirm it exists in `CLAUDE.md` and only add what's missing. Do not duplicate; the goal is one home per fact.

**3. Update cross-links — only in files that survive as prose.** Per the design, rewrite `idioms.md#anchor` links **only** in the root `README.md` and `CLAUDE.md` (and the one workflows manifest `description` that says `See docs/idioms.md#titles` — repoint it to wherever the titles content now lives, or drop the link if titles content moved into a module doc rather than `docs/shared/`). The **9 module READMEs are intentionally NOT rewritten here** — they become stubs in Task 10, so their idiom links vanish with the body; rewriting them now is wasted work.

**4. Delete `docs/idioms.md`.**

## Acceptance Criteria

- Six `docs/shared/*.md` files exist, each with valid front-matter and self-contained prose migrated from the corresponding `idioms.md` section.
- All repo-authoring conventions from `idioms.md` are present in `CLAUDE.md` (added only where missing — no duplication).
- `README.md` and `CLAUDE.md` no longer link to `docs/idioms.md#...`; their idiom references point at `docs/shared/*.md`.
- The workflows manifest `See docs/idioms.md#titles` reference is repointed or removed (no dangling `idioms.md` link remains in any manifest).
- `docs/idioms.md` is deleted.
- `grep -rn "idioms.md" README.md CLAUDE.md modules/*/module.lowdefy.yaml` returns nothing.
- `node scripts/gen-llms-txt.mjs` picks up the new `docs/shared/*.md` files with valid front-matter.

## Files

- `docs/shared/change-stamps.md`, `event-display.md`, `slots.md`, `app-name.md`, `avatar-colors.md`, `secrets.md` — create.
- `CLAUDE.md` — modify — absorb any missing repo conventions; repoint idiom links.
- `README.md` — modify — repoint idiom links to `docs/shared/`.
- `modules/workflows/module.lowdefy.yaml` — modify — fix the `See docs/idioms.md#titles` reference.
- `docs/idioms.md` — delete.

## Notes

- The 9 module READMEs that still link `idioms.md#anchor` are left alone deliberately — Task 10 turns them into stubs and the new `docs/{module}/` pages link to `docs/shared/` natively.
- `modules/activities/VARS.md` also references `idioms.md`, but it is deleted in Task 10, so leave it for that task.
- One concept per file is the rule — don't combine two idioms into one `docs/shared/` page even if short.

# Task 3: Default action-page titles to the resolved action title

## Context

`modules/workflows/resolvers/makeActionPages.js` is the build-time resolver that emits one Lowdefy page per action verb (`edit`/`view`/`review`/`error`) from the raw workflow YAML. Each emitted page passes a `page_config` var through to the verb template (`templates/{verb}.yaml.njk`); templates read per-page customization (title, requests, events, etc.) off `page_config.*`.

Today `page_config` is `action.pages?.[verb] ?? {}` (line 69) — so when an author doesn't set a per-verb `title`, the page has no title (Part 51's F1 title gap). This task closes that gap by defaulting `page_config.title` to the resolved action title through the same humanizer used elsewhere.

Important: `makeActionPages` runs against the **raw `workflows`** var (`vars.workflows`), **not** the materialized `workflowsConfig` from task 2. So it cannot read a pre-resolved `action.title` — it must resolve the action title itself, identically to task 2: `action.title ?? humanizeSlug(action.type, title_acronyms)`. It therefore needs the same `humanizeSlug` helper and the same `title_acronyms` var (wired in task 4).

Current signature: `makeActionPages(_, vars)` destructures `{ workflows, app_name: appName }`. `emitForAction(workflow, action, appName)` builds `page_config` per verb.

## Task

1. **Import the helper:** `import { humanizeSlug } from './humanizeSlug.js';`.

2. **Read acronyms:** in `makeActionPages(_, vars)`, destructure `title_acronyms = []` and thread it down to `emitForAction` (add a parameter, or compute the resolved action title in `makeActionPages` and pass it in — either is fine; keep it simple).

3. **Resolve the action title** once per action: `const actionTitle = action.title ?? humanizeSlug(action.type, title_acronyms);`.

4. **Default `page_config.title`.** Change the `page_config` var from `action.pages?.[verb] ?? {}` to default the title while keeping all author-supplied per-verb keys: the per-verb config object, with `title` defaulting to `actionTitle` when the author did not set `pages[verb].title`. Concretely:

   ```js
   const pageConfig = action.pages?.[verb] ?? {};
   // explicit per-verb title wins; else fall back to the resolved action title
   page_config: { ...pageConfig, title: pageConfig.title ?? actionTitle }
   ```

   An explicit `pages[verb].title` must still win.

## Acceptance Criteria

- Every emitted action page has a `page_config.title` — the author's per-verb title if set, otherwise the resolved action title (`action.title` or `humanizeSlug(action.type)`).
- `title_acronyms` is threaded through and merged into the humanizer (default `[]`).
- Author-supplied `pages[verb]` keys other than `title` still pass through unchanged.
- `makeActionPages.test.js` is extended to cover: default title from `action.type`, default title from explicit `action.title`, per-verb `pages[verb].title` override winning, and acronym merge. Tests pass.

## Files

- `modules/workflows/resolvers/makeActionPages.js` — modify — import `humanizeSlug`; read+thread `title_acronyms`; resolve action title; default `page_config.title`.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — add coverage for the above.

## Notes

- This resolver reads raw YAML, so it must replicate task 2's `action.title ?? humanizeSlug(action.type, title_acronyms)` rule rather than reading a pre-resolved field. Keep the two derivations identical so a page title and the action's config title never disagree.
- Don't default any other `page_config` field — only `title` (the design's F1 title gap). Other page chrome stays author-only.

# Task 1: Add the `humanizeSlug` helper and base acronym set

## Context

The workflows module needs human-readable **titles** for workflows, actions, action groups, action pages, and event verbs. Author-defined slugs (`workflow.type`, `action.type`, group `id`) currently have no default and no humanizer anywhere in the repo, so unset titles surface as raw slugs (`send-quote`). This task adds the single pure helper that turns a slug into a good Title Case string — the thing that makes every derived default in later tasks *good* rather than merely mechanical.

The helper lives in the module's build-side resolver utilities (`modules/workflows/resolvers/`), alongside `makeWorkflowsConfig.js`, `makeActionPages.js`, etc. It is a pure function with unit tests, mirroring the existing resolver test style (`*.test.js` next to the source, run under the repo's vitest setup — see `makeWorkflowsConfig.test.js` for the pattern).

The plugin never humanizes at runtime — only build-side resolvers call this helper — so it does not belong in the plugin package.

## Task

Create `modules/workflows/resolvers/humanizeSlug.js` exporting:

1. A **base acronym set** — a constant (e.g. `BASE_ACRONYMS`) containing a small, uncontroversial set of web/business acronyms. Ship exactly this set (resolving the design's open question — keep it small since apps extend it via `title_acronyms`):

   `PO ID URL API CRM SLA KPI VAT PDF CSV FAQ KYC RFQ`

   Store them in a form convenient for case-insensitive lookup (e.g. a `Set` of lowercased tokens, or uppercased — pick one and be consistent).

2. A **pure `humanizeSlug(slug, acronyms?)` function** (default export or named — match how it will be imported in tasks 2 and 3; a named export is fine). It accepts the slug string and an optional acronym set/array merged with the base set. Rules, applied in order:

   1. **Split** on `-`, `_`, and camelCase boundaries into word tokens. (`send-quote` → `[send, quote]`; `company_setup` → `[company, setup]`; `kickoffCall` → `[kickoff, call]`.)
   2. **Title-case** each token: first letter upper, rest lower.
   3. **Minor words** — the set `a an and as at but by for from in nor of on or the to via with` — are lowercased **unless** they are the first or last token. So `convert-to-customer` → "Convert to Customer", but a two-token `to-do` → "To Do".
   4. **Acronyms** — a token whose lowercased form is in the (base ∪ supplied) acronym set is fully uppercased, **always**, regardless of position. (`upload-po` → "Upload PO".)
   5. **First token always starts with a capital** (acronym rule and first-token rule both force a capital; minor-word lowercasing never applies to the first or last token).

Expected behavior (use these as test cases):

```
humanizeSlug('send-quote')             → 'Send Quote'
humanizeSlug('assign-account-manager') → 'Assign Account Manager'
humanizeSlug('upload-po')              → 'Upload PO'
humanizeSlug('convert-to-customer')    → 'Convert to Customer'
humanizeSlug('company_setup')          → 'Company Setup'
humanizeSlug('kickoffCall')            → 'Kickoff Call'
humanizeSlug('to-do')                  → 'To Do'        // minor word as first/last token stays capitalized
humanizeSlug('bom', ['BOM'])           → 'BOM'          // app-extended acronym
```

Create `modules/workflows/resolvers/humanizeSlug.test.js` covering: hyphen/underscore/camelCase splitting, minor-word lowercasing in the middle vs. first/last position, base-set acronyms, app-supplied acronym merge, single-token slugs, and acronym-takes-precedence-over-minor-word edge cases.

## Acceptance Criteria

- `modules/workflows/resolvers/humanizeSlug.js` exists, exports the helper and the base acronym set, and has no I/O or runtime dependencies (pure function).
- All the expected-behavior examples above pass.
- The acronym set merge is case-insensitive and app-supplied acronyms (array or set) combine with the base set.
- `humanizeSlug.test.js` covers the cases listed above and passes (`pnpm --filter @lowdefy/workflows test` or the repo's resolver test command).

## Files

- `modules/workflows/resolvers/humanizeSlug.js` — create — pure helper + `BASE_ACRONYMS`.
- `modules/workflows/resolvers/humanizeSlug.test.js` — create — unit tests.

## Notes

- The acronym set is the design's one open question. Ship the list above; don't expand it — domain acronyms come from apps via `title_acronyms` (wired in task 4).
- Keep minor-word handling driven by the exact word list in the design; don't invent additional minor words.

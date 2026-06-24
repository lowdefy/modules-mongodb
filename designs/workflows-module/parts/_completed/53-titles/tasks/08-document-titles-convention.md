# Task 8: Document the titles convention

## Context

The titles strategy introduces a convention authors need to understand: titles derive from slugs by default and are overridden only when the default is wrong; the acronym dictionary is app-extensible via `title_acronyms`; and event messages use a curated per-signal verb map. This must be documented so authors know the rule without reading the resolver code.

The repo's documentation layout (per `CLAUDE.md`):
- `modules/workflows/README.md` — per-module reference (Description, Dependencies, How to Use, Exports, Vars, Secrets, Notes…). Already documents the `workflows_config` shape and the `action_statuses_display` var.
- `docs/idioms.md` — single page of cross-cutting idioms with stable anchors (`#change-stamps`, `#event-display`, `#slots`, `#app-name`, `#avatar-colors`, `#secrets`). Per-module READMEs link to anchors here.
- The manifest (`module.lowdefy.yaml`) is the source of truth for var schema (handled in task 4); the README restates it for readers.

This task lands after the humanizer (task 1), the materialization (task 2), and the final signal verb map (task 6) are settled, so the documented rules match the shipped behavior.

## Task

1. **Add a titles idiom to `docs/idioms.md`** with a stable anchor (e.g. `#titles`). Cover:
   - **The derive-or-override rule.** Every title-bearing concept (workflow `type`, action `type`, group `id`) gets a default derived from its slug via the humanizer; an explicit `title:` always wins. Authors set `title:` only when the default is wrong.
   - **The `humanizeSlug` behavior.** Splitting (`-`/`_`/camelCase), Title Case, minor-word lowercasing (with the exact minor-word list), acronym uppercasing, first/last-token rules. Include the worked examples from the design (`send-quote` → "Send Quote", `upload-po` → "Upload PO", `convert-to-customer` → "Convert to Customer").
   - **The acronym dictionary.** The shipped base set (`PO ID URL API CRM SLA KPI VAT PDF CSV FAQ KYC RFQ`) and the `title_acronyms` module var for domain acronyms (BOM, SKU…).
   - **The curated/derived split.** Fixed engine-known slugs (action statuses, lifecycle stages, FSM signals) are curated once in the module and never derived; only open author-defined slugs are humanized.
   - **The signal verb map.** Event messages combine a curated signal verb × the derived-or-overridden noun title — list the per-signal defaults (submit→completed / submitted for review, approve→approved, request_changes→requested changes on, progress→started, not_required→marked … as not required, resolve_error→resolved an error on; the tracker-mirror and lifecycle templates), and note they're defaults overridable via the 3-source `event_overrides` chain.

2. **Update `modules/workflows/README.md`:**
   - In the **Vars** section, restate the `title_acronyms` var (narrative form, consistent with the manifest description from task 4).
   - Note the optional action `title` field and the derive-or-override rule in the workflow/action config description, linking to the new `docs/idioms.md#titles` anchor instead of repeating the full explanation.
   - Mention action-page titles default to the action title (closes Part 51 F1's title gap).

## Acceptance Criteria

- `docs/idioms.md` has a new titles section with a stable anchor covering the derive-or-override rule, `humanizeSlug` behavior + examples, the base acronym set, `title_acronyms`, the curated/derived split, and the signal verb map.
- `modules/workflows/README.md` restates the `title_acronyms` var, notes the action `title` field and action-page title default, and links to the idioms anchor (no duplicated full explanation).
- Documented base acronym set and signal verbs match what shipped in tasks 1 and 6.
- Markdown links resolve (relative paths correct).

## Files

- `docs/idioms.md` — modify — add the titles idiom section with a stable anchor.
- `modules/workflows/README.md` — modify — Vars entry for `title_acronyms`, action `title` note, action-page title note, link to idioms anchor.

## Notes

- The manifest is the source of truth for the var schema; if the README and manifest disagree, fix the README to match the manifest (task 4).
- Keep the README pointing at the idioms anchor rather than duplicating the humanizer rules — matches the repo's docs layout (per-module READMEs link to idioms anchors).

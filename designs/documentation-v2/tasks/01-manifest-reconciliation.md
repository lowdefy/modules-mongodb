# Task 1: Manifest Reconciliation (Phase 0)

## Context

The new docs tree generates `reference/vars.md` for each module **from `module.lowdefy.yaml`** (the manifest is the source of truth for var schema). A clean, fully-described manifest is the prerequisite for those generated tables. The bulk audit — filling every missing nested `description:` across all 11 manifests — is already complete. Two specific items remain:

1. **Workflows `contacts_collection` TODO** — `modules/workflows/module.lowdefy.yaml` (around line 114) carries a `TODO:` in the `description` of the `contacts_collection` var. It notes the var duplicates the collection name owned by the contacts module's `contacts-collection` connection, and muses that the workflow-api connection "ideally" would derive it from the contacts module. This TODO must not appear in generated consumer docs.

2. **Layout `logo.*` key inconsistency** — `modules/layout/module.lowdefy.yaml` defines the logo config with keys `primary`, `primary_dark`, and `style`. The prior design's `tasks.md:21` referenced `primary_light` / `icon`, which do not match. A real cross-check against the actual layout block/page config is owed to confirm the correct key set and that each key is described.

## Task

**1. Resolve the `contacts_collection` TODO.** Decide whether to (a) keep the var as an independent, documented var and rewrite the description to drop the `TODO:` framing (state the current behavior plainly: it defaults to `user-contacts` and a host app pointing contacts at a custom collection sets this to match), or (b) implement the derivation from the contacts module if that is genuinely cheap and correct. Per the design, "for now it stays an independent var" — so option (a) is the expected resolution unless you find the derivation is trivial and clearly better. Either way, the resulting `description:` must be clean consumer-facing prose with no `TODO:`.

**2. Reconcile the layout `logo.*` keys.** Open the layout block/page config that consumes `_module.var: logo.*` and enumerate the keys it actually reads. Confirm the manifest's `logo` property lists exactly those keys (`primary`, `primary_dark`, `style`, and any others actually consumed), each with `type:`, `description:`, and `default:` where applicable. Remove or correct any phantom keys; add any real-but-undocumented keys. If `primary_light` / `icon` are genuinely consumed somewhere, document them; if not, confirm they were a stale reference and do nothing further (they are not in the manifest today).

**3. Verify no other manifest carries a `TODO:`/`FIXME:` in a var description**, since generated var tables surface descriptions verbatim. Grep all 11 manifests and clean any stragglers.

## Acceptance Criteria

- `modules/workflows/module.lowdefy.yaml` `contacts_collection` description contains no `TODO:` and reads as clean consumer prose.
- `modules/layout/module.lowdefy.yaml` `logo` keys match the keys actually consumed by the layout config; each key has `type:` + `description:` (+ `default:` where applicable).
- `grep -rn "TODO\|FIXME" modules/*/module.lowdefy.yaml` returns nothing in var descriptions.
- `pnpm ldf:b` (from `apps/demo`) still compiles — manifest edits did not break the build.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify — clean the `contacts_collection` description (and only implement derivation if trivially correct).
- `modules/layout/module.lowdefy.yaml` — modify — reconcile `logo.*` keys against the actual block.
- Other `modules/*/module.lowdefy.yaml` — modify only if a stray `TODO:`/`FIXME:` is found in a var description.

## Notes

- The design explicitly says the `contacts_collection` var "stays an independent var" for now — don't over-engineer a contacts-module derivation unless it's clearly cheap and correct. The minimum bar is a clean description.
- To find the layout logo consumers, search `modules/layout/` for `logo` references in the page/block YAML (e.g. `_module.var: logo`).

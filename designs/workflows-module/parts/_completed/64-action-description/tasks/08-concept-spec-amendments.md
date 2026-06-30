# Task 8: Concept-spec amendments — authored `description` + the two-`description` disambiguation

## Context

The concept specs are the source of truth for the action authoring/engine contract. They currently describe `description` as an editable universal field and never document the authored config field. Part 64 inverts this: the editable universal field is deleted; the authored `description` is the real field. The specs must reflect that, and must disambiguate the action body `description` (authored, renders) from the event `display.{app}.description` (not authorable, hard-errors) so they don't read as contradictory.

This is a documentation-only task and can land any time, but it depends on the design intent (already settled). Both files are under version control with existing edits on this branch.

## Task

**`designs/workflows-module-concept/action-authoring/spec.md`:**

1. **"Universal action fields" section (~line 181).** Drop the `description` row from the universal-fields table (leaving `assignees`, `due_date`). Update the intro sentence ("Every action doc carries three optional content fields…") to two fields. In the **write path** prose (kind-split bullets), remove `description` from the field lists (e.g. "the three universal fields" → "the two"), and remove the `kind: tracker` "seeded from the parent" note insofar as it lists `description`. Update `universal_fields` presence-declaration prose: the legal set is `[assignees, due_date]`, not three.
2. **New authored-field section.** Add a section defining the authored `description` per the Part 64 contract:
   - A single **markdown** string in the action YAML, authored once per action type, identical for every instance, **read-only at runtime** (not editable per instance — contrast comments / the deleted universal field).
   - Lives in the workflow config (reachable as `actionConfig.description`), **not** on the action doc.
   - Supports `{{ var }}` nunjucks templating against the action instance, **rendered at read time** by GetWorkflowAction (anti-staleness — no create-time materialisation). Render context shape `{ ...action, ...metadata }`.
   - Rendered as plain body content (no callout chrome) on **form + check** surfaces — the body shown to whoever performs the action. Omitted/null → nothing renders.
   - One consistent meaning across action origins: for **workflow** actions the workflow author writes it (static config); for future **task** actions the task creator writes it (per-doc). Same field, same surface, same render — only author and storage differ.
3. **Examples.** The form / check / tracker examples already show root-level `description:` lines (e.g. ~395/433/461). Keep them but ensure they read as the **authored-config** field (markdown body / performer guidance), consistent with the new section, and note they render on form + check.
4. **Reconcile the event `display.{app}.description` rule.** Wherever the spec documents event-display authoring (the `rejectAuthoredDescription` rule — "event descriptions are owned by the action comment and cannot be authored"), add the action `description` to the disambiguation so the two keys read as deliberately distinct: the action body `description` **is** authored config and renders; the event `display.{app}.description` is **not** authorable and hard-errors. Word the rejection as a rule about the _event display_ key specifically — never a blanket "descriptions are never authored."

**`designs/workflows-module-concept/engine/spec.md`:**

5. **Action-doc fields table (~line 134).** Remove the `description` row (`{ text, html } | null` "universal field"). Add a note that `description` is no longer an action-doc field — it is authored config read via `actionConfig` and rendered at read time by GetWorkflowAction.
6. **Universal-fields / UpdateActionFields prose (~lines 199–200).** Drop `description` from the universal-fields field lists (`assignees`, `due_date` only); the `UpdateActionFields` operation writes two fields, not three.
7. **Reserved-keys list (~line 245).** Decide per the engine contract whether `description` should remain in the action-doc reserved-keys list. Since the action doc no longer carries `description`, remove it from that reserved list unless the surrounding text gives a reason to keep it reserved; if kept, add a one-line note explaining why. (Default: remove it for consistency with "no longer an action-doc field.")

## Acceptance Criteria

- `action-authoring/spec.md`: universal-fields table/prose list only `assignees` + `due_date`; a new section defines the authored markdown `description` (read-only, config-stored, read-time nunjucks, form+check render, consistent cross-origin meaning); examples reflect the authored contract; the event `display.{app}.description` rejection is reworded as event-display-specific and explicitly contrasted with the authored action `description`.
- `engine/spec.md`: the action-doc `description` row is removed with a note that it is authored config; universal-fields/UpdateActionFields prose lists two fields; the reserved-keys list is reconciled.
- No spec text states or implies that the action `description` is editable per instance or written through `update-fields`.
- `pnpm docs:check` (if it lints these design specs) and any markdown link checks still pass.

## Files

- `designs/workflows-module-concept/action-authoring/spec.md` — modify — drop `description` from universal fields; add authored-field section; reconcile event-display rule; align examples.
- `designs/workflows-module-concept/engine/spec.md` — modify — remove action-doc `description` row; two-field universal prose; reconcile reserved keys.

## Notes

- Per CLAUDE.md, designs are the source of truth for rationale; keep the "why read-time render" and "why markdown over HTML" rationale where it clarifies the contract.
- `rejectAuthoredDescription` in `makeWorkflowsConfig.js` is unchanged by this part — the spec amendment only clarifies that its scope is the _event display_ key, not the action body.

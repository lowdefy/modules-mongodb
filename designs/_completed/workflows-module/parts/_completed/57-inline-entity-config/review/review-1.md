# Review 1

## Factual accuracy

### 1. The design's premise that `makeWorkflowsConfig` "already validates `entity_collection`" is false

> **Resolved.** Confirmed `validateWorkflow` checks only `entity_ref_key` (plus legacy `entity_type` rejection and a `title` type-check), not `entity_collection`. Corrected the framing to reference only the existing `entity_ref_key` check, and added the reviewer's recommended fix: a required-string check for the collection, closing the undefined-collection silent-failure mode. **Superseded in shape by the later consolidation reshape** (see the design's "one `entity:` block" decision): the collection field is now authored as `entity.collection` and required-checked as part of the unified `entity:`-block validation, then lifted to the flat `entity_collection` in the materialized config — so the check exists and the "validate every entity field in one place" framing is now literally true.

The "Why" and "Validation" sections lean on the claim that the validator already
checks both `entity_collection` and `entity_ref_key`, so the new `entity.*` checks
slot in "alongside the existing `entity_collection` / `entity_ref_key` checks"
(design lines 10, 17, 39, 133). The code does **not** validate `entity_collection`.

In `validateWorkflow` (`makeWorkflowsConfig.js:573`) the only required-field checks are:

- `entity_type` legacy-rejection (`:574`),
- `entity_ref_key` non-empty string (`:581`),
- `title` type check (`:591`).

`entity_collection` appears in the file only twice: as a `WORKFLOW_FIELDS` pick
(`:34`) and inside the `entity_type` error _message_ (`:577`). It is carried through
the normalized config but never required-checked — a workflow omitting it builds
clean and silently produces documents with an undefined collection.

This doesn't undermine the design (if anything it reinforces the "fields are
under-validated today" argument), but the text is inaccurate and should be
corrected. Better: while adding the `entity.*` validation, also add the missing
`entity_collection` required-string check in the same block — it's a one-liner, it
removes a genuine silent-failure mode, and it makes the design's "validate the same
way" framing actually true. Update lines 10, 17, 39, and 133 accordingly.

## Design rationale

### 2. The "per-workflow variation is plausibly wanted" justification is speculative

> **Resolved.** Reframed line 19 from a hedged "Why" driver ("plausibly wanted", "may legitimately want") to a supported side-effect: per-workflow link variation is a real capability the new shape supports and that the user intends to keep, but it is explicitly _not_ the driver — single-file config and build-time validation carry the change on their own. Adjusted the Rejected-section framing (line 47) so the trade bought is single-file config + validation, with per-workflow variation noted as an additional benefit rather than the justification.

Design line 19 offers per-workflow link variation ("two workflows on the same
`entity_collection` may legitimately want to link to different entity pages") as a
co-justification, and the Rejected section (line 47) frames it as part of the
trade-off being bought. The wording itself hedges — "plausibly wanted", "may
legitimately want" — which is the tell. Per CLAUDE.md ("Build for concrete needs,
not speculation"), a `var`/field shape justified by a "what if someone wants…" with
no cited caller is exactly the speculative surface to avoid leaning on.

The design does not need this argument: the **single-file config** reason (primary,
concrete — the developer edits one file instead of two) and the **build-time
validation** reason (concrete — turns silent `null` back-links into build errors)
fully carry the change on their own. Per-workflow variation is a _free side-effect_
of co-locating the fields, not a driver. Recommend demoting it from a "Why" bullet
to a one-line "(and as a side effect, the link can now vary per workflow)" note, so
the rationale rests only on the concrete needs.

### 3. Dependency on Part 26 is understated — the conflict is build-time, not a field move

> **Resolved.** Verified the mechanism mismatch against part-26 design lines 55–71 (build-time Nunjucks substitution of `entities[entity_collection].get_entity_endpoint` in `makeActionPages`, reading the raw enum) — the finding holds. Rewrote the Dependents note to flag the build-time→runtime mechanism change explicitly (Part 26's whole substitution approach needs reworking, not just a field relocation). Also recorded the outcome of the review discussion: Part 26 is a parked, speculative part, not a committed dependency, and it overlaps with the far cheaper `entity.name_field` (Part 56) that already covers the only concrete need — so the note now frames revival as conditional rather than expected.

Design line 162 says Part 26's `get_entity_endpoint` "becomes an optional field
inside the per-workflow `entity:` block… part 26's design should be updated to
target that location." That undersells the friction. Part 26
(`_next/26-entity-data-contract`) doesn't just add a field to the map — its whole
mechanism is **build-time Nunjucks substitution** keyed by collection:
`requests/get_entity.yaml.njk` resolves `entities[entity_collection].get_entity_endpoint`
at build time (part-26 design lines 55–59), reading the raw `entities` enum.

After this design, that routing metadata lives inside `workflows_config`, which is
consumed at **runtime** through the `makeWorkflowsConfig` resolver and the connection
— not as a build-time enum a `.njk` template can index by `entity_collection`. So
Part 26 can't simply "point at `entity.get_entity_endpoint`"; it would need its
template-substitution approach reworked to source the endpoint from the runtime
config (or the field kept reachable at build time some other way). Part 26 is in
`_next` so this is not blocking, but the note should flag the **mechanism** mismatch,
not just the field location, so whoever picks up Part 26 isn't surprised. Recommend
expanding line 162 to that effect.

## Minor

### 4. `entity_link` becomes `null` for docs whose `workflow_type` is no longer in config — a small behavior change worth noting

> **Resolved.** Verified against the four read methods: queries don't filter by configured type (`GetEntityWorkflows` loads by `{ entity_collection, entity_id }`; the others fetch by `_id`), so de-configured documents still render, and `wfConfig?.x ?? fallback` already nulls their config-derived chrome (`title`, group titles/icons) today. The change is specifically `entity_link`: collection-keyed (survives type removal) → type-keyed via `wfConfig.entity` (null when the type is gone). Added a Non-goals note documenting this as an inherent consequence of routing-by-workflow (no fallback possible without re-introducing a collection-keyed map). Refined the review's "already largely de-configured" framing in the note: the per-action surface is document-driven (message/links/status/access) and still renders, so the lost back-link is the most visible change — minor and accepted given the case is narrow (a type removed/renamed while its documents survive).

Today `entity_link` is keyed off the document's stored `entity_collection` via the
connection map, so a workflow document still renders a back-link even if its
`workflow_type` has been removed from `workflows_config`. After this change the link
is sourced from `wfConfig?.entity` (resolved by `workflow_type`), so a document whose
type is no longer declared yields `entity_link: null`.

This is acceptable — `wfConfig` already drives `title` and the group/action display,
so such a document is already largely de-configured — but it's a real (minor)
difference from "Non-goals" framing and belongs as a one-line note under Non-goals or
Migration, rather than being silent.

### 5. Citation nits

> **Resolved (auto).** Verified against source: fixed design line 45 (`GetWorkflowOverview.js:183` → `:44`, the `.find` resolving `wfConfig`) and the Files-changed schema citation (`line 153` → `lines 153–169`, the full `entities` param block). The `GetWorkflowAction.js` `:21` + `:218` comments are already covered by the generic "update the header/inline doc comments that reference `connection.entities`" instruction in the Files-changed list.

- Line 45 cites `GetWorkflowOverview.js:183` as where the method "resolves the
  workflow's config entry… before building `entity_link`". The `wfConfig` resolution
  (`.find`) is actually at `:44`; `:183` is the later `title` read. The other three
  citations on that line (`GetEntityWorkflows.js:81`, `GetWorkflowAction.js:147`,
  `GetWorkflowActionGroupOverview.js:43`) are correct.
- The schema `entities` param is `153–169`, not just `:153` (design line 142 / Files
  changed) — removal is clean since `entities` is not in the top-level `required`
  array (`schema.js:3`) and `additionalProperties: false` will reject any leftover
  wiring, so dropping both the schema entry and the `workflow-api.yaml` property
  together is correct.
- `GetWorkflowAction.js` also carries a doc comment referencing the old source at
  `:21` ("from connection.entities") in addition to the `:218` comment the design
  already lists — both need updating.

## Verified correct

- The claim that the manifest's `entities` description (`module.lowdefy.yaml:85–87`)
  advertises a cross-check that does not exist is accurate — `makeWorkflowsConfig.js`
  has no reference to `entities`. Removing the var deletes the misleading doc.
- All four read methods resolve `wfConfig` before computing `entity_link`
  (`GetWorkflowOverview.js:44`, `GetEntityWorkflows.js:81`, `GetWorkflowAction.js:147`,
  `GetWorkflowActionGroupOverview.js:43`), so `wfConfig.entity` is exactly as direct as
  the current `entities[entity_collection]` lookup — the design's core runtime argument holds.
- The four test suites (`*/<Method>.test.js`) each carry the `entities` fixture and
  the "resolves from connection.entities" / "null when no entry" test pair the design
  proposes to rewrite — the test-change scope is complete and accurate.
- No page YAML or template in `modules/workflows` reads `vars.entities` directly; the
  only current consumers are the four methods via the connection, so the Files-changed
  list is complete for the current codebase (Part 26's template is `_next`).
- The `title` collision rationale (workflow-level `title` vs `entity.title`) is real:
  `validateWorkflow:591` and the action-title default both treat top-level `title` as
  the workflow's own display name; nesting `entity.title` correctly avoids the clash.

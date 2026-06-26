# Review 1 — Per-verb access model: ripples that need closing

The design is internally consistent on the **schema** change (one canonical shape, per-app per-verb) and on the **runtime semantics** (build-time presence check, query-time per-verb visibility, submit-time per-verb gate). The findings below sit on the edges where the change ripples into adjacent parts that the design touches but doesn't fully close out.

## High-priority

### 1. Hook auth synthesis (Part 13 ripple) needs a concrete formula, not a `⊇` rule

> **Resolved (different mechanism than the review proposed).** The union-formula synthesis is dropped entirely. Lowdefy's auth is centralised in app-level `api.roles` / `pages.roles` globs, not per-endpoint, so the "synthesize `hook.auth.roles`" framing Part 13 was authored against doesn't match the platform. Resolution: hook Apis become **internal-only** (callable from `context.callApi`, no HTTP entry point), so there is no hook-side gate to synthesize. The submit endpoint's central `api.roles` glob is the coarse gate; the submit handler's per-app+per-verb check (D5) is the precise gate. Cross-app role-name leak the review raised dissolves — there is no caller-facing hook gate to leak through.
>
> Captured in Part 34 as D11 (three-layer enforcement) plus a rewritten Part 13 Touches row. The "for each interaction the hook handles, `hook.auth.roles ⊇ union(...)`" line is gone.
>
> A separate naming-convention decision rides on the same submit-time auth mechanism: emitted page and Api ids are renamed to be glob-friendly (`workflow-{workflow_type}-{action_type}-...`) so app-level `api.roles` rules can scope per-workflow with `workflow-qualification-*`-style globs. Captured as D10; touches Parts 12 and 13.

The "Touches" table (line 322) reformulates Part 13's rule as:

> for each interaction the hook handles, `hook.auth.roles ⊇ union(access.{any-app}.{interaction-required-verb})`

But Part 13 (`13-resolver-apis/design.md:62`) doesn't _validate_ a `⊇` rule — it **synthesizes** the hook's `auth.roles` directly from `action.access.roles` so "the gate holds by construction, no separate validation pass." Restating the rule as `⊇` is a regression to a check-and-fail model that Part 13 deliberately replaced.

The design also doesn't address two cases that fall out of the new shape:

- **`true` gates.** If `access.{some-app}.{verb}: true` (any user of the app passes), the union has no role names. What does the synthesizer emit for `auth.roles`? An empty list (no gate) is the correct semantic — but emit it and any role-less authenticated user calling the hook directly passes auth. Acceptable, but the design should say so.
- **Cross-app role-name reuse.** The whole D3 rationale is that `roles: [manager]` was ambiguous because `manager` could mean different things in different apps. Synthesizing the hook's `auth.roles` as a flat union across apps re-introduces exactly the ambiguity (`manager` in app-a + `manager` in app-b → `[manager]` at the hook, which then matches a user from either app). Either the hook auth gate is per-app too (multiple Apis emitted per interaction, one per app), or this is an acknowledged escape valve. Part 34 needs to pick one.

**Fix.** Rewrite the Part 13 row in "Touches" as a synthesis formula:

```
hook.auth.roles = union over apps a:
  if access.a.{verb} is undefined  -> contribute nothing
  if access.a.{verb} is true       -> hook becomes role-less (auth.public still false)
  if access.a.{verb} is [r1, r2]   -> contribute [r1, r2]
```

…and flag the cross-app role-name-clash leak explicitly. (The current design Part 13 inherits the same leak from today's flat `roles`; Part 34's framing should at minimum acknowledge it survives.)

### 2. `notification_roles` location contradicts itself

> **Resolved: action root.** The Schema reserved-keys table is rewritten — `access:` now holds only `{app_name}` keys with no carve-outs. `notification_roles` lives at the action root throughout (D9, worked examples, canonical YAML). The reviewer's "keep inside `access:` to minimise churn" argument doesn't apply since no workflows have shipped. The runtime extractor change is one line in `getActionFields.js`. Q3 closed.

The Schema section's "Reserved keys at the `access:` block top level" table (lines 75-80) lists `notification_roles` as a reserved key **inside** `access:`. The Worked Examples (lines 285-288), D9 (lines 216-223), and Q3 (lines 368-372) all show it at action root. Q3 acknowledges the inconsistency.

This isn't a defer-able question — `makeWorkflowsConfig` validation, the `getActionFields.js:14` extractor, and 58 reference-project files all need to agree on one location.

**Fix.** Pick now. Recommendation: leave it inside `access:` for v1 to minimise churn (the Worked Example "Today → Under this part" pair on lines 269-288 currently moves it; that move is the only reason a 58-file codemod is needed for this field at all). If lifting to root is the right end state, do it in a follow-up v1.x part — keep this part scoped to the schema/role-gate rework. Either way, fix the design's internal contradiction before shipping.

### 3. `error` page emission rule needs reconciliation

> **Resolved.** D5 build-time bullet now states Part 34 adopts the spec's gated-uniformly rule and explicitly supersedes the contrary paragraph in action-authoring/design.md (the "emit for every form action" stance). The operational concern about stuck-state visibility is addressed by authors declaring `error` explicitly in the relevant app's verb map.

Part 34 (line 19, D5) says build-time page emission reads `access.{host_app_name}` keys: "A verb page is emitted iff the verb key exists in the host app's map." This applies uniformly to all four verbs.

The existing concept design contradicts itself on this for `error`:

- `action-authoring/design.md:773` — "The fourth verb the page-emission resolver handles is `error`, gated identically to the other three."
- `action-authoring/design.md:811` — "The `-error` page is emitted for every form action regardless of the action's `access.{app_name}` verb list. The rationale is operational: an action in `error` is a stuck state."
- `action-authoring/spec.md:287` — matches line 773 (gated by access).

The spec is consistent with Part 34's rule. The earlier design.md prose is not. Part 34 should explicitly call this out — either as "Part 34 adopts the spec's gated-uniformly rule and supersedes the contrary paragraph in action-authoring/design.md" or take the other side. As written, an implementer hitting line 811 has no way to know Part 34 changed the answer.

### 4. Query-time aggregation for `visible_verbs` needs a sketch, not just hand-off

> **Resolved.** New D12 in the design carries the concrete pipeline: per-verb `$let` resolves `gate` and `user_roles`, then `$or [{$eq: [gate, true]}, {$gt: [$size $setIntersection, 0]}]` projects the bool. MongoDB's `$or` short-circuits, so the `true`-gate case never hits `$setIntersection`'s array-only constraint. `$ifNull` defaults missing verbs to `[]`. Final stages: `$addFields visible_verbs` (four bools) + `$match $anyElementTrue`. `access_filter.yaml` becomes `visible_verbs_filter.yaml`. Touches row for `get-entity-workflows` updated to reference D12.

The "Touches" table's `get-entity-workflows` row (line 327) commits "Mongo can do this in-pipeline; precise pipeline shape lands with implementation." For the cornerstone server-side enforcement of a foundational access change, a sketch is warranted — without one, reviewers can't tell whether the `true`-gate, per-verb-projection, and "drop when all-false" rules compose cleanly.

The existing `access_filter.yaml` (`modules/workflows/api/stages/access_filter.yaml`) is a flat `$match` against the action-doc's `access.{app}` array. The new shape needs:

1. A per-verb `$let` that resolves each declared verb's gate (`true` → always pass; array → `$setIntersection` against user roles → `$size > 0`).
2. A `$project` adding `visible_verbs: { view, edit, review, error }` as four bools, defaulting absent verbs to false.
3. A `$match` dropping actions where all four bools are false.

The `true` value handling in particular is non-trivial in `$setIntersection`-based aggregations (`true` isn't a role list to intersect with). The `$cond`/`$switch` shape needs to land in this design, not be deferred. CLAUDE.md says "Resolve the open question; don't defer it" — this fits.

## Medium

### 5. `D6` interaction→verb table conflates "type of write" with "level of authorisation"

> **Accepted.** D6 now spells out the consideration: `not_required` and `submit_edit` share `edit` because no concrete app has asked for separately-gated skip rights, and adding a `skip` verb expands the closed vocabulary speculatively. When the need surfaces, the table grows a `not_required → skip` row — zero migration cost since no action declares `skip` today. The trade-off is acknowledged rather than passed silently.

The table maps `submit_edit` and `not_required` both to the `edit` verb. The two interactions have different real-world authorisation semantics:

- `submit_edit` — author the form, do the work.
- `not_required` — declare this action doesn't apply ("skip this").

In several real systems, skipping is a manager-only call even when editing is open to the team. Folding both into `edit` rules that out by the schema, not by intent. Compare against per-verb gating's whole rationale (D2): "Per-action gating (today) can't express 'triage user can reassign but not submit.'" The same argument applies to `not_required` vs `submit_edit`.

**Options.** Either (a) accept the conflation explicitly and note that splitting `not_required` into its own verb is a v1.x add ("any future interactions add a row here" — line 136 — already opens the door); or (b) introduce a `skip` verb in v1. Option (a) is fine, but the design should say "we considered splitting and chose not to" rather than letting the conflation pass silently.

### 6. UI selection priority `edit > review > error > view` mishandles the "I'm the reviewer, I want to see the submitted form" case

> **Resolved.** D7's selection-rule paragraph rewritten: the composition holds for the current table because the engine nulls the irrelevant cell at each stage that has a single user-facing affordance. The "composes correctly at every stage" overclaim is gone; the design now notes that a future kind with multiple non-null cells per stage would need a stage-keyed priority override.

D7's UI selection rule, applied to a user who has both `edit` and `review` verbs at the `in-review` stage, picks `edit` first. But `links.edit = null` at `in-review` (per the engine table line 189), so it falls through to `review` and lands on `task-review`. Correct.

But consider the same user at `changes-required`: `links.edit = task-edit`, so they land on the edit page — even though their `review` role suggests they're the reviewer, not the editor. The "editor lands on task-view at `in-review`; reviewer lands on task-review" intuition (line 206) only holds because the engine nulls the irrelevant cell at that specific stage. At `changes-required`, the rule lands a reviewer-and-editor on the edit page, which may or may not be what reviewers want.

This isn't a fatal flaw — the user can click out and back. But the design claims fall-through "composes correctly with the engine's per-verb nulls at every stage" (line 204), which overstates it. The composition works when the engine has nulled the cell; at stages where multiple verbs have non-null cells, the static priority picks `edit` unconditionally.

**Fix.** Tighten the claim to "the engine nulls the irrelevant cell at every stage that has a single user-facing affordance; stages with multiple non-null cells (currently none in the table) would need a stage-keyed priority override." Then leave the static priority — it's correct _for the table you have_.

### 7. Migration "semantics preserved exactly" claim is too strong for the cross-app-role-clash case

> **Rejected.** Migration section removed entirely — workflows haven't shipped, so there's nothing to migrate. The finding's concern (codemod preserves leaks) is moot. D3's "cross-app clash question disappears" now stands unqualified because the only consumers are future authors writing against the new shape.

The Migration section (line 337) says "any user who can do X today still can after migration; no user gains access." This holds **within** a single app. But the entire D3 rationale (line 30) is that today's flat `roles` list silently leaks across apps when role names clash. Consider:

```yaml
# today
access:
  prp-team: [view]
  prp-support: [view]
  roles: [manager]
```

If `manager` exists as a role under `prp-support.apps.{user}.roles` for someone who shouldn't see this action, they see it today (the leak D3 calls out). The mechanical migration produces:

```yaml
access:
  prp-team: { view: [manager] }
  prp-support: { view: [manager] }
```

…and that `prp-support` user keeps seeing it post-migration (they have `manager` in the relevant app's roles). So today's leak is **preserved** by the codemod. Strictly speaking, that's fine — "no user gains access" holds. But the design's headline claim of "the cross-app clash question disappears" (D3) is half-true after migration: the schema closes the future, but the past leak rides through.

**Fix.** One sentence in Migration acknowledging "the mechanical codemod preserves any cross-app role-name leaks that exist today; closing those is a per-action authoring task after migration, not part of the codemod."

## Low

### 8. `visible_verbs` shape commitment is in prose only

> **Resolved.** Schema section now has a "Query response shape" subsection committing to `visible_verbs: { view, edit, review, error }` — always four keys, default false. Downstream consumers don't need defensive `?.verb ?? false` chains.

D5 (line 121): "return `visible_verbs: { view: bool, edit: bool, review: bool, error: bool }`… The four bools default to `false` for any verb the action doesn't declare." Good. But the Schema section doesn't restate this — D8's `action_allowed` shape inherits it via "matching `visible_verbs`." A reader looking only at Schema sees no shape commitment for the engine-emitted bag.

**Fix.** Add one line under Schema: "Query response shape — every action carries `visible_verbs: { view, edit, review, error }` (always four keys, default false)." Otherwise downstream consumers (Part 18's `action_role_check`, Part 24's universal-fields) end up writing defensive checks on `visible_verbs?.edit ?? false`.

### 9. D8 `action_role_check` ripple needs to flag the engine's check is no longer "just roles"

> **Resolved.** D8 now spells out that the client-side mirror evaluates each verb's gate the same way the server does — `true` shortcut or `setIntersection` against `_user.apps.{app_name}.roles`. Four lookups, not one, with the `true`-branch as new logic.

Part 18's `action_role_check` (line 138) "computes the role intersection: `access.roles` ∩ user roles." Under per-verb gating, the check the engine runs at query/submit time is **per-verb** — there's no single intersection any more. D8 says the component "becomes a verb check" populating `_state.action_allowed: { view, edit, review, error }`, which is right — but the _logic_ the client-side check has to mirror is now "for each verb, look up the verb's gate, evaluate `true` or `setIntersection`." That's four checks, not one, and the `true` branch is new logic the existing component doesn't have.

**Fix.** Note in D8 that the client-side mirror needs to evaluate per-verb gates including the `true` shortcut. The current sentence ("The check is still defence in depth") undersells the implementation delta.

### 10. Part 30 D11's `engineLinks` per-slug iteration needs updating, not just the link map shape

> **Resolved.** Touches row for Part 30 now explicitly calls out the D11 pipeline-construction change — `$mergeObjects: [$<slug>, { link }]` becomes `$mergeObjects: [$<slug>, { links: { view, edit, review, error } }]`. Flagged as a pipeline rewrite, not a docs-only edit.

D7 changes `action[slug].link` → `action[slug].links`. But Part 30's `buildActionStageUpdate` (Part 30 design.md line 225-230) iterates per slug and computes one link via `$mergeObjects: [$<slug>, { link: <computed> }]`. The update needs to produce `{ links: { view, edit, review, error } }` under each slug, not `{ link: ... }`. The mongoize-merge with `$mergeObjects` against a sub-object map is a meaningfully different shape, and Part 30's worked code in D11 doesn't carry through.

**Fix.** Part 34's "Touches" row for Part 30 (line 324) needs to call out that Part 30 D11's pipeline-construction code (`$mergeObjects` shape) changes, not just the schema. Otherwise the Part 30 amendment ships a docs-only edit while the implementation needs a pipeline rewrite.

## Summary

The schema decision and the runtime three-checkpoint structure are solid. The work left to close is on the ripples: Part 13's hook-auth synthesis formula (#1), the `notification_roles` self-contradiction (#2), `error` page emission reconciliation (#3), and the query-time aggregation sketch (#4). The Medium items refine claims that are slightly overstated; the Low items are cleanup.

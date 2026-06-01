# Part 34 — Action access model (per-app, per-verb, per-role)

**Source rationale:** [workflows-module-concept/action-authoring/design.md § Decision 3](../../../../workflows-module-concept/action-authoring/design.md) (current access semantics), [engine/spec.md](../../../../workflows-module-concept/engine/spec.md) (submit-time gate, query-time filter), [part 30 § D4](../../_rejected/30-status-map-rendering/design.md) (link computation reads `access.{slug}` verbs). **Layer:** action grammar + engine + resolver + display. **Size:** L. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Status — design-only; implemented via Part 38

This part is completed as a **design/contract without a standalone implementation**. Its decisions — the per-app per-verb access shape, the `visible_verbs` query response, the per-verb links map, signal→verb submit gating, and the `workflow-` endpoint-id prefix — are implemented as part of [Part 38 — Engine rebuild](../../38-engine-rebuild/design.md). Part 38 rebuilds the engine and **absorbs this part's engine-touching changes** rather than amending the now-rejected [Part 30](../../_rejected/30-status-map-rendering/design.md). No code lands from Part 34 on its own; Part 38 is the implementation vehicle. The "Touches" and "Verification" sections below describe the contract Part 38 must satisfy, not separate work.

## Goal

Rework the `access:` block on action YAML so role-based gates are scoped to the app they belong to, and so different verbs within the same app can be gated to different roles. Today the model has a per-app verb map plus one flat action-wide `roles:` list — that flat list cuts across apps (role names work only if they don't clash between apps, by convention not by schema) and gates the entire action (no way to say "anyone can view but only managers can review"). This part replaces the two-axis-but-not-really model with one canonical shape: every verb in every app declares its own role gate.

The change is foundational. It touches the action grammar (concept spec), the engine's submit gate, the resolver's build-time page filter, the query-time filter on `get-entity-workflows`, the link computation in [Part 30](../../_rejected/30-status-map-rendering/design.md) (which today reads "slug's verbs" as a flat list), and the client-side `action_role_check` from [Part 18](../18-entity-components/design.md). It also unblocks downstream work in Part 24 (universal-fields surface) where the question "can a triage user update metadata without form-submit rights" needs an answer that the current binary role gate can't give.

## Proposed change

1. **`access.{app_name}` is always a map of verb → role-gate.** Verb keys are `view` / `edit` / `review` / `error`. Gate values are either `true` (any user of the app passes) or a non-empty list of role strings. There is one canonical shape; the existing shorthand list (`access.{app_name}: [view, edit]`) is removed.
2. **Action-wide `access.roles` is removed.** Every role gate is per-app per-verb. Apps that need a uniform "manager-only" gate spell it out on each verb under each app they care about.
3. **Missing app key → no access in that app. Missing verb under an app key → no access to that verb in that app.** This eliminates the `prp-support: []` ceremony — omitting the key is the canonical "this app has no access" expression.
4. **Verbs are independent — granting one never grants another.** Having `edit` does not grant `view`; every verb is gated on its own. Authors who want a viewer-everyone / editor-manager pattern write both gates explicitly.
5. **Roles are resolved per app from `user_contacts.apps.{app_name}.roles`.** Same source as today. The cross-app clash question disappears because the action-side gate is also app-scoped — `roles` in `access.{app-a}.edit` are checked against `apps.{app-a}.roles`, never against `apps.{app-b}.roles`.
6. **Engine submit-time check reads `access.{current_app}.{signal-verb}`.** Signal → verb map (user-driven signals only; see D6): `submit` / `progress` / `not_required` require `edit`; `resolve_error` requires `error`; `approve` / `request_changes` require `review`. `view` has no signal (read-only).
7. **Build-time page filter (`makeActionPages`) reads `access.{host_app_name}` keys.** A verb page is emitted iff the verb key exists in the host app's map. The verb's role gate is checked at query/submit time, not at build time.
8. **Query-time filter (`get-entity-workflows`) returns a per-verb visibility map per action.** Each action's payload carries `visible_verbs: { view: bool, edit: bool, review: bool, error: bool }` — one bool per verb the action declares for the host app, true iff the user's roles satisfy that verb's gate. Replaces today's binary "action visible / hidden." `view: false` on every verb hides the action from the entity page entirely (matches today's "no role intersection" outcome).
9. **Action-doc link writes become per-verb.** [Part 30 § D4](../../_rejected/30-status-map-rendering/design.md)'s engine-computed `action[slug].link` (one link per slug) is replaced by `action[slug].links` (a map keyed by verb). The UI picks the user-appropriate link at render time using the user's `visible_verbs`.
10. **`notification_roles` stays at action root, unchanged.** It's a fan-out config, not an access decision, and v1 has no real reason to scope it per-app.

Out of scope (handled separately): the universal-fields write-surface decision (Part 24) which depends on this part's outcome; any change to how `_user.roles` is sourced (continues to come from `apps.{app_name}.roles` on `user_contacts`).

## Why the current model breaks

The action-authoring spec § Decision 3 declares two axes — per-app verb maps and an action-wide role gate — and presents them as orthogonal. They aren't quite. Three concrete failure modes the current shape can't cleanly express:

- **Cross-app role-name clash.** `access.roles: [manager]` checks role-name intersection against the user's effective roles for the current app. If `manager` happens to be a role name in both `my-team-app` and `my-customer-app` (under `apps.{name}.roles` on `user_contacts`), the gate passes for a customer-app manager visiting an action that was meant for team-app managers. The reference project avoids this by hygiene-naming roles per domain (`device-manager`, `support-manager`), but the schema doesn't enforce hygiene — one careless rename and access leaks. The flat list also makes intent unreadable: `roles: [device-manager, finance-admin]` can mean either "either role anywhere" or "device-manager in app A and finance-admin in app B" — the schema is silent.
- **No per-verb gating.** Every verb the host app declares is open to every user who passes the action-wide role gate. There's no way to say "in `prp-team`, `device-team` can `edit` but only `device-manager` can `review`." The reference project handles this today by splitting the work across two actions (one for editors, one for reviewers), which is workaround as schema. It also blocks legitimate "triage role can reassign but not submit" patterns (the wedge Part 24 was running into).
- **The empty-list ceremony.** Authors writing `app-name: []` to mean "no access" — when the schema already supports "omit the key" with the same semantics. Two ways to express the same thing is one too many; consumers can't tell whether the empty list is intentional ("explicitly declared no access for this app") or a stale leftover. Schema should have one shape.

None of these have bitten yet — there are no shipped workflows — but the shape is the floor that every future project will build on. Fix it once now while the cost is zero.

## Schema

### Canonical shape

```yaml
type: qualify
kind: form
access:
  prp-team:
    view: true                              # any prp-team user
    edit: [device-manager, device-team]     # role-gated
    review: [device-manager]                # narrower gate
  prp-support:
    view: [device-team]                     # also role-gated
  # no other app key → action invisible in any other app
notification_roles:                         # action-root, app-agnostic (D9)
  - device-manager
  - device-team
```

### Per-app block

`access.{app_name}` is an object whose keys are verbs and whose values are role gates. Both pieces are constrained:

| Field          | Type                            | Allowed values                                                                                                                                                                 |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| verb (key)     | string                          | `view`, `edit`, `review`, `error`. Vocabulary is closed in v1; unknown verb keys fail build-time validation.                                                                   |
| gate (value)   | `true` \| array of role strings | `true` means "no role gate — any user of this app passes." A non-empty array means "user's roles for this app must intersect this list." Empty array `[]` is invalid (use omission instead). |

Omitted verb keys mean **no access to that verb in this app**. Build-time page emission, query-time filtering, and submit-time checks all read the verb's presence/absence first; only present verbs are then evaluated against their role gate.

### Removed surfaces

- **`access.roles`** (action-wide) — gone. Every role gate is per-app per-verb.
- **`access.{app_name}: [view, edit]` shorthand** — gone. Always the map form.
- **`access.{app_name}: []` (empty list)** — invalid. Omit the key.

### Keys at the `access:` block top level

The `access:` block holds **only** per-app verb-gate maps. Each top-level key is an `{app_name}`; each value is a verb→gate map. Any other key at the top of `access:` fails build-time validation.

`notification_roles` is **not** under `access:` — it lives at the action root (see D9). The previous draft nested it under `access:`; that nesting was incidental and is removed here.

### Query response shape

Every action returned by `get-entity-workflows` carries `visible_verbs: { view: bool, edit: bool, review: bool, error: bool }` — always four keys, defaulting to `false` for any verb the action doesn't declare for the host app. Downstream consumers (Part 18's `action_role_check`, Part 24's universal-fields) read specific verbs by name; they don't need defensive `visible_verbs?.edit ?? false` chains because the four keys are always present.

## Key decisions

### D1. One shape, not two

The proposal collapses today's two value-shapes (`access.{app}: [verbs]` and `access.{app}: { verb: roles }`) into one. Authors only ever write maps. Trade-off: every action — even the simplest "anyone in the app can view" case — costs more keystrokes than today's `prp-team: [view]`.

We pay that cost on purpose. The Lowdefy idiom across this repo (see CLAUDE.md "One correct way") is to enforce the pattern mechanically rather than rely on each author following a convention. Two valid shapes means consumers and tooling have to handle both, and authors have to choose between them — every code review becomes "should this have been the other shape?" The verbose-canonical-form-only stance shifts the cost from review/tooling time to write time, which is the right trade.

There are no shipped workflows yet, so the verbose-canonical-only stance costs nothing in existing-content rewrites.

### D2. Per-verb gating is the right granularity

Per-action gating (today) can't express "triage user can reassign but not submit," "only managers can approve," or "support reps can view but never review." Per-field gating (each universal field has its own role list) would be over-engineering — no concrete app has asked for it and the v1 design has consistently rejected per-field role lists. Per-verb is the level that matches the user-facing affordances: the buttons users see are per-verb (`submit`, `approve`, `request_changes`, `resolve_error`); roles should gate those buttons.

### D3. Roles are scoped to apps by construction, not by hygiene

`access.{app_name}.{verb}: [device-manager]` is unambiguous: check against `_user.apps.{app_name}.roles`. There's no global `roles:` field anymore, so there's no temptation to write a role name that has to be interpreted "across apps." If two apps both have a role called `manager`, that's fine — each `access.{app_name}.{verb}` gate only ever reads that app's roles list.

This mirrors how `_user.roles` is already sourced per-app from `user_contacts.apps.{app_name}.roles`. The action's gate now aligns with the source.

### D4. Verbs are independent

Today granting `edit` automatically grants `view`, and granting `review` automatically grants `view`. That automatic grant was a convenience under the binary role gate — if you could edit, you could obviously also view, so the spec said so for ergonomics. Under per-verb gates the automatic grant becomes ambiguous: if `edit: [manager]` is the only declared verb, does the user also get `view: true` (anyone, since `view` wasn't constrained) or `view: [manager]` (same as the highest declared verb)? Either choice surprises somebody.

Drop the automatic grant entirely. Granting one verb never grants another, and every verb the action exposes must be declared. Authors writing `edit: [manager]` and wanting "anyone can view" write both:

```yaml
prp-team:
  view: true
  edit: [manager]
```

This is more lines but readable in five seconds. Automatic defaulting is the kind of thing that bites people when they're surprised by it; the cost of the extra line is well-spent.

The resolver build-time validator **lint-warns (does not hard-error)** when an app block declares `edit`, `review`, or `error` without also declaring `view`. The author may have intended the omission (a role-only-edits-no-read workflow), so the schema doesn't reject it — but the common case is "I forgot to also write `view` for my editors," and a warning surfaces that mistake without forcing a workaround for the legitimate case.

### D5. Three checkpoints, all per-verb

The current model checks at three points (action-authoring spec § "Where the checks live"); this part keeps all three but switches them to per-verb:

- **Build-time** (`makeActionPages`) — emits a verb page iff the verb key is present in `access.{host_app_name}`. Role gates don't matter at build time (no user to check against); presence of the key alone gates page generation. Unchanged in spirit, but reads the map's keys not a list. This applies uniformly to all four verbs including `error`; Part 34 adopts the rule as stated in [action-authoring/spec.md § page emission](../../../../workflows-module-concept/action-authoring/spec.md) and **supersedes** the contrary paragraph in [action-authoring/design.md § page emission](../../../../workflows-module-concept/action-authoring/design.md) that proposed emitting `-error` for every form action regardless of access. The operational concern that paragraph raised (stuck-state visibility) is addressed by authors declaring `error` explicitly in the relevant app's verb map.
- **Query-time** (`get-entity-workflows`) — for each action visible to the host app, evaluate every declared verb's gate against `_user.apps.{app_name}.roles` and return `visible_verbs: { view: bool, edit: bool, review: bool, error: bool }` on the action payload. The four bools default to `false` for any verb the action doesn't declare. If `visible_verbs.view === false` (and no other verb is true), the action is dropped from the response — that preserves today's "no role intersection → invisible" outcome.
- **Submit-time** (`SubmitWorkflowAction`) — read the signal's required verb from the table (D6), check `access.{current_app}.{required_verb}` against the user's roles, reject with a structured error if the gate fails. Recheck happens after the engine looks up the action doc, before any writes.

### D6. Signal → required verb

[state-machine.md](../../../../workflows-module-concept/state-machine/design.md) owns the signal vocabulary (the FSM replaces the old interaction → target-status table). Of those signals, only the **user-driven** ones — the buttons a page template surfaces — carry an access check; engine-cascade and pre-hook signals (`unblock`, `activate`, `block`, `error`, `internal_*`) are not role-gated (they no-op against non-listening states per the FSM). This table maps each user-driven signal to the verb it requires — equivalently, each button's template owns a verb:

| Signal            | Surfaced on     | Required verb |
| ----------------- | --------------- | ------------- |
| `submit`          | edit template   | `edit`        |
| `progress`        | edit template   | `edit`        |
| `not_required`    | edit template   | `edit`        |
| `resolve_error`   | error template  | `error`       |
| `approve`         | review template | `review`      |
| `request_changes` | review template | `review`      |

`view` has no signal — it's the read affordance, gated only on read paths. Any future user-driven signal (e.g. an `update_metadata` button if Part 24 lands one) adds a row here.

**On `submit`, `progress`, and `not_required` all sharing the `edit` verb.** These are semantically distinct — `submit` / `progress` are "do the work," `not_required` is "declare this action doesn't apply." In some domains skipping is a manager call even when editing is open to the team, which the shared-verb mapping rules out by schema. We considered a separate `skip` verb and chose not to in v1: no concrete app has asked for separately-gated skip rights, and adding the verb now expands the verb whitelist and the design surface every author reasons about. When the need surfaces, `not_required` maps to a new `skip` verb and `skip` joins the whitelist — no schema churn for existing actions because today nobody declares a `skip` gate to migrate.

**The `review` verb's *presence* is also read app-global by the engine FSM.** Separately from the access *gate* above, the engine reads whether the action declares a `review` verb *at all* — across every app block, ignoring the role values — to decide whether `submit` lands `in-review` or `done` (the FSM split implemented in [Part 38 D4](../../38-engine-rebuild/design.md)). This is an **action-global structural property, not scoped to the submitting app**: a single action doc is shared across every app (all read the same `status[0].stage`), so whether a review stage exists can't depend on who submits — otherwise a submit from a review-declaring app would land `in-review` while a submit from another app on the *same* action lands `done`. Equivalently it is "a review page is emitted for this action" (D5 emits the page iff some app declares `review` — the same input).

**Editing `access` can reshape reachable states (known V1 limitation).** Because verb *presence* drives both the FSM split and page/link emission, removing a verb from a deployed action's `access` while actions are mid-flight at the stage that verb gates strands them — e.g. drop `review` while an action sits at `in-review` and there is no review page, gate, or `links.review` to advance it, and no engine remediation. The module ships no version actions or in-flight migration; per its V1 migration stance, an author who edits access on a live workflow owns any required data migration.

### D7. Per-verb links on action docs

Where a single engine-computed `link` per slug used to be written, this part writes a **per-verb link map** `action[slug].links` and the UI selects from it. The map is a function of `(kind, stage, slug's declared verbs)`; per-verb *role gates* don't enter the computation — they filter which verbs the user is in, which the UI applies on read via `visible_verbs`.

[Part 38 — Engine rebuild](../../38-engine-rebuild/design.md) implements this. Under Part 38's load-plan-commit model the engine composes the whole action doc — including this `links` map — in JS during the plan phase, rendered against the planned post-commit state, then writes it in one `$set`. So the map is just built in the planner (`computeEngineLinks.js`); there is no "engine writes vs compute-on-read" dilemma and no `$mergeObjects` merge to reason about (the staleness/clobber concerns the rejected Part 30 wrestled with don't arise — Part 38 D12). Render-on-write stays uniform (`message`, `status_title`, and the link map are written together; all consumers read one doc shape), and notifications/audit can quote the same map and apply their own selection logic.

The action-doc shape becomes:

```js
{
  // existing top-level fields...
  demo: {
    message: 'Install D-42.',
    links: {
      view:   { pageId: 'workflow-simple-view',   urlQuery: { action_id: 'a3f2-uuid' } },
      edit:   { pageId: 'workflow-simple-edit',   urlQuery: { action_id: 'a3f2-uuid' } },
      review: null,                    // demo has no review verb declared
      error:  null,
    },
  },
  customer: {
    message: 'Installation pending.',
    links: {
      view: { pageId: 'workflow-simple-view', urlQuery: { action_id: 'a3f2-uuid' } },
      edit: null,                      // customer doesn't have edit
      review: null,
      error: null,
    },
  },
  status_title: 'Installation pending',
}
```

For each slug, the engine builds the map by iterating the four verbs and asking "if a user had **only** this verb on this slug, where would they usefully go from `(kind, stage)`?" — per-verb-isolated computation, no cross-verb conditionals. Verbs the slug doesn't declare at all in `access.{slug}` get `null`. Verbs where the stage has no meaningful page (e.g. `edit` at `in-review`, `review` outside `in-review`) also get `null`. Per-verb role gates don't enter the engine's link computation — the gates filter which verbs the user is in, which the UI applies on read via `visible_verbs`.

The per-verb table (kind: simple; the simple-kind pages are the module's **fixed shared pages**, which carry the `workflow-` prefix — see D10; form follows the same shape with **derived** per-action page IDs `{workflow_type}-{action_type}-{verb}` (no prefix); tracker links every non-null cell to the child's `workflow-overview`):

| Stage              | `view`      | `edit`      | `review`      | `error`      |
| ------------------ | ----------- | ----------- | ------------- | ------------ |
| `action-required`  | `workflow-simple-view` | `workflow-simple-edit` | `null`        | `null`       |
| `in-progress`      | `workflow-simple-view` | `workflow-simple-edit` | `null`        | `null`       |
| `changes-required` | `workflow-simple-view` | `workflow-simple-edit` | `null`        | `null`       |
| `in-review`        | `workflow-simple-view` | `null`      | `workflow-simple-review` | `null`       |
| `done`             | `workflow-simple-view` | `null`      | `null`        | `null`       |
| `error`            | `workflow-simple-view` | `null`      | `null`        | `workflow-simple-error` |
| `blocked`          | `null`      | `null`      | `null`        | `null`       |
| `not-required`     | `null`      | `null`      | `null`        | `null`       |

This per-verb-isolated table is the contract Part 38 implements, replacing the **compound-cell table** from the rejected Part 30 — that table had cells like "`workflow-simple-review` if review verb, else `workflow-simple-view`" which conflated "which verb the user has" with "which page is meaningful at this stage." Per-verb-isolated cells separate the two concerns: each column is independent, and the UI's selection logic (below) handles user verb composition via fall-through.

**UI selection rule.** The UI picks the link to render for a user on the entity-page action card using a static priority over the link map and the user's `visible_verbs`:

```
for verb in [edit, review, error, view]:
  if visible_verbs[verb] && links[verb] != null:
    return links[verb]
return null  // no link affordance for this user at this stage
```

Static priority `edit > review > error > view` works for the table above because the engine nulls the irrelevant cell at every stage that has a single user-facing affordance (e.g. `edit` is null at `in-review`; `review` is null outside `in-review`). At those stages the priority falls through correctly — an editor lands on `workflow-simple-view` at `in-review` because `links.edit` is null there; a reviewer with edit + review at `in-review` lands on `workflow-simple-review` for the same reason. The composition is **not** universal: at stages with multiple non-null cells (none in the current table, but possible for future kinds), a user with both `edit` and `review` would always land on `edit` regardless of intent. If such a stage is introduced, that kind needs a stage-keyed priority override. The static priority is correct for the table you have, not by general construction.

Because Part 30 is rejected and superseded by [Part 38](../../38-engine-rebuild/design.md), this is not an amendment to a live design — it is the link contract Part 38 builds. There is no separate "land Part 30's amendment first" prerequisite; the table and shape above are inputs to the Part 38 rebuild.

### D8. `action_role_check` becomes a verb check

[Part 18 § action_role_check](../18-entity-components/design.md) is a thin client-side component that populates `_state.action_allowed` for use by the page-level submit gate. Under per-verb access, "action allowed" is no longer a single bool — it's per-verb. The component grows to populate `_state.action_allowed: { view: bool, edit: bool, review: bool, error: bool }` (matching `visible_verbs`) and consumers read the specific verb they care about (`_state.action_allowed.edit` on the edit page, `.review` on the review page, etc.).

The client-side mirror has to evaluate each verb's gate the same way the server does: a `true` gate always passes; an array gate intersects against `_user.apps.{app_name}.roles`. Today's `action_role_check` is one role intersection; under per-verb gating it's four lookups (one per declared verb), each with the `true`-shortcut branch added. The check is still defence in depth (server-side query/submit-time checks are the real gate); this just keeps the UI affordances honest.

### D9. `notification_roles` is action-root, app-agnostic

Two reasons:

- **It's a fan-out config, not an access decision.** Recipients of a notification need not have any access to the action (e.g. notify the team lead even when the action's view gate excludes them). Nesting it under `access:` would conflate two unrelated concepts.
- **Per-app fan-out is not a v1 ask.** The current shape is a flat list, used uniformly across consumers. v1.x can scope it per-app if a concrete need surfaces; v1 keeps it flat.

Practically: removing it from `access:` lets the `access:` block have one well-defined shape (`{app_name}` → verb-gate map; no carve-out keys). The notification system reads `action.notification_roles` directly at the root.

### D10. Emitted-id naming for central auth config

Lowdefy's auth lives in the app's central `api.roles` / `pages.roles` config — endpoints don't carry their own role lists. Role rules are written as globs against endpoint ids. The Lowdefy build **prepends the module entry id** to every emitted page and Api id (`buildModules.js`: `page.id = \`${entry.id}/${page.id}\``, and the same for endpoint ids), so every workflow id is already namespaced under the entry — `{entry_id}/…`. The entry id is the author's choice when wiring the module: typically `workflows`, or `onboarding-workflows` / `support-workflows` if unrelated workflows are split into separate module entries.

Entry scoping already delivers what an explicit per-endpoint prefix would — globs slice cleanly without a redundant literal:

```yaml
api:
  roles:
    sales-rep:
      - workflows/qualification-*           # any endpoint for this workflow type
    sales-manager:
      - workflows/qualification-approve-*   # just the approve action
```

(`workflows` is the module entry id.)

**Derived (per-workflow) endpoints carry no literal prefix** — the entry id namespaces them and the `{workflow_type}` segment slices them:

| Emitter | Id pattern (under `{entry_id}/`) |
| --- | --- |
| Page (per verb) — Part 12 | `{workflow_type}-{action_type}-{verb}` |
| Submit Api — Part 13 | `{workflow_type}-{action_type}-submit` |
| Hook Api (pre/post) — Part 13 | `{workflow_type}-{action_type}-{signal}-{pre\|post}` (internal-only; not glob-targeted) |
| Group on-complete Api — Part 13 | `{workflow_type}-group-{group_id}-on-complete` |

**Fixed (module-shipped) pages carry the `workflow-` prefix** — `workflow-overview`, `workflow-group-overview`, and the shared simple-kind pages `workflow-simple-{verb}`. Prefixing the *fixed* pages rather than the *derived* endpoints reserves the `workflow-*` space for the module's own infrastructure and keeps it disjoint from the per-type derived endpoints. The three useful globs are then:

- `{entry_id}/*` — every workflow endpoint (coarse fence).
- `{entry_id}/{workflow_type}-*` — one workflow type's derived action endpoints (pages + Apis).
- `{entry_id}/workflow-*` — the module's fixed pages. Coarse by nature: the shared simple pages aren't per-type (one set serves every simple action), so simple-action page-level auth is necessarily broad — the precise per-action gate is the submit-time check (D11).

The one collision to avoid is a workflow *type* literally named `workflow` (its derived ids `workflow-{action}-{verb}` would land in the fixed-page space). `workflow` is therefore a reserved workflow-type name, rejected by the resolver's config validation. (An earlier draft of this design prefixed the *derived* endpoints with `workflow-`; that was redundant with entry scoping — `workflows/workflow-…` doubles the word — and is dropped. See review-3 #1.)

Hook Apis are **internal Apis** (callable only from `context.callApi`, no HTTP entry), so no glob in `api.roles` needs to target them. The submit endpoint's role rule is the gate for the entire interaction including its hooks.

### D11. Submit-time access enforcement layers

With the central-auth model and the internal-only hook stance from the Part 13 ripple, the three checkpoints from D5 land on concrete Lowdefy surfaces:

- **Build-time** — `makeActionPages` (Part 12) and `makeWorkflowApis` (Part 13) emit pages/Apis only for declared verb keys. No user check; presence-of-key gating.
- **Page-level (request-time)** — Central `pages.roles` config grants role globs over page ids. Authors writing `{entry_id}/qualification-edit` in a role's page glob list control who can land on the action's edit page. Hard to express **per-app** at this layer (page is one id across apps); Part 18's `action_role_check` (D8) is the per-app refinement that hides the form when the user lacks the verb in the current app.
- **Submit-time** — Central `api.roles` config grants role globs over the Api id (`{entry_id}/{workflow_type}-{action_type}-submit`). The submit handler additionally runs the precise per-app+per-verb check from D5 against `_user.apps.{current_app}.roles` and `access.{current_app}.{signal-required-verb}`, rejecting with a structured error if it fails. This is the authoritative gate — the central `api.roles` glob is a coarse outer fence, the handler check is the precise inner fence.

Hooks have no separate gate: they're internal Apis invoked by `update-action-*`'s routine after the submit-time check has passed.

### D12. Query-time pipeline shape for `visible_verbs`

`get-entity-workflows` projects a four-key `visible_verbs` bag onto each action and drops actions where all four are false (the "no role intersection on any verb → invisible" outcome from D5).

The action doc carries the resolver-denormalised access shape: `access.{app_name}.{verb}` is either `true` or `[role_strings]`. For each of the four verbs, the pipeline resolves the gate against the user's per-app roles and writes a bool.

**Per-verb resolution** (shown for `edit`; `view`/`review`/`error` are identical with the field name swapped):

```yaml
edit:
  $let:
    vars:
      gate:
        $ifNull:
          - $getField:
              field: edit
              input:
                $ifNull:
                  - $getField:
                      field: { _module.var: app_name }
                      input: $access
                  - {}
          - []
      user_roles:
        $ifNull:
          - _user:
              _string.concat:
                - 'apps.'
                - _module.var: app_name
                - '.roles'
          - []
    in:
      $or:
        - { $eq: [$$gate, true] }
        - $gt:
            - $size: { $setIntersection: [$$gate, $$user_roles] }
            - 0
```

The `$or` short-circuits when `$$gate` is `true`, so `$setIntersection` (which rejects non-array operands) only runs in the array branch. The outer `$ifNull` defaults missing verbs to `[]`, which intersects to empty → `false`. The schema validator (build-time) guarantees `gate ∈ {true, [string]}`; query-time trusts that and lets a schema-escape surface as a Mongo error rather than silently coercing to `false`.

**Pipeline stages** (replaces today's `access_filter.yaml` `$match`):

```yaml
- $addFields:
    visible_verbs:
      view:   { $let: { vars: { ... }, in: { ... } } }   # same shape, field: view
      edit:   { $let: { vars: { ... }, in: { ... } } }
      review: { $let: { vars: { ... }, in: { ... } } }
      error:  { $let: { vars: { ... }, in: { ... } } }

- $match:
    $expr:
      $anyElementTrue:
        - [$visible_verbs.view, $visible_verbs.edit, $visible_verbs.review, $visible_verbs.error]
```

Today's flat `access_filter.yaml` is replaced by `visible_verbs_filter.yaml` holding the `$addFields` + `$match` pair. Callers (`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`) reference it via `_ref`. The four per-verb `$let` blocks are repetitive but readable; if the duplication becomes painful later, an aggregation-stage codegen helper can build them — out of scope for v1.

**Note on `user_roles`.** Reads `_user.apps.{app_name}.roles` via dynamic-string composition. The build-time `_module.var: app_name` resolves to the current app at module-wiring time, so each app's emitted instance of `get-entity-workflows` carries its own `app_name` baked in.

## Worked examples

### Open access in one app

Anyone in `team-app` can view and edit; nobody in any other app has access.

```yaml
type: qualify
kind: form
access:
  team-app:
    view: true
    edit: true
```

### Uniform role gate

Only `finance-admin` users in `team-app` can view or review. Same role list under both verbs because the gate is the same; `view` is not implied by `review` (D4).

```yaml
type: approve-budget
kind: form
access:
  team-app:
    view: [finance-admin]
    review: [finance-admin]
```

### Mixed verbs within one app

Within `team-app`: anyone views, the assignee's team edits, managers review. This shape is **only expressible under per-verb gating** — the previous draft model could only gate the whole action with a single role list.

```yaml
type: lead-qualify
kind: form
access:
  team-app:
    view: true
    edit: [account-manager, account-rep]
    review: [account-manager]
notification_roles:
  - account-manager
```

An `account-rep` user sees the edit page and submits; can't approve. An `account-manager` sees both edit and review pages. A user with no relevant role sees only the read-only view page.

### Multi-app with an error verb

`team-app` users with one of the device roles get full access including the error-recovery page; `support-app` users get read-only view. No other app key → no access from any other app.

```yaml
type: device-install
kind: form
access:
  team-app:
    view: [device-manager, device-team]
    edit: [device-manager, device-team]
    error: [device-manager, device-team]
  support-app:
    view: true
notification_roles:
  - device-manager
  - device-team
```

## Touches

The change is foundational and ripples to several parts. Each ripple is small in isolation; the design lists them so reviewers can see the full surface.

| Where                                                                                                                                            | Edit                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [action-authoring/design.md § Decision 3](../../../../workflows-module-concept/action-authoring/design.md)                                          | Rewrite Decision 3 around the new shape: per-app verb map → per-verb role gate, drop the flat `access.roles`. Update the "Composition: verb gate AND role gate" subsection to "per-verb role gate" semantics. Update "Where the checks live."                                                  |
| [action-authoring/spec.md](../../../../workflows-module-concept/action-authoring/spec.md)                                                           | Update the `access:` block schema: top-level keys are only `{app_name}` (verb-gate map). Document `notification_roles` at the action root (not under `access:`).                                                                                                                                |
| [engine/spec.md § Access enforcement](../../../../workflows-module-concept/engine/spec.md)                                                          | Submit-time check switches to per-verb; replace the role-intersection check with `(verb-required-by-signal, app, user-roles)` per D6.                                                                                                                                                      |
| [submit-pipeline/spec.md](../../../../workflows-module-concept/submit-pipeline/spec.md)                                                             | Document the signal → required verb table (D6) explicitly (signal vocabulary per state-machine.md).                                                                                                                                                                                                                                 |
| [Part 4 (workflow config schema)](../04-workflow-config-schema/design.md) — already completed; treat as historical, amend via note    | Add a "Superseded by Part 34" note pointing here. The resolver-validated shape changes; the closed Part 4 documents the original shape.                                                                                                                                                          |
| [Part 12 (resolver pages)](../12-resolver-pages/design.md) — already completed; amend via note                                        | Two changes. (1) `makeActionPages` build-time filter reads the verb keys from the map. (2) **Emitted page ids are unchanged** — derived per-action pages keep `{workflow_type}-{action_type}-{verb}` (no literal prefix); entry scoping namespaces them for central-auth globs. The `workflow-` prefix is added to the module's **fixed** pages instead — see D10. |
| [Part 13 (resolver APIs)](../13-resolver-apis/design.md) — already completed; amend via note                                          | Two changes. (1) **Hook auth synthesis is dissolved.** Lowdefy's central auth doesn't carry per-endpoint role lists; hooks become **internal-only Apis** (no HTTP entry point, only callable via `context.callApi` from `update-action-*`). The submit endpoint's role check (per Lowdefy's central `api.roles` config) is the sole gate; there is no hook-side role synthesis. The "Auth by construction" section of Part 13 needs rewriting against this model. (2) **Emitted Api ids are unchanged** — `{workflow_type}-{action_type}-…` with no literal prefix; entry scoping handles glob slicing — see D10. |
| [Part 18 (entity-components) § `action_role_check`](../18-entity-components/design.md)                                                | `_state.action_allowed` becomes per-verb (D8). Update consumers in Part 16 / 17 / 24 to read the verb-specific bool.                                                                                                                                                                             |
| [Part 17 (shared-pages)](../17-shared-pages/design.md) and [Part 25 (group-overview)](../_completed/25-group-overview/design.md) — already completed; amend via note | The module's **fixed** pages gain the `workflow-` prefix (D10): `simple-view`/`simple-edit`/`simple-review` → `workflow-simple-*`, `group-overview` → `workflow-group-overview` (`workflow-overview` already conformant). Update each page's `id`, every `_module.pageId` reference, and the engine link table (D7). Implemented by Part 38. |
| [Part 38 — Engine rebuild](../../38-engine-rebuild/design.md) (supersedes the rejected Part 30 § D4)                                                    | Engine writes `action[slug].links` (per-verb map, D7) instead of a single `action[slug].link`. Part 38 composes this in the plan phase (`computeEngineLinks.js`) and writes the whole action doc in one `$set` — there is **no** `$mergeObjects` pipeline to rewrite (Part 30's `buildActionStageUpdate` is deleted by Part 38). The per-verb link table and action-doc shape in D7 are the inputs Part 38 builds against. |
| [Part 24 (universal-fields)](../../24-universal-fields/design.md)                                                                                   | Open question on "who can edit metadata" resolves through this part's per-verb shape (a future `update_metadata` signal maps to its own required verb if needed). Re-open under Part 24 once this lands.                                                                                  |
| [ui/spec.md](../../../../workflows-module-concept/ui/spec.md)                                                                                       | Update the verb table (lines 17-18) and the page-emission rule to read the map's keys. Update `actions-on-entity` rendering to read `visible_verbs` and select per-verb links.                                                                                                                  |
| `get-entity-workflows` aggregation                                                                                                               | Replace `access_filter.yaml` with `visible_verbs_filter.yaml`: per-verb `$let`/`$or` resolution → `$addFields visible_verbs` → `$match $anyElementTrue`. Concrete pipeline shape in D12. Same `_ref` callers (`get-workflow-overview`, `get-action-group-overview`).                              |

## Verification

- **Build-time:**
  - Resolver validates the new shape — verb-key whitelist enforced, role-gate values are `true` or non-empty arrays, empty list / shorthand list / unknown top-level key all rejected with clear messages.
  - Resolver lint-warns (no hard-error) when an app block declares `edit`, `review`, or `error` without also declaring `view` (D4).
  - `makeActionPages` emits verb pages based on map keys; missing keys → no page.
- **Query-time:**
  - `get-entity-workflows` returns `visible_verbs` per action; users with intersecting roles get `true` on the corresponding verb.
  - Users with no intersecting role on any declared verb drop out of the response.
- **Submit-time:**
  - Engine rejects `submit` when `access.{current_app}.edit` does not intersect user's roles; same for `review` ↔ `approve` / `request_changes`, `error` ↔ `resolve_error`.
- **Link rendering:**
  - Action doc carries `<slug>.links: { view, edit, review, error }` after every transition.
  - UI picks the highest-priority verb the user has access to and renders that link.
- **Demo app:**
  - Demo updates at least one action to use per-verb gating (e.g. one role can `edit`, another can `review`) and the page surfaces respect the gate.
- End-to-end coverage lands in [Part 22](../../_next/22-workflows-e2e-suite/design.md).

## Open questions

Points that were open during design and are now resolved; kept here as a decision log.

- **Q1. Should `view` default to `true` when other verbs are declared but `view` is omitted? — Resolved.** No defaulting. Every verb declared explicitly; lint-warn (don't hard-error) on `edit` / `review` / `error` declared without `view`. Captured in D4 and in the per-verb shape rules.
- **Q2. Should granting `edit` (or `review`) also grant `view`? — Resolved: no.** Verbs are independent at gate-check time — granting one verb never grants another. The lint warning from Q1 catches the common "I forgot view for my editors" case without baking an automatic view grant into the schema. Authors write the audience for each verb explicitly.
- **Q3. Where should `notification_roles` live? — Resolved (placement only): action root.** D9 captures the placement decision. The `access:` block now holds only `{app_name}` keys; `notification_roles` lives at the action root. (An earlier draft claimed `getActionFields.js:14` already reads `config.access?.notification_roles` so the consumer change "is one line" — that was **factually wrong**: `getActionFields.js` is a fixed field projection and reads no such thing, and `notification_roles` is in fact consumed nowhere in current code.) The **consumer model** — who reads `notification_roles`, from where, and whether role-based fan-out is the right primitive at all — is a full rethink, deferred to [Part 41 — Notification-roles model](../../41-notification-roles-model/design.md). Part 38 scopes the wiring out.
- **Q4. Verb priority for UI link selection — Resolved.** Static priority `edit > review > error > view`. Composes correctly with the engine's per-verb null values at every stage via fall-through — no stage-keyed priority table needed. Per-verb null pattern in the engine table (e.g. `edit = null` at `in-review`, `review = null` outside `in-review`) encodes the "which verb is meaningful here" semantics so the static priority always lands the user on the right page. Captured in D7 including the per-verb (kind, stage, verb) → page table and the selection rule.

## Depends on

- **[Part 4 (workflow config schema)](../04-workflow-config-schema/design.md)** — original access shape; amended by this part.
- **[Part 30 (engine-managed display)](../../_rejected/30-status-map-rendering/design.md)** — link computation table; amended by D7.

## Consumers

- **[Part 12 (resolver pages)](../12-resolver-pages/design.md)** — build-time verb filter.
- **[Part 13 (resolver APIs)](../13-resolver-apis/design.md)** — build-time verb-presence check for submit/hook Api emission; emitted Api ids follow D10's `{workflow_type}-{action_type}-...` convention (no literal prefix; entry-scoped). Hook Apis are internal-only and carry no auth gate of their own (D11).
- **[Part 16 (page-templates)](../16-page-templates/design.md) / [Part 17 (shared-pages)](../17-shared-pages/design.md)** — read `_state.action_allowed.{verb}` for the page's verb.
- **[Part 18 (entity-components)](../18-entity-components/design.md)** — `action_role_check` populates per-verb `_state.action_allowed`.
- **[Part 24 (universal-fields)](../../24-universal-fields/design.md)** — write-surface decision depends on this part's shape.
- **`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`** — query-time per-verb filter; emit `visible_verbs`.

# Part 34 — Action access model (per-app, per-verb, per-role)

**Source rationale:** [workflows-module-concept/action-authoring/design.md § Decision 3](../../../workflows-module-concept/action-authoring/design.md) (current access semantics), [engine/spec.md](../../../workflows-module-concept/engine/spec.md) (submit-time gate, query-time filter), [part 30 § D4](../30-status-map-rendering/design.md) (link computation reads `access.{slug}` verbs). **Layer:** action grammar + engine + resolver + display. **Size:** L. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Goal

Rework the `access:` block on action YAML so role-based gates are scoped to the app they belong to, and so different verbs within the same app can be gated to different roles. Today the model has a per-app verb map plus one flat action-wide `roles:` list — that flat list cuts across apps (role names work only if they don't clash between apps, by convention not by schema) and gates the entire action (no way to say "anyone can view but only managers can review"). This part replaces the two-axis-but-not-really model with one canonical shape: every verb in every app declares its own role gate.

The change is foundational. It touches the action grammar (concept spec), the engine's submit gate, the resolver's build-time page filter, the query-time filter on `get-entity-workflows`, the link computation in [Part 30](../30-status-map-rendering/design.md) (which today reads "slug's verbs" as a flat list), and the client-side `action_role_check` from [Part 18](../_completed/18-entity-components/design.md). It also unblocks downstream work in Part 24 (universal-fields surface) where the question "can a triage user update metadata without form-submit rights" needs an answer that the current binary role gate can't give.

## Proposed change

1. **`access.{app_name}` is always a map of verb → role-gate.** Verb keys are `view` / `edit` / `review` / `error`. Gate values are either `true` (any user of the app passes) or a non-empty list of role strings. There is one canonical shape; the existing shorthand list (`access.{app_name}: [view, edit]`) is removed.
2. **Action-wide `access.roles` is removed.** Every role gate is per-app per-verb. Apps that need a uniform "manager-only" gate spell it out on each verb under each app they care about.
3. **Missing app key → no access in that app. Missing verb under an app key → no access to that verb in that app.** This eliminates the `prp-support: []` ceremony — omitting the key is the canonical "this app has no access" expression.
4. **No implicit verb-implication.** `edit` no longer implies `view`; every verb stands on its own. Authors who want a viewer-everyone / editor-manager pattern write both gates explicitly.
5. **Roles are resolved per app from `user_contacts.apps.{app_name}.roles`.** Same source as today. The cross-app clash question disappears because the action-side gate is also app-scoped — `roles` in `access.{app-a}.edit` are checked against `apps.{app-a}.roles`, never against `apps.{app-b}.roles`.
6. **Engine submit-time check reads `access.{current_app}.{interaction-verb}`.** Interaction → verb map: `submit_edit` / `not_required` require `edit`; `resolve_error` requires `error`; `approve` / `request_changes` require `review`. `view` has no interaction (read-only).
7. **Build-time page filter (`makeActionPages`) reads `access.{host_app_name}` keys.** A verb page is emitted iff the verb key exists in the host app's map. The verb's role gate is checked at query/submit time, not at build time.
8. **Query-time filter (`get-entity-workflows`) returns a per-verb visibility map per action.** Each action's payload carries `visible_verbs: { view: bool, edit: bool, review: bool, error: bool }` — one bool per verb the action declares for the host app, true iff the user's roles satisfy that verb's gate. Replaces today's binary "action visible / hidden." `view: false` on every verb hides the action from the entity page entirely (matches today's "no role intersection" outcome).
9. **Action-doc link writes become per-verb.** [Part 30 § D4](../30-status-map-rendering/design.md)'s engine-computed `action[slug].link` (one link per slug) is replaced by `action[slug].links` (a map keyed by verb). The UI picks the user-appropriate link at render time using the user's `visible_verbs`.
10. **`notification_roles` stays at action root, unchanged.** It's a fan-out config, not an access decision, and v1 has no real reason to scope it per-app.

Out of scope (handled separately): the universal-fields write-surface decision (Part 24) which depends on this part's outcome; any change to how `_user.roles` is sourced (continues to come from `apps.{app_name}.roles` on `user_contacts`).

## Why the current model breaks

The action-authoring spec § Decision 3 declares two axes — per-app verb maps and an action-wide role gate — and presents them as orthogonal. They aren't quite. Three concrete failure modes the current shape can't cleanly express:

- **Cross-app role-name clash.** `access.roles: [manager]` checks role-name intersection against the user's effective roles for the current app. If `manager` happens to be a role name in both `my-team-app` and `my-customer-app` (under `apps.{name}.roles` on `user_contacts`), the gate passes for a customer-app manager visiting an action that was meant for team-app managers. The reference project avoids this by hygiene-naming roles per domain (`device-manager`, `support-manager`), but the schema doesn't enforce hygiene — one careless rename and access leaks. The flat list also makes intent unreadable: `roles: [device-manager, finance-admin]` can mean either "either role anywhere" or "device-manager in app A and finance-admin in app B" — the schema is silent.
- **No per-verb gating.** Every verb the host app declares is open to every user who passes the action-wide role gate. There's no way to say "in `prp-team`, `device-team` can `edit` but only `device-manager` can `review`." The reference project handles this today by splitting the work across two actions (one for editors, one for reviewers), which is workaround as schema. It also blocks legitimate "triage role can reassign but not submit" patterns (the wedge Part 24 was running into).
- **The `prp-support: []` ceremony.** 17 occurrences in the reference project. Authors writing `app-name: []` to mean "no access" — when the schema already supports "omit the key" with the same semantics. Two ways to express the same thing is one too many; consumers can't tell whether the empty list is intentional ("explicitly declared no access for this app") or a stale leftover. Schema should have one shape.

The reference project keeps working because the team has been careful and the deployment has two apps with disjoint role vocabularies. The schema doesn't carry that discipline; the next project that uses this module will not necessarily be as careful.

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
notification_roles:                         # unchanged, app-agnostic
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

### Reserved keys at the `access:` block top level

| Key                   | Status      | Notes                                                                                                                                                                              |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{app_name}`          | per app     | The per-app verb-gate map. Multiple may appear.                                                                                                                                    |
| `notification_roles`  | reserved    | Roles to fan-out notifications to. App-agnostic (matches today). Not validated against any role gate — a notification recipient need not have read access to the action.           |

Any other key at the top of `access:` fails build-time validation. (Today's spec doesn't reserve `notification_roles` cleanly — it's mixed in with app keys and the action-wide `roles:`. This part formalises it.)

## Key decisions

### D1. One shape, not two

The proposal collapses today's two value-shapes (`access.{app}: [verbs]` and `access.{app}: { verb: roles }`) into one. Authors only ever write maps. Trade-off: every action — even the simplest "anyone in the app can view" case — costs more keystrokes than today's `prp-team: [view]`.

We pay that cost on purpose. The Lowdefy idiom across this repo (see CLAUDE.md "One correct way") is to enforce the pattern mechanically rather than rely on each author following a convention. Two valid shapes means consumers and tooling have to handle both, and authors have to choose between them — every code review becomes "should this have been the other shape?" The verbose-canonical-form-only stance shifts the cost from review/tooling time to write time, which is the right trade.

Migration cost is bounded — see "Migration" below. The reference project has 58 action files with `access:` blocks; mechanical translation.

### D2. Per-verb gating is the right granularity

Per-action gating (today) can't express "triage user can reassign but not submit," "only managers can approve," or "support reps can view but never review." Per-field gating (each universal field has its own role list) would be over-engineering — no concrete app has asked for it and the v1 design has consistently rejected per-field role lists. Per-verb is the level that matches the user-facing affordances: the buttons users see are per-verb (`submit_edit`, `approve`, `request_changes`, `resolve_error`); roles should gate those buttons.

### D3. Roles are scoped to apps by construction, not by hygiene

`access.{app_name}.{verb}: [device-manager]` is unambiguous: check against `_user.apps.{app_name}.roles`. There's no global `roles:` field anymore, so there's no temptation to write a role name that has to be interpreted "across apps." If two apps both have a role called `manager`, that's fine — each `access.{app_name}.{verb}` gate only ever reads that app's roles list.

This mirrors how `_user.roles` is already sourced per-app from `user_contacts.apps.{app_name}.roles`. The action's gate now aligns with the source.

### D4. No verb implication

Today `edit` implies `view` and `review` implies `view`. The implication was a convenience under the binary role gate — if you could edit, you could obviously also view, so the spec said so for ergonomics. Under per-verb gates, implication becomes ambiguous: if `edit: [manager]` is the only declared verb, does the action imply `view: true` (anyone, since `view` wasn't constrained) or `view: [manager]` (same as the highest declared verb)? Either choice surprises somebody.

Drop implication entirely. Every verb the action exposes must be declared. Authors writing `edit: [manager]` and wanting "anyone can view" write both:

```yaml
prp-team:
  view: true
  edit: [manager]
```

This is more lines but readable in five seconds. Implicit defaulting is the kind of thing that bites people when they're surprised by it; the cost of the extra line is well-spent.

### D5. Three checkpoints, all per-verb

The current model checks at three points (action-authoring spec § "Where the checks live"); this part keeps all three but switches them to per-verb:

- **Build-time** (`makeActionPages`) — emits a verb page iff the verb key is present in `access.{host_app_name}`. Role gates don't matter at build time (no user to check against); presence of the key alone gates page generation. Unchanged in spirit, but reads the map's keys not a list.
- **Query-time** (`get-entity-workflows`) — for each action visible to the host app, evaluate every declared verb's gate against `_user.apps.{app_name}.roles` and return `visible_verbs: { view: bool, edit: bool, review: bool, error: bool }` on the action payload. The four bools default to `false` for any verb the action doesn't declare. If `visible_verbs.view === false` (and no other verb is true), the action is dropped from the response — that preserves today's "no role intersection → invisible" outcome.
- **Submit-time** (`SubmitWorkflowAction`) — read the interaction's required verb from the table (D6), check `access.{current_app}.{required_verb}` against the user's roles, reject with a structured error if the gate fails. Recheck happens after the engine looks up the action doc, before any writes.

### D6. Interaction → required verb

Already stable in submit-pipeline/spec.md's button table; just spelled out here so the engine check has a single source:

| Interaction       | Required verb |
| ----------------- | ------------- |
| `submit_edit`     | `edit`        |
| `not_required`    | `edit`        |
| `resolve_error`   | `error`       |
| `approve`         | `review`      |
| `request_changes` | `review`      |

`view` has no interaction — it's the read affordance, gated only on read paths. Any future interactions (e.g. `update_metadata` if Part 24 lands one) add a row here.

### D7. Per-verb links on action docs (Part 30 amendment)

[Part 30 § D4](../30-status-map-rendering/design.md) writes one engine-computed `link` per slug per transition. The link is a function of `(kind, stage, slug's access verbs)` — today, "slug's access verbs" is the flat list `access.{slug}`. Under this part's per-verb gating, "slug's verbs" is no longer a per-action property: which verbs a user actually has depends on their roles.

There are two coherent responses:

- **Engine writes per-verb links, UI picks at read time.** `action[slug].links` is a map: `{ view: {pageId, urlQuery}, edit: {pageId, urlQuery}, review: {pageId, urlQuery} | null, error: ... }`. Each entry is the page that verb would land on for the current `(kind, stage)`; entries are `null` when the kind/stage combination has no page for that verb. UI takes the user's `visible_verbs` from `get-entity-workflows` and selects the highest-priority verb's link (`edit` > `review` > `error` > `view`; same priority order as today's "edit beats view" rule).
- **Compute links on read.** Engine writes the rendered cell (`message`, `status_title`) but no link; aggregations or the UI compute the link per user. Drops the render-on-write principle for links specifically and forces every consumer (UI, notifications, audit) to re-implement link selection.

Going with the former. **Engine writes the per-verb link map; UI selects.** Three reasons:

1. Render-on-write stays uniform — `message` and `status_title` are written; the link map joins them. Consumers all read the same doc shape.
2. Selection on read is one local computation: pick the highest verb the user has from a precomputed map. No re-renders, no Mongo joins.
3. Notifications and audit can quote the same link map and apply their own selection logic (e.g. notifications always link to the lowest verb available to the recipient, audit logs all verbs the user could have used).

The action-doc shape becomes:

```js
{
  // existing top-level fields...
  demo: {
    message: 'Install D-42.',
    links: {
      view:   { pageId: 'task-view',   urlQuery: { action_id: 'a3f2-uuid' } },
      edit:   { pageId: 'task-edit',   urlQuery: { action_id: 'a3f2-uuid' } },
      review: null,                    // demo has no review verb declared
      error:  null,
    },
  },
  customer: {
    message: 'Installation pending.',
    links: {
      view: { pageId: 'task-view', urlQuery: { action_id: 'a3f2-uuid' } },
      edit: null,                      // customer doesn't have edit
      review: null,
      error: null,
    },
  },
  status_title: 'Installation pending',
}
```

For each slug, the engine builds the map by iterating the four verbs and asking "if a user had **only** this verb on this slug, where would they usefully go from `(kind, stage)`?" — per-verb-isolated computation, no cross-verb conditionals. Verbs the slug doesn't declare at all in `access.{slug}` get `null`. Verbs where the stage has no meaningful page (e.g. `edit` at `in-review`, `review` outside `in-review`) also get `null`. Per-verb role gates don't enter the engine's link computation — the gates filter which verbs the user is in, which the UI applies on read via `visible_verbs`.

The per-verb table (kind: task; form follows the same shape with form-emitted page IDs `{workflow_type}-{action_type}-{verb}`; tracker links every non-null cell to the child's `workflow-overview`):

| Stage              | `view`      | `edit`      | `review`      | `error`      |
| ------------------ | ----------- | ----------- | ------------- | ------------ |
| `action-required`  | `task-view` | `task-edit` | `null`        | `null`       |
| `in-progress`      | `task-view` | `task-edit` | `null`        | `null`       |
| `changes-required` | `task-view` | `task-edit` | `null`        | `null`       |
| `in-review`        | `task-view` | `null`      | `task-review` | `null`       |
| `done`             | `task-view` | `null`      | `null`        | `null`       |
| `error`            | `task-view` | `null`      | `null`        | `task-error` |
| `blocked`          | `null`      | `null`      | `null`        | `null`       |
| `not-required`     | `null`      | `null`      | `null`        | `null`       |

This **supersedes Part 30 D4's compound-cell table** — that table had cells like "`task-review` if review verb, else `task-view`" which conflated "which verb the user has" with "which page is meaningful at this stage." Per-verb-isolated cells separate the two concerns: each column is independent, and the UI's selection logic (below) handles user verb composition via fall-through.

**UI selection rule.** The UI picks the link to render for a user on the entity-page action card using a static priority over the link map and the user's `visible_verbs`:

```
for verb in [edit, review, error, view]:
  if visible_verbs[verb] && links[verb] != null:
    return links[verb]
return null  // no link affordance for this user at this stage
```

Static priority `edit > review > error > view` composes correctly with the engine's per-verb nulls at every stage — the "most active affordance the user can take" wins, with fall-through to less active verbs when the active ones have null links at this stage (e.g. an editor lands on `task-view` at `in-review` because `links.edit` is null there; a reviewer with edit + review at `in-review` lands on `task-review` for the same reason).

This is a real change to Part 30's D4 table and to the action-doc schema documented there. Part 30 needs to land its amendment as a prerequisite for this part shipping, or the two parts ship together — see "Touches" below.

### D8. `action_role_check` becomes a verb check

[Part 18 § action_role_check](../_completed/18-entity-components/design.md) is a thin client-side component that populates `_state.action_allowed` for use by the page-level submit gate. Under per-verb access, "action allowed" is no longer a single bool — it's per-verb. The component grows to populate `_state.action_allowed: { view: bool, edit: bool, review: bool, error: bool }` (matching `visible_verbs`) and consumers read the specific verb they care about (`_state.action_allowed.edit` on the edit page, `.review` on the review page, etc.).

The check is still defence in depth (server-side query/submit-time checks are the real gate); this just keeps the UI affordances honest.

### D9. `notification_roles` stays put

Two reasons to leave it action-root and app-agnostic:

- It's a fan-out config, not an access decision. The recipients of a notification need not have any access to the action (e.g. notify the team lead even when the action's view gate excludes them).
- Per-app fan-out has not been a real ask in the reference project. The current shape is a flat list, used uniformly. v1.x can scope it per-app if a concrete need surfaces; v1 leaves it alone.

It is **reserved** at the top of `access:` so the validator knows to treat it as not-an-app-key — that's a small documentation tidy rather than a behaviour change.

## Worked examples

### Translated from the reference project

The reference project's three shapes (from the sub-agent survey) translate mechanically.

**Today** — simple verb list, no role gate:

```yaml
access:
  prp-team: [view, edit]
  prp-support: [view]
```

**Under this part**:

```yaml
access:
  prp-team:
    view: true
    edit: true
  prp-support:
    view: true
```

**Today** — verb list with action-wide role gate:

```yaml
access:
  prp-team: [view, review]
  roles: [finance-admin]
```

**Under this part** (action-wide `roles:` becomes per-verb under each app):

```yaml
access:
  prp-team:
    view: [finance-admin]
    review: [finance-admin]
```

**Today** — complex case with `prp-support: []` ceremony and `error` verb:

```yaml
access:
  prp-team: [view, edit, error]
  prp-support: []
  notification_roles: [device-manager, device-team]
  roles: [device-manager, device-team]
```

**Under this part**:

```yaml
access:
  prp-team:
    view: [device-manager, device-team]
    edit: [device-manager, device-team]
    error: [device-manager, device-team]
notification_roles:
  - device-manager
  - device-team
```

The `prp-support: []` line is just gone — omission means the same thing. The action-wide `roles:` folds into each verb under `prp-team` (since `prp-support` no longer appears). `notification_roles` lifts to the action root (it's already there in the reference project; this just removes ambiguity about where it goes).

### A case the old model couldn't express

A form action where viewers are everyone, editors are the assignee's team, and reviewers are managers only — within the same app, same action:

```yaml
type: lead-qualify
kind: form
access:
  prp-team:
    view: true
    edit: [account-manager, account-rep]
    review: [account-manager]
notification_roles:
  - account-manager
```

A `account-rep` user sees the edit page (form), can submit; can't approve. A `account-manager` sees both edit and review pages, can do either. A user with no relevant role sees only the read-only view page.

## Touches

The change is foundational and ripples to several parts. Each ripple is small in isolation; the design lists them so reviewers can see the full surface.

| Where                                                                                                                                            | Edit                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [action-authoring/design.md § Decision 3](../../../workflows-module-concept/action-authoring/design.md)                                          | Rewrite Decision 3 around the new shape: per-app verb map → per-verb role gate, drop the flat `access.roles`. Update the "Composition: verb gate AND role gate" subsection to "per-verb role gate" semantics. Update "Where the checks live."                                                  |
| [action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md)                                                           | Update the reserved-field table for `access:`. Add `notification_roles` as a formally reserved key.                                                                                                                                                                                            |
| [engine/spec.md § Access enforcement](../../../workflows-module-concept/engine/spec.md)                                                          | Submit-time check switches to per-verb; replace the role-intersection check with `(verb-required-by-interaction, app, user-roles)` per D6.                                                                                                                                                      |
| [submit-pipeline/spec.md](../../../workflows-module-concept/submit-pipeline/spec.md)                                                             | Document the interaction → required verb table (D6) explicitly.                                                                                                                                                                                                                                 |
| [Part 4 (workflow config schema)](../_completed/04-workflow-config-schema/design.md) — already completed; treat as historical, amend via note    | Add a "Superseded by Part 34" note pointing here. The resolver-validated shape changes; the closed Part 4 documents the original shape.                                                                                                                                                          |
| [Part 12 (resolver pages)](../_completed/12-resolver-pages/design.md) — already completed; amend via note                                        | `makeActionPages` build-time filter reads the verb keys from the map. Add an amendment note pointing here.                                                                                                                                                                                       |
| [Part 13 (resolver APIs)](../_completed/13-resolver-apis/design.md) — already completed; amend via note                                          | `makeWorkflowApis` validation: `hook.auth.roles ⊇ action.access.roles` rule needs reformulation. Under per-verb gates, the rule becomes: for each interaction the hook handles, `hook.auth.roles ⊇ union(access.{any-app}.{interaction-required-verb})`. Spec the new rule here, amend Part 13. |
| [Part 18 (entity-components) § `action_role_check`](../_completed/18-entity-components/design.md)                                                | `_state.action_allowed` becomes per-verb (D8). Update consumers in Part 16 / 17 / 24 to read the verb-specific bool.                                                                                                                                                                             |
| [Part 30 § D4 (engine-driven links for built-in kinds)](../30-status-map-rendering/design.md)                                                    | Replace `action[slug].link` (single) with `action[slug].links` (per-verb map, D7). Update the data-flow diagram in "Read path" and the worked example. Update the action-doc schema table in "Schema additions."                                                                                |
| [Part 24 (universal-fields)](../24-universal-fields/design.md)                                                                                   | Open question on "who can edit metadata" resolves through this part's per-verb shape (a future `update_metadata` interaction maps to its own required verb if needed). Re-open under Part 24 once this lands.                                                                                  |
| [ui/spec.md](../../../workflows-module-concept/ui/spec.md)                                                                                       | Update the verb table (lines 17-18) and the page-emission rule to read the map's keys. Update `actions-on-entity` rendering to read `visible_verbs` and select per-verb links.                                                                                                                  |
| `get-entity-workflows` aggregation                                                                                                               | Compute `visible_verbs` per action by intersecting `user.apps.{app_name}.roles` against each declared verb's gate. Drop actions with no true verb. (Mongo can do this in-pipeline; precise pipeline shape lands with implementation.)                                                            |

## Migration

The reference project is the only known consumer. Mechanical translation of 58 action files. Three transforms:

1. **Verb list → verb map.** `prp-team: [view, edit]` becomes `prp-team: { view: true, edit: true }`. Repeat per app key.
2. **Action-wide `roles:` folds into per-verb.** Every verb under every app key in the action gets the same role list. Drop the top-level `roles:`.
3. **Drop empty-list entries.** `prp-support: []` lines are removed.

The translation is purely syntactic; semantics are preserved exactly (any user who can do X today still can after migration; no user gains access). A codemod can do all three transforms safely.

After migration, authors who want to take advantage of per-verb gating refine their files by hand — narrowing role lists per verb. That's not part of the migration; it's a per-action authoring choice.

No engine-side data migration. No action-doc backfill (the action doc's `access` is read from config, not denormalised onto the doc).

The link-map shape change (D7) needs Part 30 to either land its amendment as a prerequisite, or ship as part of this part's implementation. Existing action docs written under the old single-`link` shape don't strand because [Part 30 § D12](../30-status-map-rendering/design.md) already accepts no backfill — fresh transitions produce the new shape, and pre-Part-30 docs are non-functional anyway.

## Verification

- **Build-time:**
  - Resolver validates the new shape — verb-key whitelist enforced, role-gate values are `true` or non-empty arrays, empty list / shorthand list / unknown top-level key all rejected with clear messages.
  - `makeActionPages` emits verb pages based on map keys; missing keys → no page.
- **Query-time:**
  - `get-entity-workflows` returns `visible_verbs` per action; users with intersecting roles get `true` on the corresponding verb.
  - Users with no intersecting role on any declared verb drop out of the response.
- **Submit-time:**
  - Engine rejects `submit_edit` when `access.{current_app}.edit` does not intersect user's roles; same for `review` ↔ `approve` / `request_changes`, `error` ↔ `resolve_error`.
- **Link rendering:**
  - Action doc carries `<slug>.links: { view, edit, review, error }` after every transition.
  - UI picks the highest-priority verb the user has access to and renders that link.
- **Demo app:**
  - Demo updates at least one action to use per-verb gating (e.g. one role can `edit`, another can `review`) and the page surfaces respect the gate.
- End-to-end coverage lands in [Part 22](../22-workflows-e2e-suite/design.md).

## Open questions

Points where the design carries a working answer pending further confirmation.

- **Q1. Should `view` default to `true` when other verbs are declared but `view` is omitted? — Resolved.** No defaulting. Every verb declared explicitly; lint-warn (don't hard-error) on `edit` / `review` / `error` declared without `view`. Captured in D4 and in the per-verb shape rules.
- **Q2. Should `edit` (or `review`) implicitly grant `view`? — Working answer pending team review.** No implication: verbs are independent at gate-check time. The same lint warning from Q1 catches the common "I forgot view for my editors" case without baking implicit union into the schema. Author writes the audience for each verb explicitly. Left open in this section so the team can sanity-check before the design ships.
- **Q3. Where should `notification_roles` live? — Open, full concept review pending.** Working answer is *lift to action root* (D9 in the current draft), but the entire `notification_roles` concept is up for reconsideration. Context gathered so far:
  - **Runtime today** (reference project, verified): the action's `notification_roles` is a flat list of role names, app-agnostic. The fan-out machinery is in separate Lambda consumer configs (`lambda/internal/src/notifications/consumeNotifications/config/.../*NotifyRoles.yaml`), each hardcoding an `app_name` and looking up users via `user_contacts.apps.{that-app}.roles`. Multiple consumers can read the same list and fan out to their respective apps/channels. The action declares *who* in role terms; the notification system decides *where* in app/channel terms.
  - **The nesting under `access:` in today's YAML is incidental.** `getActionFields.js:14` reads `config.access?.notification_roles` directly; the nesting carries no semantic meaning. Lifting to root is a one-line code change in that extractor.
  - **Per-app at the action level (`access.{app}.notifications: [...]`) was considered and rejected** — it would push app-scoping into the wrong layer (action-level), break the "one list, multiple consumers" pattern, and force redundant listing when the same role notifies in multiple apps.
  - **Inconsistency to resolve when this lands:** the Schema section's "Reserved keys at the `access:` block top level" table currently lists `notification_roles` as a reserved key *inside* `access:`, while the Worked examples and D9 show it at action root. Fix to whichever placement the team settles on.
- **Q4. Verb priority for UI link selection — Resolved.** Static priority `edit > review > error > view`. Composes correctly with the engine's per-verb null values at every stage via fall-through — no stage-keyed priority table needed. Per-verb null pattern in the engine table (e.g. `edit = null` at `in-review`, `review = null` outside `in-review`) encodes the "which verb is meaningful here" semantics so the static priority always lands the user on the right page. Captured in D7 including the per-verb (kind, stage, verb) → page table and the selection rule.

## Depends on

- **[Part 4 (workflow config schema)](../_completed/04-workflow-config-schema/design.md)** — original access shape; amended by this part.
- **[Part 30 (engine-managed display)](../30-status-map-rendering/design.md)** — link computation table; amended by D7.

## Consumers

- **[Part 12 (resolver pages)](../_completed/12-resolver-pages/design.md)** — build-time verb filter.
- **[Part 13 (resolver APIs)](../_completed/13-resolver-apis/design.md)** — hook auth gate rule.
- **[Part 16 (page-templates)](../_completed/16-page-templates/design.md) / [Part 17 (shared-pages)](../_completed/17-shared-pages/design.md)** — read `_state.action_allowed.{verb}` for the page's verb.
- **[Part 18 (entity-components)](../_completed/18-entity-components/design.md)** — `action_role_check` populates per-verb `_state.action_allowed`.
- **[Part 24 (universal-fields)](../24-universal-fields/design.md)** — write-surface decision depends on this part's shape.
- **`get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview`** — query-time per-verb filter; emit `visible_verbs`.

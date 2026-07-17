# Review 1

## Verified-claim corrections

### 1. Organization ids are not strings — the vendored adapter coerces `organizationId` to ObjectId

> **Resolved (auto).** Verified in the vendored adapter: auth collections store ObjectId/UUID, but `mongodbAdapter.js` serializes ids to strings on read (`toString`/`toHexString`), so `context.user.organizationId` — the value the wall stamps — is the id's string form. Ask 1 rewritten with the precise two-layer statement (`token` mapping requirement stands, for the right reason); Migration step 2 now pins the backfill to the string form.

[upstream-asks.md](../upstream-asks.md) ask 1 states "the engine's organization ids are strings," and hangs the Atlas `token`-mapping requirement on it. The framework's vendored adapter says otherwise: `createConvertWhereClause` coerces id reference fields — including `organizationId` — to `ObjectId` (`lowdefy: packages/plugins/connections/connection-mongodb/src/auth/adapters/mongodbAdapter/createConvertWhereClause.test.js:62-69`), and `createSerializeId.js` stores `ObjectId` by default, `UUID` under `generateId: 'uuid'`, plain strings only under a custom `generateId` function.

This cuts two ways and needs an explicit decision, not a silent assumption:

- **Type of the stamped value.** The wall stamps `context.user.organizationId` as resolved on the caller — a JSON context, so plausibly the _serialized string_ of an ObjectId — while the auth collections store the typed value. If app-data rows get strings while auth rows hold ObjectIds, the wall is self-consistent (it stamps and filters with the same value) but the migration backfill and any future join between app data and auth collections must use the same representation. The design should pin the canonical app-data type (recommendation: whatever `context.user.organizationId` actually serializes to — verify in `resolveAuthentication` — and state it in the migration guide).
- **Atlas mapping guidance changes by type.** `equals` supports objectId and uuid natively and dynamic mapping covers them; only _string_ fields need the explicit `token` mapping. Ask 1's consumer requirement should be stated conditionally on the pinned type rather than asserting strings.

**Fix**: verify the runtime type of `context.user.organizationId` once in the framework, then rewrite the type-dependent sentences in ask 1 and add the type to the Migration section's backfill instruction.

### 2. `returnStoredSource: true` defeats the belt-and-braces `$match` unless the tenant field is a stored field

> **Resolved (auto).** Ask 1's feasibility section gains the second consumer requirement: on walled collections the tenant field must be both `token`-mapped and `storedSource`-included wherever `returnStoredSource` is used, with the silent-blank failure mode named. Kept the belt-and-braces `$match` (documented field beats a weakened second layer).

Verified: `get_all_contacts.yaml` and `get_all_companies.yaml` set `returnStoredSource: true` on their `$search` stage. With stored source returned, post-`$search` stages see only the fields stored in the search index — so ask 1's proposed defense-in-depth `$match` on the tenant field would match _nothing_ unless the tenant field is included in the index's `storedSource`. That is fail-closed (no leak) but silently breaks every list page on a correctly-walled connection — the worst kind of correct.

**Fix**: ask 1 gains a second consumer requirement: on walled collections, Atlas Search indexes must both (a) map the tenant field for `equals` (per finding 1's type) and (b) include it in `storedSource` when `returnStoredSource` is used. Alternatively the injector could skip the post-`$search` `$match` when it has already injected the in-stage filter — but the stored-source requirement is the better trade: keep the second layer, document the field.

## Design gaps

### 3. System-context writes on walled connections are unspecified — and merge-on-signup cannot know its org under `tenant`

> **Resolved.** New Decision 7 states the rule: system-context writes to walled collections carry `tenant: none` plus an explicit `organizationId` with documented provenance (hook payload, triggering record, recipient contact) — a bare `tenant: none` is forbidden in module config. The merge-on-signup relocation (create half moves to an org-knowing binding point, most plausibly `session.create.after`) is recorded as new upstream ask 4 to the user-account design.

The wall fails closed for system-context callers (no caller, no org): hook routines need explicit `tenant: none` sentinels ([mongodb-data-scoping](../../../../lowdefy-design/designs/auth-upgrade/features/mongodb-data-scoping/design.md) Decision 6). Two module write paths run in system context and the design says nothing about either:

- **Merge-on-signup contact mint** ([user-account-better-auth](../../user-account-better-auth/design.md) Decision 7): an `InternalApi` endpoint in system context, bound at `email.verified` / `user.create.before`, that creates a contact. On a walled `user-contacts` connection this fails closed. Worse, under the `tenant` policy the problem is not just mechanism but _information_: at those hook points the signup's organization may not exist yet — it is minted lazily at `session.create` ([user-model](../../../../lowdefy-design/designs/auth-upgrade/concepts/user-model/design.md)) — so there is no org id to stamp even by hand. The invite path is fine (the admin's session carries the org); the open-signup path is not.
- **Notification sends from system routines**: `send-notification.yaml` called from a session-carrying routine stamps correctly, but notifications created by scheduled/hook-driven pipelines run without a caller.

**Fix**: add a decision (or extend upstream ask 2 into a broader coordination item with the sibling designs) specifying the rule for system-context module writes: each such write either (a) moves to a point where a caller org exists (e.g. defer the contact mint to first authenticated session / invitation accept — likely the right answer for merge-on-signup under `tenant`), or (b) carries `tenant: none` plus an explicit, provenance-documented `organizationId`. Enumerate the module surfaces this applies to; "system context" must not become an unaudited hole in the wall.

### 4. Migration ordering is underspecified — walled modules deployed before backfill blank the app

> **Resolved (auto).** Migration section rewritten as four ordered steps (engine upgrade → org seeded → string-form backfill + index rebuild → walled module versions), with the fail-closed rationale stated and a note that the consumer guide must present them as ordered steps.

Decision 5 / the Migration section describe _what_ migrates but not _in what order_. Two ordering hazards:

- A module version whose connections declare `tenant: true`, deployed before the backfill runs, makes every existing document invisible (unstamped rows fail the injected filter) — fail-closed, app-wide, silent.
- The backfill's input (the deployment's org id) only exists after the app has started once on the new auth engine, which auto-seeds the pinned org (`lowdefy: packages/api/src/routes/auth/organizations/ensureOrganization.js`). So the sequence is forced: upgrade engine → org seeded → read org id → backfill → deploy walled module versions.

**Fix**: state this sequence explicitly in the Migration section, and note that the sibling designs' consumer migration guide must present it as ordered steps, not a checklist.

## Consumer contract

### 5. `lookup_collections` substitutions inherit the wall's contract — document it

> **Resolved (auto).** Decision 2 gains a bullet naming the affected vars (`activities.lookup_collections`, `events.actions_collection` / `contacts_collection`), the fail-closed consequence, and the requirement that each var's manifest `description:` carries the note (surfacing in generated `vars.md`).

`modules/activities/module.lowdefy.yaml`'s `lookup_collections` var lets a consuming app substitute the collection name a `$lookup` joins (`modules/activities/requests/stages/lookup_contacts.yaml` et al.). On a walled connection the injector filters those sub-pipelines on the tenant field regardless of the substituted name — so any substituted collection must itself carry `organizationId`, or the join fails closed (empty). Same applies to `events`' `actions_collection` / `contacts_collection` vars.

**Fix**: one sentence in the design's Decision 2 and a note in each affected var's manifest `description:` (surfacing in the generated `vars.md`): "collections substituted here must carry the tenant field on walled deployments."

### 6. `request_stages.filter_match` sits inside `$search` — the wall's authored-field rejection may not see it

> **Resolved (auto).** Folded into upstream ask 1 as a feasibility bullet: the wall's authored-field rejection should scan the rewritten `$search` internals, with the DX-not-security framing preserved.

Verified: the `filter_match` seam appends clauses inside the `$search` compound (e.g. `get_all_contacts.yaml`). The wall rejects authored tenant-field usage in `$match`/filter positions, but its rejection scan (its Decision 2) does not mention `$search` stage internals. A consumer authoring an `equals` on the tenant field inside `$search` cannot _bypass_ the wall (the injected filter still ANDs in — worst case is a baffling empty result), so this is DX, not security: the same "loud error instead of silent no-match" rationale the wall applies to `$match` positions.

**Fix**: fold into upstream ask 1 — when the wall gains its `$search` clause, its authored-field rejection should scan the rewritten `$search` stage too.

# Review 1

Scope: `designs/user-admin-better-auth/design.md`, `upstream-asks.md`, and the `mockups/`. Factual claims were verified against the upstream auth-upgrade designs (`lowdefy-design/designs/auth-upgrade/{admin,user-model,mongodb,hooks,engine}/design.md`) and the current `modules/user-admin` implementation. The design is well-reasoned and the reframe (operator console over per-concern write pathways) is sound; the findings below are mostly about **stale dependency claims** and **one load-bearing architectural assumption** that the upstream designs contradict.

## Blocking / architecture

### 1. The native-read architecture assumes auth collections and `user-contacts` share one database — the mongodb design says they don't

> **Resolved (option a — documented precondition).** Confirmed real against mongodb Decisions 1/2 (adapter takes its own `_secret` URI; `user-contacts` is on the app's connection; nothing enforces co-location) and confirmed the failure is _silent_ (cross-DB `$lookup` returns empty, doesn't error). Chose option (a) over app-layer stitching (b) — (b) abandons the native single-aggregation reads admin Decision 4 charters. Promoted co-location to an explicit precondition in Decision 1: auth adapter + `user-contacts` connection + module read connections all resolve to one database (natural config: one shared `_secret`), which is the mongodb naming rationale's own intended shape. Named the silent-blank-data failure mode. Enforcement: **document only** (user's call) — no clean home for a build/startup check (platform isn't told which connection needs co-location; modules have no startup hook), and the blank-data symptom surfaces immediately in dev/test. Updated the module-surface note (design.md:133) to reference the precondition instead of stating a bare assumption.

The entire read design rests on cross-collection `$lookup` in a single aggregation: the list page joins `user-members` → `users` → `user-contacts` (Decision 1), the workspace joins the same set plus `user-sessions` / `user-accounts` / `user-organizations` (Decisions 5, 6), and the module-surface note (design.md:131) states the assumption outright: _"this assumes the auth collections and `user-contacts` share one MongoDB database (both ride the deployment's `MONGODB_URI`)."_

The upstream mongodb design contradicts this. The BetterAuth adapter is configured with its **own explicit `_secret` URI** — _"No URI inference, no 'default to the app's MongoDB'… The adapter selects the database and nothing more"_ (mongodb Decision 1). And `user-contacts` _"lives on the app's own MongoDB connection… an app collection on an app connection"_ (mongodb Decision 2). Nothing requires the auth database and the app database to be the same cluster/database, and the "no URI inference" language actively cuts against it. `$lookup` cannot cross databases, let alone clusters — if a deployment points the auth adapter at a different database than the app connection, **every list and workspace pipeline in this module fails**.

This is the design's biggest exposure and it is currently an unstated, unverified precondition rather than a decision.

**Fix:** promote it to an explicit decision. Either (a) require that the auth adapter and the `user-contacts` connection resolve to the same database, document it as a hard deployment precondition, and add a startup/build check that fails loudly when they diverge; or (b) if same-database can't be guaranteed, redesign the reads so the cross-source join happens in the request/routine layer (two queries stitched in app code) rather than in `$lookup`. Option (a) is simpler and matches the "one correct way" principle, but it must be stated and enforced, not assumed. Raise it as a new upstream ask if the platform needs to guarantee co-location under `pinned`.

### 2. Impersonation is dead-on-arrival (upstream ask 3 is genuinely unresolved) yet the design commits a var and Security-tile surface

> **Resolved (kept — gap closed upstream).** Confirmed the dead-on-arrival gap is real. Rather than cut the feature, the resolution closes the gap: the engine gains a **user-admin role** config option (user's decision, to implement upstream), and grants that role a **curated** admin-plugin scope set — only what the module's client actions need (`user: [impersonate]` today), not the full admin statement set (which would re-open the identity mutations admin Decision 1 withheld and bypass the step/audit pathways). So impersonation is no longer speculative surface — it's a real capability gated by the `impersonation` var (UI) plus the engine's user-admin-role AC (the check), aligned on the same administering role as Decision 3. Updated Decision 5's impersonation bullet, ask 3 (now "open, resolution chosen" with the curated-scope caveat), and the design.md upstream-asks item 3. Engine implementation is the user's to carry.

Decision 5 ships an `impersonation` var and the "View as user" action in the Security tile. Ask 3 itself concedes that as specified _"it appears no caller can ever satisfy the impersonate check, making the action dead on arrival"_ — the admin plugin checks a **user-level** role (`adminRoles`/`adminUserIds`), but the user-model puts all roles on `member.role` and registers custom catalog roles with empty statements. My verification of `engine/design.md` confirms it treats `ImpersonateUser` only as a client action and **does not adjudicate the access-control question at all** — there is no mechanism defined anywhere upstream for a caller to satisfy the impersonate check, and no "permissions milestone" is described in the engine design.

So this design commits UI + a var for a capability that cannot function until an unresolved upstream decision lands, and that decision might resolve to "defer impersonation to the permissions milestone" — in which case the module ships dead surface. This is exactly the speculative-surface trap CLAUDE.md warns against ("build for concrete needs, not speculation").

**Fix:** cut impersonation from this design's committed scope and list it as deferred-pending-ask-3. If it stays, state explicitly that the var and Security-tile action are **not implemented** until ask 3 resolves, so the implementation task doesn't build UI against a check nothing can pass.

## Stale dependency claims

### 3. Upstream asks 2, 4, and 5 are already satisfied by the current auth-upgrade designs — `upstream-asks.md` overstates the open dependencies

> **Resolved.** Verified against the current auth-upgrade designs: asks 2 (admin Decision 1), 4 (admin Decision 5), 5 (mongodb Decision 5), and both halves of ask 1 (step default in admin; `_organization` operator in engine) are all delivered upstream. Rewrote `upstream-asks.md`: new status header, per-ask **Resolved**/**Open** notes with citations (original ask text kept for history), only asks 3 and 6 flagged open. Softened design.md — ask 4's "hard dependency" line (design.md:106) now reads "already delivered," and the Upstream-asks section reframed from "six blockers to resolve" to "four resolved, two open with workable fallbacks." Config-read half of ask 1 covered by finding #4.

`upstream-asks.md` frames six asks as things "to be resolved… before implementation," including two labelled **hard dependencies**. Verification against the current upstream designs shows most are already addressed:

- **Ask 4 (member attributes on invitations) — already resolved, not open.** The design calls this _"a dependency, not a nice-to-have"_ (design.md:106) and ask 4 says _"nothing in the current design carries attributes from invite to member."_ But admin **Decision 5** already states: _"Member attributes ride the invitation. `InviteMember` accepts an optional `attributes` object, stored on the `invitation` row via `invitation.additionalFields.attributes`… The same `afterAcceptInvitation` hook copies `invitation.attributes` onto the minted member row."_ The `hooks` engine hook catalog independently confirms the accept-time copy. **The hard dependency is already delivered upstream** — ask 4 should be marked resolved, and the design's "authorization hole" framing removed.
- **Ask 2 (admin identity-field stance) — already explicit upstream.** Admin Decision 1 states _"The catalog deliberately ships no `SetUserEmail` / `SetUserName` / `SetUserPassword`… This is a decision, not an accident of the catalog,"_ and Non-goals repeats it. The "make the stance explicit" ask is satisfied.
- **Ask 5 (attributes as native BSON) — resolved upstream.** The mongodb design's open question is struck through and marked _"Resolved: native sub-documents"_ (a `supportsJSON` adapter patch on the fork; PR not yet opened). The design's native attribute reads are safe on the settled shape; ask 5 is done bar the PR.
- **Ask 1 (pinned-org defaulting) — steps half already resolved.** Admin Decision states _"`organizationId` defaults to the pinned org… omitting it resolves to the deployment's pinned organization"_ (explicit id still wins; `tenant` policy + omitted id is a runtime error). The step-side of ask 1 is delivered.

**Fix:** rewrite `upstream-asks.md` against the current upstream designs. This is not cosmetic — it changes the design's implementability posture materially (it is far less blocked than it claims). The genuinely-open items are asks 3 and 6, plus the config-read half of ask 1 (see #4).

### 4. The genuinely-remaining dependency in ask 1 is the config-side pinned-org-id read — confirm it against config-schema

> **Resolved.** Confirmed present, not open: the engine adds a server-side **`_organization`** operator (`_organization: id` / `slug` / `name`, registered in `@lowdefy/operators-js`), described in engine's _The resolved pinned organization_ as "what lets a native aggregation `$match` on `user-members.organizationId` without a hand-copied var" (errors under `tenant` policy, mirroring the step behaviour). So ask 1's config-read half is delivered; the module needs **no `org` var**. Recorded in Decision 1 with the mechanism and a "why not the tenant wall" rejection (the wall's recursive `$lookup` injection fails closed against the non-org-scoped joined collections, and Decisions 4/6 need deliberate cross-org reads the wall forbids — verified with the user).

Ask 1 part 2 is the real open piece: the native `$match` on `user-members.organizationId` needs the **resolved pinned org id** available in config (an operator or `_app`-style metadata), and a `$match` stage is not a step so it gets no default. The step-side default (part 1) is resolved (#3), but this part lands in `config-schema`/`engine`, which I did not verify. Until an operator/metadata exposes the resolved pinned org id, the fallback `org` var is unavoidable — and every native read depends on it.

**Fix:** verify `config-schema`/`engine` provides a read for the resolved pinned org id and cite it; if absent, this is the one org-related ask that must still be pushed upstream. Don't leave it folded into a "resolved" ask 1.

### 5. Ask 6 (module-exported hook bindings) is correctly open — but confirm the fallback is the assumed default

> **Resolved (by removing the dependency).** Rather than choosing between the build-wired binding and the hand-written fallback, the design drops the apparatus entirely: the invite email now rides BetterAuth's unified **`auth.email`** send path (same as verification / password-reset), so the module ships no `send-invitation-email` endpoint, no `auth.hooks` binding, and no `notifications` dependency. Routing invites through notifications was the NextAuth-era workaround (no native invitation flow, unauthenticated-user special-casing) — both now provided by BetterAuth. This moots upstream ask 6 (marked Dropped). Reworked Decision 7, Decision 8 dependencies, the module-surface APIs row, and the upstream-asks section/doc. Deferred: when the Lowdefy email redesign lands, reassess whether auth emails route through it (user's call). A branded invite email stays available as an app-level `invitation.send` opt-in the module doesn't bundle.

Verification confirms ask 6 is a genuine gap: the `hooks` design establishes that a module _bundles_ the `invitation.send` endpoint and its binding (_"the auth module bundles the endpoint and the `auth.hooks` binding"_), and merge-on-signup ships that way — **but there is no manifest mechanism specified for a module to contribute an `auth.hooks` entry**; `auth.hooks` is plain app-root config validated at build. The design's fallback (app hand-writes the binding with the scoped endpoint id) is real and workable. This ask is characterized correctly; just make sure the design's implementation plan treats the **fallback as the baseline** (since ask 6 may not land) rather than assuming the build-wired path.

## Factual / traceability

### 6. `user.banned` field name and shape are not defined upstream — status derivation depends on reading it natively

> **Resolved.** Confirmed the exact shape against `better-auth@1.6.23` (admin plugin `schema.mjs`): `user.banned` (boolean, default `false`), `user.banReason` (string), `user.banExpires` (date). Also confirmed BetterAuth enforces bans lazily in `session.create.before` — a lapsed timed ban is auto-cleared only at the banned user's _next sign-in_, so the DB can hold `banned: true` for an already-expired ban. That would matter _if_ the module created timed bans — but per the user it does not: the module issues **permanent bans only** (never passes a duration), so `banExpires` is never set. Recorded that as a deliberate scope choice — added a Non-goal (timed/expiring bans), noted permanent-only in Decision 4, and baked the confirmed field shape + the simple `banned === true` rule (no `banExpires` check) into Decision 2's status derivation.

Decision 2's status derivation reads the ban state natively: _"member row + `user.banned` → Suspended,"_ and the workspace/list pipelines and the export all branch on it. But the user-model design references only _BetterAuth's native ban_ capability — it never documents a `banned` boolean field name or its companions (`banReason`, `banExpires`). BetterAuth's admin plugin does persist a `banned` field, so the assumption is probably correct, but a native read cannot be written against an unconfirmed field name, and `banExpires` matters for whether a ban is currently in force.

**Fix (resolve now, per CLAUDE.md):** confirm the exact fields the admin plugin's Mongo adapter persists on the `users` row (`banned`, `banReason`, `banExpires`) and bake the confirmed shape into the design's status-derivation rule — including whether Suspended must also check `banExpires > now` rather than just `banned === true`.

### 7. Decision-number misattributions to the upstream designs

> **Resolved (auto).** Fixed `upstream-asks.md:28` — the no-mirroring / display-prefers-contact consequence is in admin **Decision 1** ("Login-identity fields are not admin-mutable"), not Decision 6 ("The module contract"); reference corrected. Verified the other two sub-points against upstream: design.md's "admin Decision 4" references (lines 26, 115) correctly map to "Steps for writes, connections for reads" — no change; the mongodb Decision 4 = "Soft delete" note is a forward caution only.

Downstream skills and implementers follow these cross-references, so wrong numbers cost time:

- `upstream-asks.md:28` cites _"admin Decision 6 territory"_ for the no-mirroring / display-prefers-contact consequence. That content is in admin **Decision 1**; admin Decision 6 is "The module contract." Fix the reference.
- design.md's native-reads references to _"admin Decision 4"_ (lines 26, 115) are **correct** (admin Decision 4 = "Steps for writes, connections for reads") — noted here only to confirm they check out.
- Note that mongodb Decision 4 is "Soft delete," and the native-reads charter is **admin** Decision 4, not a mongodb decision — if any future edit attributes native reads to "mongodb Decision 4," that would be wrong.

## Design concerns

### 8. The search downgrade rests on an unbounded "small enough" assumption and loses index usage

> **Resolved.** Valid — but investigating it surfaced that the review's own suggested mitigations don't hold in the split model, and neither does the design's original seam framing. Key fact: Atlas `$search` must be the pipeline's **first stage** over one collection, so it cannot run after `$lookup` (the old module got away with it only because everything was one fused `user_contacts` doc). In the split model the searchable fields (name on `user-contacts`, email on `users`, roles on `user-members`) only coexist post-`$lookup`, where `$search` can't go — so regex `$match` is actually the _only_ approach that spans the join, at the cost of a linear scan. Resolution: (1) stated the explicit bound — **low thousands of members** (user confirmed that's the scope) — replacing "small enough"; (2) corrected the escape hatch — the large-org path is a pipeline restructure (Atlas `$search` over a _joined view_, or denormalized search fields), a documented future option, **not** the `filter_match` seam (which is post-lookup, where `$search` is invalid); (3) removed the incorrect "filter_match reintroduces Atlas Search" framing here and in Decision 2. Pre-`$lookup` index optimization rejected: substring regex won't use a btree index anyway, and name/email live on different collections so you can't root-optimize both.

Decision 2 drops Atlas `$search` for plain regex `$match`, justified by _"A pinned org's member list is small enough that regex over a `$lookup`-joined pipeline is fine."_ Two problems: (a) "small enough" has no stated bound — a pinned org can plausibly hold thousands of members, and the design offers no ceiling; (b) the filter regexes hit fields **after** `$lookup` (`contact.name`, `user.email`, member roles), which cannot use indexes — each keystroke scans the org's full member set and joins per row. Against Atlas Search this is a real regression, not just a simplification, and it interacts with #1 (the joins have to work at all first).

**Fix:** state the member-count bound the assumption relies on, and where possible push filterable predicates onto indexed fields _before_ the `$lookup` (e.g. match `user.email` on the `users` collection first, then join). If large pinned orgs are in scope, keep an optional extension seam for a search stage rather than hard-removing the capability.

### 9. `suspension` defaults `true` — a suite-wide destructive capability on by default violates least-privilege

Decision 4 is admirably honest that suspend (`BanUser`) _"applies across every app in the suite — the one place the module's authority exceeds its app scope,"_ then defaults the gating `suspension` var to `true`. That means any deployment adding `user-admin` without reading the docs hands every app-admin the ability to ban a login across the entire suite. Least-privilege argues the safer default is `false` (a deployment opts _in_ to suite-wide authority). The "trusted operator group" rationale is legitimate, but it's a per-deployment trust assumption being encoded as the default for everyone.

**Fix:** reconsider defaulting to `false`, or at minimum strengthen the justification for why suite-wide destructive authority should be the zero-config default rather than opt-in. This pairs with #11.

### 10. Two sources of truth for the role set — the `roles` display var can drift from the compiled catalog

Decision 8 keeps the `roles` var (author-supplied `[{label, value}]`) required for display, while stating validity is now core-owned (_"the build validates catalog roles and the steps reject unregistered names"_). But the display var and the compiled catalog are **separate** sources: if the author lists a role the catalog lacks, the UI offers a role the steps will reject at write time (a late, confusing failure); if the author omits a catalog role, it silently can't be assigned. "A typo fails loudly at both layers" addresses typos, not var-vs-catalog drift.

**Fix:** derive the assignable role set from the compiled catalog (the `roles` var becoming label/display metadata keyed by catalog value), or add a build-time check that the `roles` var's values are exactly the catalog's registered roles. This is the "one correct way" principle applied to the role list.

### 11. Cross-app disclosure (Decision 6) bakes in a trust precondition with no opt-out

The no-var cross-app badges (workspace) and the ban dialog's enumeration of other memberships (Decision 4) both disclose, to any app's admin, which other apps a person belongs to — justified as _"the suite's admins are one trusted operator group."_ Under `pinned`, different apps are different orgs that may be administered by **different teams**; if a suite hosts apps with distinct admin populations, this leaks membership across a trust boundary with no way to turn it off. The "No var: uniform behaviour" choice is reasonable _if_ the single-trusted-operator-group premise always holds — but that premise is a deployment property, not a given.

**Fix:** state the "one trusted operator group across the suite" premise as an explicit deployment precondition of this module, so consumers who don't satisfy it know not to use the cross-app surfaces. Reconsider (lightly) whether the ban-dialog enumeration and badges warrant a shared gate — they rise and fall together, so one var could cover both. (Weigh against CLAUDE.md's "don't add vars on a guess"; the point is to surface the precondition, not necessarily to add the knob.)

### 12. Partial-failure semantics within the multi-step routines are undefined

Decision 3's per-section routines are the right call, but two of them chain multiple writes with no stated failure semantics:

- **Access save** = `UpdateMemberRoles` + `UpdateMemberAttributes`. If roles commit and attributes fail, the member is left half-updated with a misleading "roles changed" event and no "attributes" event.
- **Invite submit** = create-or-link `contact` (normal request) → `InviteMember` → audit event. If `InviteMember` fails after the contact is created for an **unknown** email, an orphan contact is left behind (recoverable — the next check resolves it to "existing contact, no membership" — but undocumented).

**Fix:** specify each multi-step routine's ordering, idempotency, and what state a partial failure leaves, and confirm the events reflect only what actually committed. Even "these partial states are accepted and here's why they're recoverable" is enough — but it should be written down, since crisp audit events were a stated benefit of this decomposition.

### 13. Role-filter matching must occur on the split array, not the raw CSV

> **Resolved.** Valid trap (a substring `/admin/` over the CSV matches `super-admin`). Added a sentence to Decision 1, next to the existing `$split` rule: the role filter matches exact elements of the post-`$split` array (`$in` / equality), never substring/regex on the CSV — explicitly contrasted with the free-text name/email filters, which are regex by design.

Decision 1 correctly notes `member.role` is a CSV string and _"every pipeline… splits the string itself (`$split`)."_ One concrete trap to call out for the filter path: filtering by role must match on the **split array elements** (exact match), not regex/substring on the CSV — otherwise a filter for `admin` matches `super-admin`, and a filter for `editor` matches `content-editor`. Low effort, easy to get wrong at implementation time.

**Fix:** note in Decision 1/2 that the role filter applies `$in` (or equality) against the post-`$split` array, never a substring/regex on the CSV.

## Minor

### 14. `all.html` mockup renders both tables stacked, which reads against the tabs decision

Decision 2 and the module surface commit to **tabs** (Members / Invitations) on the `all` page, and the open question is only tabs-vs-separate-page. But `mockups/screens/all.html` renders the Members table _and_ an "Invitations tab" section stacked below it on one screen (lines 118–162), which, taken literally, is neither tabs nor a separate page. It's clearly an illustrative "show both" mockup, but since the open question is explicitly about this presentation, align the mockup with the current lean (or annotate it as showing both states) so it isn't mistaken for the intended layout.
</content>
</invoke>

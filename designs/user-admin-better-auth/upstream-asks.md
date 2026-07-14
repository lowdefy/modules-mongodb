# User Admin — Upstream Asks

Platform-side changes the [user-admin design](design.md) depends on. Each ask names the design it lands in, why the module needs it, and its status.

**Status (verified against the current auth-upgrade designs):** asks **1, 2, 3, 4, and 5 are resolved upstream**, and **ask 6 is dropped** — the invite email now rides `auth.email` (design Decision 7), so there is no binding to wire. Ask **3** (impersonation access control) is now **resolved in design** — the engine design's _The user-admin role_ section adds an `auth.userAdminRole` config key that gates the whole user-administration surface (every auth admin step plus the impersonation client action), implemented in phase 9. Impersonation stays in the design behind its var, now backed by a working capability. Each ask below carries a **Resolved** / **Dropped** note with the upstream citation; the original ask text is kept underneath for history.

---

## 1. Pinned-org defaulting for steps and config — RESOLVED

> **Resolved upstream (both parts).** _Steps:_ admin design — "`organizationId` defaults to the pinned org… omitting it resolves to the deployment's pinned organization" (explicit id wins; `tenant` + omitted id is a runtime error). _Config read:_ the engine adds a server-side **`_organization`** operator (`_organization: id` / `slug` / `name`, registered in `@lowdefy/operators-js`) — "what lets a native aggregation `$match` on `user-members.organizationId` without a hand-copied var" (engine, _The resolved pinned organization_). The module carries **no `org` var**; native reads use `_organization: id`. The fallback below is not needed.

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) (step properties), [config-schema](../../../lowdefy-design/designs/auth-upgrade/config-schema/design.md) / [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (config-side resolution).

**Problem**: Every org-scoped step (`InviteMember`, `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember`, `CancelInvitation`, `ListMembers`) takes an `organizationId`. Under `pinned` policy the deployment already declares its org (`auth.organizations.org`, resolved at startup by ensure-by-slug). Without a default, a user-admin module must carry an `org` var that re-states that slug — duplicated config that can silently drift from `auth.organizations.org`, the same failure class as today's `app_name` var.

**Ask** (two parts):

1. **Steps**: when `organizationId` is omitted, a step resolves it to the deployment's pinned org. Explicit `organizationId` still wins — that is what a future multi-tenant admin module passes. Behaviour when the policy is `tenant` and `organizationId` is omitted needs defining (error is fine — there is no single implied org).
2. **Config reads**: the module's native aggregations `$match` on `user-members.organizationId`, and a `$match` stage is not a step — it gets no default. Config needs a way to read the resolved pinned org id (an operator or `_app`-style metadata). Startup resolves slug → id, so this is exposing an already-known value, not a new lookup.

**Fallback if declined**: an `org` slug var on the module. Workable, but the ask removes a misconfiguration surface for every module instance forever.

## 2. Admin identity-field mutation — RESOLVED

> **Resolved upstream.** admin Decision 1 ("Login-identity fields are not admin-mutable") states the catalog ships no `SetUserEmail` / `SetUserName` / `SetUserPassword` and "This is a decision, not an accident of the catalog"; Non-goals repeats it. The stance — contact fields are freely editable CRM data, `user.email`/`user.name` stay as auth flows set them, a wrong invite email is cancel + re-invite — is explicit.

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) (step catalog / non-goals).

**Problem**: The catalog has no `SetUserEmail` / `SetUserName` / `SetUserPassword` steps, although BetterAuth's admin statements include `set-email` / `set-password`. Today this reads as an accident of the catalog rather than a decision. The old module let an admin edit the email on the fused record; module authors will ask where that went.

**Ask**: Record the decision explicitly: **admins cannot mutate login-identity fields in the experimental version.** Contact email/name are CRM data, freely editable through normal requests; `user.email` / `user.name` stay as the auth flows set them; a wrong invite email is fixed by cancel + re-invite (the invitation is the only pre-accept artifact). If a concrete need for admin email change appears later, it enters the catalog as a designed step with verification semantics — not a module workaround.

Note the related module consequence (admin Decision 1 territory): with no mirroring and no identity steps, a profile edit updates `contact` only — `user.name` drift from `contact` name is accepted and display should prefer the contact where the module controls it.

## 3. Impersonation access control under the new role model — RESOLVED

> **Resolved upstream.** Landed in the engine design's _Capabilities wired at startup → The user-admin role_ section (implemented in phase 9). The auth config takes an **`auth.userAdminRole`** key naming the member role that administers users — one role that gates the **whole user-administration surface**, not just impersonation:
>
> - **Every auth admin step** (`InviteMember`, `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember`, `CancelInvitation`, `ListMembers`, `UpdateUserProfile`) mechanically checks that the resolved caller holds the configured role — an engine-enforced floor, with the module's endpoint role gates composing on top (defense in depth). System contexts (hooks) are exempt; `UpdateUserProfile` allows self-targeting without the role; an unconfigured key makes the admin steps refuse user-initiated calls.
> - **Impersonation** is the client-action case that needed a bridge: it is governed by BetterAuth's own user-level admin-plugin check (`user.role`, never `member.role`), so the engine maintains `user.role` as an **internal denormalization** — synced at `UpdateMemberRoles`, invitation accept, and `RemoveMember`, never an authoring surface — and registers a **custom admin-plugin access control** granting the role exactly `user: ['impersonate']`: curated, not the full admin statement set, so identity-mutation endpoints stay unreachable (admin Decision 1) and `impersonate-admins` is excluded so a user-admin cannot impersonate another user-admin.
>
> Pinned policy only. One role means "who administers users" is a single concept, aligned with the module's admin-roles var (design Decision 3). The module keeps the `impersonation` var (Decision 5) gating the UI; with this in place a caller holding the user-admin role passes the check. See design finding #2.

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (startup capabilities / admin plugin wiring), touching [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) Decision 1's client-action paragraph.

**Problem**: `ImpersonateUser` is a client action against the mounted `/api/auth/*` admin endpoint, governed by **BetterAuth's own admin-plugin access control** (`user: [impersonate]`), not by a Lowdefy endpoint role gate. The admin plugin checks the caller's _user-level_ role (`adminRoles` / `adminUserIds`) — but the user-model removes user-level roles entirely (roles live on `member.role`, and custom catalog roles register with **empty** statements). As specified, it appears **no caller can ever satisfy the impersonate check**, making the action dead on arrival.

**Ask** (chosen resolution): the auth config takes a **user-admin role** option; the engine maps a **curated set of admin-plugin scopes to that one role** and enforces the check against a caller holding it.

- **Curated, not "all admin scopes."** Grant only the scopes the module's client actions use — `user: [impersonate]` today. Granting the full admin statement set (`set-password` / `set-email` / `ban` / `delete`) would let a holder call those `/api/auth/admin/*` endpoints directly, bypassing the module's role-gated, audited step pathways (admin Decision 2) and **re-opening the identity mutations admin Decision 1 deliberately withheld**. New client actions the module adopts later extend the curated set deliberately, one scope at a time.
- **Alignment.** The role the engine keys on should be consistent with the module's admin-roles var (design Decision 3, which gates the routine endpoints) so "who administers users" is one concept, not two that can drift. A single role keeps it simple; widen to a list only if a concrete need appears.
- The module gates its UI behind the `impersonation` var either way; with this in place the var is no longer dead — a caller holding the user-admin role passes BetterAuth's check.

## 4. Member attributes on invitations, applied at accept — RESOLVED

> **Resolved upstream.** admin Decision 5 — "Member attributes ride the invitation. `InviteMember` accepts an optional `attributes` object, stored on the `invitation` row via `invitation.additionalFields.attributes`… The same `afterAcceptInvitation` hook copies `invitation.attributes` onto the minted member row." The accept-time copy and resend-refresh semantics are all specified. The "authorization hole" this ask named is closed; the design's "hard dependency" framing (design.md:106) is softened accordingly.

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) Decision 5 (invitation orchestration), with the hook point in [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md) if the application is bindable rather than engine-tier.

**Problem**: `member.attributes` carries authorization parameters (authorised branches, departments) a user must hold **from their first session** — today's invite form sets `app_attributes` up front. The new invitation flow creates the member row at accept, and nothing in the current design carries attributes from invite to member: `InviteMember` wraps `inviteMember` (role + email + the platform's `contactId` additionalField), and the only accept-time binding is the engine's `contactId` stamp. Without this, an invited user's first sessions run with empty attributes until an admin edits them — an authorization hole the module cannot close from its side.

**Ask**: Extend the invitation orchestration:

1. `InviteMember` accepts an optional `attributes` property, stored on the invitation via `invitation.additionalFields` (same mechanism as `contactId`).
2. The accept path applies them to the minted member row. The natural home is the same engine-bound `afterAcceptInvitation` hook that stamps `contactId` — it already receives `{ invitation, member, user, organization }`, so the extension is "also copy `invitation.attributes` onto the member" (an adapter-layer member update or `UpdateMemberAttributes`-equivalent write, same authority as the stamp).
3. Resend semantics: `InviteMember` with `resend: true` should be able to refresh the stored attributes (an invite correction is cancel/re-invite or resend — either path must not preserve stale attributes silently).

## 5. Attributes stored as native BSON — RESOLVED

> **Resolved upstream.** mongodb Decision 5 and its open question are settled: "Resolved: native sub-documents, via a vendored adapter." Mechanism (revised in phase 8): the adapter is **vendored** into `@lowdefy/connection-mongodb` with `supportsJSON: true` plus a legacy string-parse on read. The earlier pnpm-patch on `@better-auth/mongo-adapter` was abandoned because `patchedDependencies` does not ship in the published `@lowdefy/server` tarball — consumer installs would get the unpatched adapter and silently fall back to string storage. The upstream PR to the fork (`feat/mongo-adapter-supports-json`) is now optional goodwill, not a release dependency. The module's native attribute reads are safe on the settled sub-document shape.

**Lands in**: [mongodb](../../../lowdefy-design/designs/auth-upgrade/mongodb/design.md) Decision 5 / its open question.

At 1.6.23 the Mongo adapter stringifies `json` additionalFields, which would break this module's native reads: list filtering on attribute contents (`fields.member_attributes`-driven filters), attribute columns in the export, and attribute display joins. Already being resolved upstream — the user-admin design assumes sub-document storage; recorded here so the dependency is visible and the migration codemod matches the settled shape.

## 6. Module-exported `auth.hooks` bindings — DROPPED

> **Dropped (no longer needed).** The module no longer ships the `invitation.send` dispatch endpoint: the invite email is sent by BetterAuth through `auth.email`, the same unified send path as verification and password-reset emails (design Decision 7). With no module-shipped hook endpoint, there is no `auth.hooks` binding to export or hand-write, so this ask falls away entirely. It may resurface if the Lowdefy email redesign reintroduces a module-shipped dispatch endpoint. The gap it named is still real (there is no manifest mechanism for a module to contribute an `auth.hooks` entry) — just not one this module needs. See design finding #5.

**Lands in**: [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md) (binding model / build plumbing), touching the module-system build where scoped ids resolve.

**Problem**: `auth.hooks` is app-root config — `{ id, point, endpointId }` entries the app hand-writes. The module ships the `invitation.send` dispatch endpoint (`send-invitation-email`), but endpoint ids are scoped with the module entry id at build time, so the app must hand-write the binding with the _scoped_ id (`{entry}-send-invitation-email`) — fragile duplicated wiring, the same failure class ask 1 removes for the org id. The hooks design already anticipates a module "bundling the endpoint and the `auth.hooks` binding" (merge-on-signup ships exactly that way), but the module manifest has no surface to export a binding.

**Ask**: let a module manifest declare hook bindings for `InternalApi` endpoints it ships (e.g. `hooks: [{ point: invitation.send, endpoint: send-invitation-email }]`); the build resolves the scoped endpoint id and contributes the `auth.hooks` entry, subject to the existing one-binding-per-point validation. A module binding colliding with an app binding on the same point should be a build error (the hooks design's build-enforced uniqueness extends naturally).

**Fallback if declined**: a documented consumer setup step — the app hand-writes the `auth.hooks` entry with the module-scoped endpoint id.

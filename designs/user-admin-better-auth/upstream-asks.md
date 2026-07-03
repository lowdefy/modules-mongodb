# User Admin — Upstream Asks

Platform-side changes the [user-admin design](design.md) depends on, to be resolved in the **auth-upgrade designs** (`lowdefy-design/designs/auth-upgrade/`). Each ask names the design it lands in, why the module needs it, and a proposed resolution. Asks 1 and 4 are hard dependencies; 2 and 3 are decisions to make explicit; 5 is already in flight; 6 removes a hand-wiring step (workable fallback if declined).

---

## 1. Pinned-org defaulting for steps and config (hard dependency)

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) (step properties), [config-schema](../../../lowdefy-design/designs/auth-upgrade/config-schema/design.md) / [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (config-side resolution).

**Problem**: Every org-scoped step (`InviteMember`, `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember`, `CancelInvitation`, `ListMembers`) takes an `organizationId`. Under `pinned` policy the deployment already declares its org (`auth.organizations.org`, resolved at startup by ensure-by-slug). Without a default, a user-admin module must carry an `org` var that re-states that slug — duplicated config that can silently drift from `auth.organizations.org`, the same failure class as today's `app_name` var.

**Ask** (two parts):

1. **Steps**: when `organizationId` is omitted, a step resolves it to the deployment's pinned org. Explicit `organizationId` still wins — that is what a future multi-tenant admin module passes. Behaviour when the policy is `tenant` and `organizationId` is omitted needs defining (error is fine — there is no single implied org).
2. **Config reads**: the module's native aggregations `$match` on `user-members.organizationId`, and a `$match` stage is not a step — it gets no default. Config needs a way to read the resolved pinned org id (an operator or `_app`-style metadata). Startup resolves slug → id, so this is exposing an already-known value, not a new lookup.

**Fallback if declined**: an `org` slug var on the module. Workable, but the ask removes a misconfiguration surface for every module instance forever.

## 2. Admin identity-field mutation — make the stance explicit

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) (step catalog / non-goals).

**Problem**: The catalog has no `SetUserEmail` / `SetUserName` / `SetUserPassword` steps, although BetterAuth's admin statements include `set-email` / `set-password`. Today this reads as an accident of the catalog rather than a decision. The old module let an admin edit the email on the fused record; module authors will ask where that went.

**Ask**: Record the decision explicitly: **admins cannot mutate login-identity fields in the experimental version.** Contact email/name are CRM data, freely editable through normal requests; `user.email` / `user.name` stay as the auth flows set them; a wrong invite email is fixed by cancel + re-invite (the invitation is the only pre-accept artifact). If a concrete need for admin email change appears later, it enters the catalog as a designed step with verification semantics — not a module workaround.

Note the related module consequence (admin Decision 6 territory): with no mirroring and no identity steps, a profile edit updates `contact` only — `user.name` drift from `contact` name is accepted and display should prefer the contact where the module controls it.

## 3. Impersonation access control under the new role model

**Lands in**: [engine](../../../lowdefy-design/designs/auth-upgrade/engine/design.md) (startup capabilities / admin plugin wiring), touching [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) Decision 1's client-action paragraph.

**Problem**: `ImpersonateUser` is a client action against the mounted `/api/auth/*` admin endpoint, governed by **BetterAuth's own admin-plugin access control** (`user: [impersonate]`), not by a Lowdefy endpoint role gate. The admin plugin checks the caller's _user-level_ role (`adminRoles` / `adminUserIds`) — but the user-model removes user-level roles entirely (roles live on `member.role`, and custom catalog roles register with **empty** statements). As specified, it appears **no caller can ever satisfy the impersonate check**, making the action dead on arrival.

**Ask**: Define how a deployment grants impersonation. Options to evaluate upstream: engine config mapping designated catalog roles into the admin plugin's AC with real `user: [impersonate]` statements (a narrow, deliberate exception to "empty statements until the permissions milestone"); or `adminUserIds`; or deferring impersonation to the permissions milestone and saying so. The module gates its UI behind an `impersonation` var either way, but the var is useless until some caller passes BetterAuth's check.

## 4. Member attributes on invitations, applied at accept (hard dependency)

**Lands in**: [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) Decision 5 (invitation orchestration), with the hook point in [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md) if the application is bindable rather than engine-tier.

**Problem**: `member.attributes` carries authorization parameters (authorised branches, departments) a user must hold **from their first session** — today's invite form sets `app_attributes` up front. The new invitation flow creates the member row at accept, and nothing in the current design carries attributes from invite to member: `InviteMember` wraps `inviteMember` (role + email + the platform's `contactId` additionalField), and the only accept-time binding is the engine's `contactId` stamp. Without this, an invited user's first sessions run with empty attributes until an admin edits them — an authorization hole the module cannot close from its side.

**Ask**: Extend the invitation orchestration:

1. `InviteMember` accepts an optional `attributes` property, stored on the invitation via `invitation.additionalFields` (same mechanism as `contactId`).
2. The accept path applies them to the minted member row. The natural home is the same engine-bound `afterAcceptInvitation` hook that stamps `contactId` — it already receives `{ invitation, member, user, organization }`, so the extension is "also copy `invitation.attributes` onto the member" (an adapter-layer member update or `UpdateMemberAttributes`-equivalent write, same authority as the stamp).
3. Resend semantics: `InviteMember` with `resend: true` should be able to refresh the stored attributes (an invite correction is cancel/re-invite or resend — either path must not preserve stale attributes silently).

## 5. Attributes stored as native BSON

**Lands in**: [mongodb](../../../lowdefy-design/designs/auth-upgrade/mongodb/design.md) Decision 5 / its open question.

At 1.6.23 the Mongo adapter stringifies `json` additionalFields, which would break this module's native reads: list filtering on attribute contents (`fields.member_attributes`-driven filters), attribute columns in the export, and attribute display joins. Already being resolved upstream — the user-admin design assumes sub-document storage; recorded here so the dependency is visible and the migration codemod matches the settled shape.

## 6. Module-exported `auth.hooks` bindings

**Lands in**: [hooks](../../../lowdefy-design/designs/auth-upgrade/hooks/design.md) (binding model / build plumbing), touching the module-system build where scoped ids resolve.

**Problem**: `auth.hooks` is app-root config — `{ id, point, endpointId }` entries the app hand-writes. The module ships the `invitation.send` dispatch endpoint (`send-invitation-email`), but endpoint ids are scoped with the module entry id at build time, so the app must hand-write the binding with the _scoped_ id (`{entry}-send-invitation-email`) — fragile duplicated wiring, the same failure class ask 1 removes for the org id. The hooks design already anticipates a module "bundling the endpoint and the `auth.hooks` binding" (merge-on-signup ships exactly that way), but the module manifest has no surface to export a binding.

**Ask**: let a module manifest declare hook bindings for `InternalApi` endpoints it ships (e.g. `hooks: [{ point: invitation.send, endpoint: send-invitation-email }]`); the build resolves the scoped endpoint id and contributes the `auth.hooks` entry, subject to the existing one-binding-per-point validation. A module binding colliding with an app binding on the same point should be a build error (the hooks design's build-enforced uniqueness extends naturally).

**Fallback if declined**: a documented consumer setup step — the app hand-writes the `auth.hooks` entry with the module-scoped endpoint id.

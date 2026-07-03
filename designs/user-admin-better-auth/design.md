# User Admin on BetterAuth

Redesign of the `user-admin` module for the BetterAuth-based auth engine (the auth-upgrade designs). A major breaking change — the module is rebuilt against the new `contact` / `user` / `member` model and the sanctioned admin-step mutation surface, not adapted from the current interface.

**Scope**: apps under the **`pinned` active-org policy** (org = app — the replacement for the multi-app adapter pattern). One module instance administers one pinned org. Multi-tenant administration is a separate future module; the self-service counterpart (`user-account`) is a separate follow-on design.

**Dependency**: the auth-upgrade designs — [admin](../../../lowdefy-design/designs/auth-upgrade/admin/design.md) (step catalog, ownership rubric, module contract), [user-model](../../../lowdefy-design/designs/auth-upgrade/user-model/design.md) (records, lifecycle, hard wall), [mongodb](../../../lowdefy-design/designs/auth-upgrade/mongodb/design.md) (collection names, native reads). This design assumes `attributes` are stored as native BSON sub-documents (not JSON strings) — being resolved upstream (mongodb open question); native reads here filter and project attribute contents on that assumption.

---

## Problem

Today the module owns everything about a user as raw MongoDB writes against the fused `user_contacts` collection (`apps.{app}` map, `is_user`, `disabled`, `global_attributes`). The new model splits that record across app-owned data (`contact`) and auth-owned records (`user`, `member`, `invitation`, `session`, `account`), and the auth-owned side may only be written through the platform's admin routine steps — raw writes bypass BetterAuth's invariants. Every page, form, and API in the module is affected, and the new engine offers capabilities the old module could never have (ban, session revocation, impersonation, native invitations, auth-method visibility). Rebuild, don't port.

## The reframe

The module is no longer CRUD over one collection — it is **the operator console for a person's access lifecycle in one app**, composing contact requests + admin steps + audit events into per-concern routines:

| Concern                                   | Record                            | Write pathway                                                                           |
| ----------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| The person (profile, CRM data)            | `contact` (`user-contacts`)       | Normal request over app connection, change-stamped                                      |
| Login identity + global attributes        | `user` (`users`)                  | `UpdateUserAttributes`, `BanUser`/`UnbanUser`, `DeleteUser`, `RevokeUserSessions` steps |
| This app's access (roles, app attributes) | `member` (`user-members`)         | `UpdateMemberRoles`, `UpdateMemberAttributes`, `RemoveMember` steps                     |
| Pending access                            | `invitation` (`user-invitations`) | `InviteMember`, `CancelInvitation` steps                                                |

Reads stay native — aggregations over these collections joined by `userId` / `contactId` — per admin Decision 4.

Under `pinned` policy the word "organization" never appears in the UI: the pinned org _is_ the app, and the admin sees "this app's users."

The access lifecycle the UI makes legible:

```
Invited ──accept──► Active ◄──unban──── Suspended (ban: global, reversible,
   │                  │    ──ban─────►             sessions revoked)
cancel / expire       │
                 Remove from app (member row deleted; re-invite to restore)
                      │
                 Delete login identity (user row hard-deleted; contact survives)
```

---

## Key decisions

### 1. One module instance = one pinned org; the users list is the members list

The module administers the deployment's pinned organization. The list page reads `user-members` for that org, joined to `users` and `user-contacts`. There is no `app_name` var — per-app scoping by field path dies with the `apps.{app}` map.

Native reads see `member.role` as BetterAuth stores it — a CSV string (`"admin,branch-manager"`, user-model Decision 5); the split-to-array happens only in `resolveAuthentication`. Every pipeline that displays, filters, or exports roles therefore splits the string itself (`$split`) — nothing reads a role array from the database.

**Platform ask**: the admin steps (and the module's reads) need the pinned org's id. Preference: steps **default to the deployment's pinned org** when `organizationId` is omitted, and the pinned org id/slug is resolvable in config (e.g. via `_app` metadata or an operator), so the module carries no `org` var. If the platform declines, the fallback is an `org` slug var — one more thing to misconfigure, so the default is worth pushing for.

### 2. Members and invitations are sibling tables; the export merges them

The list page presents two tables — **Members** (the primary view) and **Invitations** (pending / expired, with a pending-count badge) — as tabs on the `all` page, one menu entry. They stay separate because they are different lifecycles over different collections with different columns and actions (members: roles, status, last-active; invitations: inviter, expiry, resend/cancel). Forcing them into one union list muddies both.

**Search is plain `$match` text/regex — Atlas Search is gone from this module.** The old list page's `$search` stage and its Atlas index requirement do not carry over: the members and invitations tables filter with regex/text `$match` clauses over the relevant fields (contact name / emails, `user.email`, roles, invitation email). A pinned org's member list is small enough that regex over a `$lookup`-joined pipeline is fine, and dropping `$search` removes the module's only Atlas-specific infrastructure dependency. Consequently the `request_stages.filter_match` slot changes meaning: it appends plain `$match` clauses, not Atlas Search compound clauses (Decision 8).

The **Excel export merges both** into one sheet with a `status` column (Active / Suspended / Invited / Expired) — the union lives only in the export pipeline, where a flat "everyone with or pending access" snapshot is exactly what the consumer wants. The export sits behind a **`download` var (default `false`)**: unless enabled, the download button and its export pipeline are excluded.

Status derivation is uniform and filters on BetterAuth's `invitation.status`: member row + not banned → **Active**; member row + `user.banned` → **Suspended**; `status: pending` invitation → **Invited**; `status: pending` and past `expiresAt` → **Expired**. `accepted` / `rejected` / `canceled` invitations appear in neither the Invitations tab nor the export.

### 3. A single user workspace with section-scoped edits

One detail page (`view`) replaces today's view + edit + check pages. Tiles: **Profile** (contact fields), **Access** (roles + member attributes), **Global attributes** (user attributes), **Security**, **Apps** (cross-app badges, Decision 6), **Activity** (event timeline). Each tile edits through its own modal and its own routine.

This is the data model speaking, not a UI preference: a profile save is a plain contact request; an access save is `UpdateMemberRoles` + `UpdateMemberAttributes`; a suspension is `BanUser`. One "edit everything" form would smear three write pathways behind one Save button, blur partial-failure semantics, and produce mushy audit events. Per-section routines give crisp events ("roles changed", "profile updated", "suspended") and line up with the permissions milestone, which will gate these capabilities individually.

Every routine endpoint is role-gated by the hosting endpoint's `auth.api.roles` (admin Decision 2), supplied by a module var.

### 4. Two revocations, honestly labelled — and ban's blast radius is global

The old `disabled` flag conflated two things the new model separates:

- **Suspend / reinstate** — `BanUser` / `UnbanUser`. Reversible, revokes sessions, blocks sign-in. **Ban is user-level, so it applies across every app in the suite** — the UI must say so, never present it as app-scoped. The confirm dialog **enumerates the user's other memberships** (a native read over `user-members` + `user-organizations`) so the admin sees exactly which apps the suspension reaches before confirming.
- **Remove from this app** — `RemoveMember`. Deletes the member row; the person keeps other apps and their contact record survives. Restore is a re-invite (roles/attributes are not retained — membership is the row's existence).

**Delete login identity** (`DeleteUser`) is offered only when the user holds **no other memberships** (a native read guards the button and the routine re-checks): app A's admin must not destroy an identity app B depends on. The contact always survives; contact soft-delete stays the contacts-side convention.

**Ban's suite-wide authority is deliberate — and gated by a var.** Under `pinned`, suspend hands every app instance's admin roles a capability that reaches the whole suite: the one place the module's authority exceeds its app scope. That is the intended model for a trusted operator group, so it defaults on — but it sits behind a **`suspension` var (default `true`)** gating the suspend/reinstate surface, for deployments that want an app's admins limited to app-scoped revocation (`RemoveMember`).

**Self-targeting is allowed.** No guard stops an admin suspending or removing themselves; lock-out is accepted as recoverable by another admin (or direct database access as a last resort). Guards against self-suspend / self-remove are surface we can add later if this bites in practice — not worth carrying up front.

### 5. Security tile — adopt the new engine capabilities

- **Suspend / reinstate** (Decision 4) — behind the `suspension` var, default `true`.
- **Sessions** — active sessions listed (native read over `user-sessions`: created, expiry, IP/user-agent) with a "sign out everywhere" action (`RevokeUserSessions`).
- **Auth methods** — read-only: linked providers (`user-accounts`), passkeys, MFA enrolment, email-verified. Native reads; answers "why can't she log in?" without touching anything.
- **Impersonation** — "View as user" via the `ImpersonateUser` client action, **behind a module var** (`impersonation: false` by default). It is a client action (session-scoped, cookie-setting), additionally governed by BetterAuth's own admin AC — see upstream ask 3.

### 6. Cross-app badges — visibility, not management

The workspace shows the user's other memberships in the suite as read-only **app badges** (org name tags — native read over `user-members` + `user-organizations`), answering "which apps does this person have?" for support. The cross-app disclosure — any app's admins see which other apps a person belongs to (here and in the ban dialog, Decision 4) — is deliberate: the suite's admins are one trusted operator group. Managing that access belongs to each app's own admin instance. No var: in a single-org app the badge list is naturally empty — uniform behaviour, no knob.

### 7. Invite flow — email-first, BetterAuth-native

One `invite` page. The admin enters an email first; a check routine resolves it before the form opens:

- **Already a member** → link to their workspace (today's check-page guarantee, now in-page).
- **Pending invitation** → show it, offer resend / cancel.
- **Existing contact (no membership)** → link the contact, prefill profile fields.
- **Unknown** → blank form; the routine creates the contact.

Submit = create-or-link `contact` (normal request) → `InviteMember` with `contactId` + roles → audit event. The invitation email dispatches through the **`invitation.send` hook**: the module ships the notifications-dispatch `InternalApi` endpoint **and exports its `auth.hooks` binding with it** — the build wires the scoped endpoint id, so the app hand-writes no binding (upstream ask 6; fallback is a documented app-side `auth.hooks` entry). Resend rides `InviteMember`'s native `resend`; cancel is `CancelInvitation`; expiry and auto-cancel-if-member are BetterAuth's. This preserves the contact-uniqueness invariant the old `check` page existed for (one contact per email), backed by the platform's partial-unique `users.contactId` index and the invitation-accept `contactId` stamp (admin Decision 5).

**Member attributes are captured on the invite form**, exactly as today's invite captures `app_attributes` — they carry authorization parameters an invited user must hold from their first session, so "edit them after acceptance" would open a window where the user is in with no attributes. The invitation stores them (`invitation.additionalFields`) and an accept-time hook applies them to the minted member row, alongside the engine's `contactId` stamp. This needs platform support and is a **dependency, not a nice-to-have** — upstream ask 4.

The public **accept page is not this module's** — it belongs with the auth-pages modules, like the login page.

### 8. Extension surface — same slot philosophy, renamed to the model

- **`fields.profile`** (contact fields — binds `state.profile.*`), **`fields.user_attributes`** (was `global_attributes`), **`fields.member_attributes`** (was `app_attributes`). Same blocks serve tile display and edit modals.
- **`roles`** stays required — display metadata (`[{label, value}]`) over the app's compiled role catalog. Validity is core-owned now: the build validates catalog roles and the steps reject unregistered names, so a typo fails loudly at both layers.
- **`components.*`** slots carry over: `table_columns`, `download_columns`, `filters` (+ `filter_requests`), `main_slots`, `sidebar_slots`, tile overrides.
- **`request_stages.*`** survives for **reads** (list pipeline, filter match, export) and for the **contact write** (`request_stages.write` on the profile routine, per the module contract). `filter_match` now takes plain `$match` clauses — there is no `$search` stage to extend (Decision 2). The auth-side write seam is routine steps, not pipeline stages — no slot re-creates one.
- `event_display`, `avatar_colors`, `app_title` carry over in kind. New vars: `impersonation` (Decision 5), `suspension` (Decision 4), `download` (Decision 2); an admin-roles var gates the routine endpoints (Decision 3).

**Dependencies**: `layout`, `events` unchanged; `notifications` remains solely as the invite-email dispatcher behind `invitation.send`.

---

## Module surface (sketch)

| Export      | Contents                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages       | `all` (Members + Invitations tabs, filters; export behind the `download` var), `view` (workspace), `invite`                                                                                                                                                                     |
| APIs        | `invite`, `check-invite-email`, `cancel-invitation`, `resend-invitation`, `update-profile`, `update-access`, `update-user-attributes`, `suspend`, `reinstate`, `revoke-sessions`, `remove-member`, `delete-user`, `send-invitation-email` (the `invitation.send` hook endpoint) |
| Connections | `user-contacts-collection` (app connection), plus one read-only connection per auth collection the module reads natively: `users`, `user-members`, `user-invitations`, `user-sessions`, `user-accounts`, `user-organizations` — names are adapter-fixed (mongodb Decision 2)    |
| Menus       | `default` (Users)                                                                                                                                                                                                                                                               |

Each native read is an aggregation starting from the relevant auth-collection connection, `$lookup`-joining the others; this assumes the auth collections and `user-contacts` share one MongoDB database (both ride the deployment's `MONGODB_URI`).

Retired vs today: `edit` and `check` pages (`new` is renamed `invite`), `app_name` var, `resend-invite` as a bespoke notification flow, the Atlas `$search` stage and its index requirement (Decision 2), all raw writes to auth-owned data. A consumer migration guide (v0.9 vars/slots/pages → this surface) is an implementation task, written once this design is finalised.

---

## Upstream asks (feedback into the auth-upgrade designs)

The platform-side changes this design depends on are specified in **[upstream-asks.md](upstream-asks.md)**, to be resolved in the auth-upgrade designs before implementation:

1. **Pinned-org defaulting** — steps and config resolve the deployment's pinned org implicitly (Decision 1).
2. **Admin identity-field stance** — make "no set-email / set-name / set-password steps" an explicit upstream decision (Decision 4 relies on cancel + re-invite).
3. **Impersonation AC** — how an operator satisfies the BetterAuth admin plugin's own access control (Decision 5).
4. **Attributes on invitations** — invite-time member attributes stored on the invitation and applied at accept (Decision 7 — a hard dependency).
5. **Attributes as native BSON** — the mongodb open question; this module's attribute filters depend on it (already in flight).
6. **Module-exported hook bindings** — a module ships hook endpoints (the `invitation.send` dispatch) together with their `auth.hooks` bindings, wired by the build (Decision 7).

## Non-goals

- **Multi-tenant administration** (`policy: tenant` — org switching, tenant creation, seat management). Separate module, designed after this one lands.
- **`user-account` redesign** — the self-service side (own profile, own sessions, passkey enrolment, MFA setup). Follow-on design.
- **Auth pages** — login, signup, invitation accept, verify. Auth-page modules own these.
- **Contact administration** beyond what the invite flow needs — the `contacts` module owns pure contacts.
- **Role-type management** — the module assigns catalog roles; minting role names is out of scope platform-wide.
- **Admin email change for active users** — a wrong login email caught after acceptance is handled as a new user: remove / delete and re-invite (upstream ask 2 records the platform stance; pre-accept it's cancel + re-invite). If a concrete need surfaces, the path is a designed upstream step with verification semantics, exposed behind a module var — admin-side only, never self-service.

## Open questions

- **Invitations presentation** — tabs on `all` (current lean) vs a separate page. Decide when the list pipelines are real; the export merge (Decision 2) is fixed either way.

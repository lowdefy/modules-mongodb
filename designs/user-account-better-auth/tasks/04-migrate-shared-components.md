# 04 — Migrate shared components to the contact/user model

**Context**: The module's shared components carry over in kind but must survive the
model change (design.md — Decision 8): `profile-avatar`, `user-selector`,
`user-multi-selector`, `user-avatar` all read `user-contacts` and need pipeline
updates only (they no longer read the fused `user_contacts` NextAuth shape).

**Task**: Update each component's read pipeline/config to the new `user-contacts`
schema and the split record model:

- `profile-avatar` — PageHeaderMenu avatar (picture + first-letter fallback),
  reading contact/`_user` per Decision 6 (`_user.name` / `_user.image` /
  `_user.profile.*` now resolve on the caller).
- `user-selector`, `user-multi-selector` — pick app users; source from
  `user-contacts` (joined as needed), not the old fused collection.
- `user-avatar` — inline avatar + name chip from a `user-contacts` doc.

Keep exports and consumer-facing signatures stable where possible so demo
`user-components-demo` page and any consumers keep working.

**Acceptance Criteria**:

- All four components read the new `user-contacts` model; no reference to the
  retired fused NextAuth collection or `app_name`.
- `apps/demo/pages/user-components-demo.yaml` still resolves and renders.
- `pnpm ldf:b` green.

**Files**:

- `modules/user-account/components/{profile-avatar,user-selector,user-multi-selector,user-avatar}.yaml`

**Notes**:

- Depends on 01 (manifest/connections).
- Needed by the onboarding (17) and account (18) pages, which reference these
  components.
- See `docs/contacts/` for the `user-contacts` schema.

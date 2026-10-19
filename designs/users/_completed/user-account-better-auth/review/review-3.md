# Review 3

Scope: the **task set** `designs/user-account-better-auth/tasks/` (01–20 + `tasks.md`),
verified against `design.md`, the two prior reviews (both fully resolved), the sibling
`user-admin-better-auth` task set, the current `modules/user-account` module, and the
auth-upgrade dependency designs (`config-schema`, `engine`, `user-profile`, `hooks`).

The task set is well-structured: it covers every page, API, component, connection,
menu, index, and doc in the design's Module surface; the foundation-then-screens
ordering is sound; and the wiring specs correctly track the resolved-review decisions
(`_build.authConfig` enablement, the two-layer gating, `PasskeySignIn` blocked on
ask 6, the shared-fragment freshness invariant). Factual spot-checks held up:
`_build.authConfig.twoFactor.enabled` is a real projected path (config-schema
line 342); `TwoFactorVerify` does serve both enrolment confirm and the sign-in
challenge (upstream-asks ask 1). The findings below are one hard cross-design conflict,
two gaps, and two minor items.

## Correctness

### 1. The two shared fragments have contradictory homes across the two sibling task sets — they will be built twice, in two places, two ways

> **Resolved.** Reconciled to the shared-folder decision (user-admin was already on the winning side, so only user-account moved). The fragments are no longer user-account manifest exports: `design.md` Decisions 6/7/8 and the Module surface Components row now specify var-free `modules/shared/contact/{write-profile,create-or-link-contact}.yaml` files `_ref`'d by relative path, with the dependency-edge rationale spelled out. Task 01 drops the two `components` export stubs (component count 6→4); tasks 05/06 re-home the files to `modules/shared/contact/` (var-free, `_ref` vars not `_module.var`) and flag them as the same canonical files as user-admin task 02 under one shared spec (first task set to ship authors, the other reuses); tasks 07/08 `_ref` them by relative path. No change needed on the user-admin side.

This is the most important finding. Tasks 05 and 06 place `write-profile` and
`create-or-link-contact` in **`modules/user-account/components/`**, **exported via the
manifest `components` list**, and `_ref`'d cross-module by user-admin (task 05 AC:
"Exported from the manifest (`components` export) so user-admin can `_ref` it"; task 06
same; task 01 declares both as manifest `components` stubs).

The sibling `user-admin-better-auth` task set decides the **opposite**, and says so
explicitly. `designs/user-admin-better-auth/tasks/02-shared-contact-fragments.md`
(lines 5–11, 63–65):

> they live as `modules/shared/` files `_ref`'d by relative path — **not** module
> exports and **not** dependencies … These fragments do not exist yet — this task
> creates them under `modules/shared/contact/`.
> … The sibling `user-account` design currently frames these as _exported by_
> `user-account`; **the settled decision is the shared folder.** Author them here as
> the canonical home; `user-account` will `_ref` them later.

So both task sets author the same two files — user-account under
`modules/user-account/components/*` (manifest-exported), user-admin under
`modules/shared/contact/*` (relative-ref, no module vars). Run both and you get
duplicate fragments and a manifest that exports a component user-admin says must not be
a module export. This is not a naming nit — it is a load-bearing "one correct way"
decision (Decision 6/7/8) that the two designs answer differently.

The user-admin side is mechanically right, which is why it should win: user-admin does
**not** depend on user-account (dep graph in `docs/index.md`: user-admin → layout,
events, notifications). A manifest-exported component `_ref`'d with `{ module:
user-account }` requires the consumer to declare a dependency on the provider — so the
user-account approach forces a **new user-admin → user-account dependency edge** purely
to share a var-less write fragment. The `modules/shared/` folder (which already exists
with `profile/`, `layout/`, `enums/`) exists precisely to avoid that edge. Note too
that user-admin task 02 requires the fragments carry **no `_module.var` references**,
whereas user-account tasks 05/06 describe them as manifest exports parameterized the
module way — the two are not the same artifact.

Fix: reconcile to the shared-folder decision. Update user-account **Decision 8**, the
**Module surface** Components row (design.md lines 118, 133), **task 01** (drop the two
`components` export stubs), **task 05**, and **task 06** to author/consume
`modules/shared/contact/{write-profile,create-or-link-contact}.yaml` by relative
`_ref`, not as user-account manifest exports. Tasks 07 and 08 then `_ref` the shared
files rather than local components. (If instead the export approach is chosen, user-admin
task 02 and its design must change and accept the new dependency edge — but that
contradicts user-admin's stated settled decision, so user-account is the side to move.)

## Gaps

### 2. The demo `auth:` config is not required to enable the full method matrix, so most gated UI branches ship un-exercised

> **Resolved.** Task 01's demo-wiring step now **requires** the demo `auth:` config to enable the full matrix — `emailAndPassword` + `magicLink` + `twoFactor` + `passkey` + ≥1 `providers` entry (with a matching `providers` display-metadata var) — so every `_build.authConfig`-gated branch in the login page and account workspace builds into a demo artifact and is walkable by the verify gate. Added a corresponding AC to task 01 and cross-reference notes to tasks 09 and 18. Noted no OAuth secrets are needed (`ldf:b` reads only the projection) and that `passkey` stays enabled despite the ask-6 login-button fallback (task 18's passkeys tile still builds).

CLAUDE.md mandates every consumer-facing capability ship "with at least one real example
consumer in `apps/demo/` that exercises it … validated end-to-end (`ldf:b`)." Large parts
of this module are **deployment-gated on `_build.authConfig`**:

- Login (task 09): magic-link tab (`magicLink.enabled`), passkey button
  (`passkey.enabled`), OAuth buttons (`providers`).
- Account workspace (task 18): the 2FA tile (`twoFactor.enabled`), the passkeys tile
  (`passkey.enabled`), linked-accounts (`user-accounts` rows from a real provider).

If the demo `auth:` block enables only `emailAndPassword`, every one of those branches
resolves its gate to `false`, is never built into a demo artifact, and cannot be walked
by the verify gate (task 20). Task 01 only says "Ensure `emailAndPassword`, and the
demo's method config, exercise the login methods" (line 54) — silent on `twoFactor`,
`passkey`, `magicLink`, and providers, and silent on the **workspace** gates entirely.

Fix: make task 01 require the demo `auth:` config to enable the full matrix —
`emailAndPassword` + `magicLink` + `twoFactor` + `passkey` + at least one `providers`
entry (with a matching `providers` display-metadata var) — so each gated branch in 09
and 18 has a build-verified consumer. (Passkey-enabled is consistent with the ask-6
fallback: the login passkey button drops when `PasskeySignIn` is absent, while task 18's
`PasskeyRegister`/`PasskeyDelete` tile still renders and builds.) State this in task 01's
demo-wiring step and reference it from tasks 09 and 18.

### 3. Task 03 re-defers the `lowercase_email` index shape the design said would be "pinned," and it is resolvable now

> **Resolved.** Pinned the shape now: **partial-unique on `{ lowercase_email: { $exists: true } }`**, because `user-contacts` is shared with the `contacts` module whose CRM contacts legitimately have no email (a plain unique index would reject the second email-less contact). Noted the write-side constraint — email-less contacts must omit the field, not store `null`. Per the user's direction, indexes in this project are **documentation only** (nothing creates them), so task 03 was reframed from "create splice-actions index files" to authoring `docs/user-account/reference/indexes.md` following the `docs/workflows/reference/indexes.md` host-app-requirement pattern; Decision 7 in `design.md` now states the pinned shape and points at that doc.

Decision 7 says "the exact partial-unique shape is pinned down in the schema pass." No
schema pass exists in this design folder (no `review`/`schema` doc from `/r:design-schema`),
and task 03 pushes the decision to implementation: "Decide and document the exact shape —
plain unique vs partial-unique … based on whether contacts without an email are valid in
this model." That is exactly the "verify at code time" punt CLAUDE.md's "Resolve the open
question; don't defer it" rule forbids — and the answer is knowable now.

`user-contacts` is the unified person record shared with the `contacts` module, which
holds CRM contacts that legitimately have **no email**. A **plain** unique index on
`lowercase_email` would reject the second email-less contact (two `null`/missing keys
collide). Therefore the index must be **partial-unique, scoped to documents where
`lowercase_email` exists** — this is determinable from the model, not a code-time
discovery. The reconcile-on-duplicate-key path in `create-or-link-contact` (task 06, and
user-admin's invite) depends on this exact shape being correct, so a wrong guess breaks
both callers' race guard.

Fix: pin the index as partial-unique on `lowercase_email` existence in task 03 (and note
the CRM-contact rationale), rather than leaving the shape to the implementer. Confirm the
field is actually populated on writes (the create-or-link and write-profile fragments must
set `lowercase_email`).

## Minor

### 4. Task 01's delete list misses components orphaned by the page deletions

> **Resolved (auto).** Verified both files are orphaned (`form_profile` only `_ref`'d by `pages/{new,edit}.yaml`, `view_profile` only by `pages/view.yaml` — all deleted/rewritten). Added them to task 01's delete step and Files list, with a note to sweep `requests/`/`validate/`/`enums/` for the same.

Task 01 deletes `pages/{edit,new}.yaml`, `pages/verify-email-request.yaml`, and
`api/create-profile.yaml`, but not `components/form_profile.yaml` — whose only consumers
are `pages/{new,edit,view}.yaml`, all being deleted or rewritten — and
`components/view_profile.yaml`, which has no live references at all after the rewrite.
Both become dead files. Add "audit and remove components orphaned by the page deletions
(`form_profile`, `view_profile`)" to task 01's delete step so the rebuild doesn't leave
retired NextAuth-era config behind. (Also worth a quick pass over `requests/`,
`validate/`, and `enums/` for the same orphaning.)

### 5. `tasks.md` lists task 03 as a dependency of task 05, but task 05 says it isn't one

> **Resolved (auto).** `write-profile` only updates existing contacts (never inserts), so the `lowercase_email` uniqueness index is irrelevant to it. Dropped `03` from task 05's row in the `tasks.md` dependency table; it remains a real dependency of task 06 (the upsert).

The dependency table (`tasks.md` line 35) shows task 05 (`write-profile`) depending on
"01, 03", while task 05's own Notes say "Depends on 01 (manifest) and 03 (indexes not
strictly, but model settled)." `write-profile` only updates existing contacts — it never
inserts, so the `lowercase_email` uniqueness index is irrelevant to it. Drop 03 from task
05's row in `tasks.md` (it stays a real dependency of 06, which does the upsert), so the
parallelism map is honest.

## Next Step

Run `/r:design-action-review user-account-better-auth` to resolve, reject, or defer each
finding. Finding 1 is cross-design — its resolution must be mirrored in the
`user-admin-better-auth` design/tasks (or vice versa).

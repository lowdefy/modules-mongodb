# Review 1

### 1. `Validate params: modal_access` validates nothing — the design's whole abort mechanism never fires

> **Resolved.** Confirmed against the installed engine: `getBlockMatcher` builds an exact-`blockId`
> matcher from a bare string and only ever reads `blockIds`/`regex`, every block short-circuits on its
> own id, and `Slots.getValidateRec` passes that same exact matcher down — no cascade. The design's
> "no new wiring is needed" claim is deleted and replaced with a new section giving the working form
> (`blockIds: [roles]` + `regex: [^member_attributes\.]`), the reason the prefix is the module's
> contract with the consumer rather than a guess, and an explicit warning that the docs' `blockId`
> spelling silently matches nothing. Proposed change 3 and the Files-changed row updated; the sibling
> 2FA design and the two existing precedents are cited.
>
> **Scope:** this modal only. The same container-id mistake in the other seven forms — `user-admin`'s
> `modal_profile`, `modal_global`, `invite_form`, and `user-account`'s `modal_profile`,
> `modal_changepw`, `modal_disable2fa`, `modal_enroltotp` — is recorded as a Non-goal with all seven
> sites named and a follow-up design owed. Sweeping them here would make each form's dormant rules
> start firing, which is correct but user-visible and needs verification that has nothing to do with
> role editing.

Proposed change 3 and D2 rest on: "`Validate` already runs first in the modal's `onOk`, so a
failing rule aborts before `CallAPI` and nothing invalid reaches the server", and "The modal's
`onOk` already opens with `validate_access` targeting `modal_access`, so no new wiring is needed"
(design "The validation rule").

`Validate` does not cascade to descendants. `getBlockMatcher` turns a string param into an
exact-`blockId` matcher (`getBlockMatcher.js:47-49` in the installed build: it only ever reads
`testParams.blockIds` / `testParams.regex`), and every block tests that matcher against its own
`blockId` and bails out first thing — `getValidate: (match) => { if (!match(this.blockId)) return
null; … }` (`engine/dist/Block.js:372-374`). `Slots.getValidateRec` walks the whole tree but passes
the same exact-id matcher to each block (`Slots.js:119-126`). So `params: modal_access`
(`modal_access.yaml:25-27`) matches exactly one block — the Modal container, which has no `validate`
entries and `required` defaulted to `false` (`Block.js:444`) — and returns zero errors.
`createValidate` only throws when `validationErrors.length > 0`, so the chain proceeds to
`save_access` with the orphan still in `state.roles`. The rule's `message` is also never rendered:
`status` is forced to `null` unless `showValidation` is set, and only `getValidate` sets it
(`Block.js:421-423`, `Block.js:372-373`).

**This is already a settled decision in this same feature folder.**
`designs/users-fixes/2fa-enrolment-modal/design.md:215-234` reaches exactly this conclusion for
`modal_enroltotp` ("naming the modal id validates **nothing**"), cites the same two engine lines,
and names the working form: `regex: ^enroltotp\.`, with precedents
`modules/activities/components/task-modal.yaml:124-127` and
`modules/deals/components/detail/deal_outcome_modal.yaml:66-69`. This design contradicts that
sibling decision.

**Fix.** `validate_access` must name the blocks. The modal holds `roles` (a bare id) plus the
consumer's `fields.member_attributes` blocks (repo convention: ids under `member_attributes.*`), so
the working form is both keys together:

```yaml
- id: validate_access
  type: Validate
  params:
    blockIds:
      - roles
    regex:
      - ^member_attributes\.
```

Note `blockIds`, not `blockId` — the Validate docs
(`@lowdefy/docs-content/content/actions/validate.md`) document the object key as `blockId`, but
`getBlockMatcher` only reads `blockIds`, so `{ blockId: roles }` silently matches nothing. Worth an
explicit line in the design so the implementer doesn't copy the documented spelling.

Two knock-ons: (a) the same dead-guard applies to `modal_profile.yaml:24-26` and
`modal_global.yaml:20-22` and to `invite_form.yaml:145-147` (`params: state_form`) — the design
should say whether it fixes the one modal it touches or the module's four; (b) the Verification
checklist item "Save with it selected is refused inline … with no network call and the modal open"
cannot pass as currently designed, so it is a real gate, not a formality.

### 2. Orphans are not rare — open signup mints an orphaned `member` role on the default path

> **Resolved.** Confirmed in full, and the root cause is upstream. "How a role becomes orphaned" now
> documents both sources, naming the two disagreeing hooks and the end-of-request flush ordering that
> makes `applyPinnedPolicy` the winner. Added **upstream ask 2**: `applyPinnedPolicy` passes
> `role: ''`, matching `createAutoJoinHook` — the role-catalog design's already-stated position
> applied to the one path that missed it. Nothing is lost, since `pinned` withholds `defaultRoles` so
> `member` is unregistered and grants nothing, the membership wall keys on row existence, and page/API
> gates key on catalog ids. The stale `signup: open` comment in `apps/demo/lowdefy.yaml` (which
> describes the buggy behaviour) is corrected in the same pass.
>
> D2's cost is re-stated honestly per source: strictly better than today for a catalog-deleted id,
> but a **new** block for the `'member'` case, since `validStaticRoles` unions BetterAuth's built-ins
> unconditionally and that save works today. With ask 2 in, the affected set is closed and shrinking
> rather than open and growing; what remains is `'member'`-holding rows already in data, whose
> cleanup is the desired end state. **If ask 2 is declined**, D2 must be revisited against finding
> 3's narrower rule — recorded in the ask's "If declined".
>
> Uniform client-side treatment is kept deliberately, not by oversight: under `pinned` a held
> `member` genuinely is a role the app does not configure, so flagging it is correct, and matching
> BetterAuth's built-ins-are-always-valid quirk would make the detail page stop saying so. The
> Non-goals bullet now spells that out.
>
> Verification updated per the finding's silver lining: no hand-seeded member is needed — a
> magic-link or Google first sign-in against `apps/demo` produces an orphan-holding member, and the
> same signup landing role-less is the check that ask 2 works.
>
> (The `tenant` policy is out of scope — the module is pinned-only — but the finding lands squarely
> on the pinned branch, so that does not narrow it.)

"Role-less members are legitimate: … the role-catalog design deliberately moved open-signup
auto-join to write an empty role rather than a phantom `'member'` string" (design line 118-120), and
D2's cost is accepted because "Orphans are rare and removal is the desired end state".

That is true of only one of the two open-signup join paths. `createAutoJoinHook.js:53-59`
(`user.create.after`) does write `role: ''`. But `createActiveOrgPolicyHook.js:68-74`
(`session.create`, pinned + `signup: open`) writes `role: 'member'` — and
`createAutoJoinHook.js:25-28` states the ordering itself: "BetterAuth flushes after-hooks at the end
of the request (confirmed at 1.6.23), so a signup minting an immediate session runs the
session.create policy hook first — that hook also ensures membership under open signup, and this one
skips when the member row already exists."

So whenever a first sign-in mints an immediate session — magic link, an OAuth provider, or
email/password with `requireEmailVerification: false` — the new member lands with
`member.role = 'member'`. `member` is not in any app's `auth.roles` catalog, and under `pinned` it
is not registered in the org plugin either (`buildOrganizationPlugin.js:64-70` drops `defaultRoles`
for `pinned`). `roles_from_catalog.yaml` therefore flags it `orphan: true`. `apps/demo` is exactly
this shape: catalog `user-admin / admin / manager / user`, `signup: open`, `magicLink.enabled: true`,
a Google provider.

Consequences for this design:

- The premise that orphans arise only from a deliberate catalog deletion is wrong, so D2's
  "orphans are rare, so blocking attribute saves is a fair trade" does not hold. For an app on
  open signup it is potentially _every self-signed-up member_, and an admin cannot save any of
  their attributes without first stripping their `member` role.
- Today those saves **succeed** on the server: `validStaticRoles` always unions BetterAuth's
  `defaultRoles` keys (`crud-members.mjs:258`), so a submitted `member` passes. The design's client
  rule treats every non-catalog id uniformly (Non-goals, third bullet) — which means this change
  _newly blocks_ a save path that works today, for a whole class of members. That is the reverse of
  the improvement claimed in D2 ("strictly better than today").
- Silver lining for Verification: the orphan path is more demo-able than the design assumes. A
  magic-link or Google first sign-in against `apps/demo` produces an orphan-holding member without
  hand-seeding a non-catalog role, which is a cheaper rig setup than `CHECKLIST.md:165` implies.

At minimum the design needs to state which of these it treats as in scope: the `member`-vs-`''`
inconsistency between the two engine hooks is arguably its own upstream ask (and a closer sibling to
the empty-set ask than anything else in this design), and the choice materially changes D2.

### 3. D4's rejection is circular, and the alternative it dismisses would remove D2's entire accepted cost

> **Resolved.** The circularity is real and D4 is rewritten: D2 removes the _server_ rejection, while
> the blocked attribute save is a cost D2's own client gate _creates_, so it is accepted on its merits
> rather than argued away. The alternative is **not** adopted. An unchanged re-send is not safe — for a
> catalog-deleted id the server still rejects it, making the raw `ROLE_NOT_FOUND` string reachable
> again (the outcome this design exists to remove, and D3's premise), while for the signup-minted
> `'member'` it succeeds, so the two orphan sources would diverge on the same action. One rule, no
> exceptions to learn; the saving it would buy is removed at the source by upstream ask 2. D4 is
> retitled "The gate is unconditional" and no conditional variant is kept as a fallback.
>
> Surfaced while deciding this, and missed by both the design and the finding: the unconditional gate
> **deadlocks** a member whose only role is an orphan. A signup-minted member holds exactly
> `'member'`; the gate says remove it; removing it leaves the empty set, which BetterAuth rejects with
> a message-less 400. So upstream ask 1 is a hard prerequisite rather than an independent improvement
> — recorded in D2's cost, in the design's opening summary, and in ask 1's "If declined", which now
> states that declining it blocks this design rather than degrading it.
>
> **Addendum, second pass — decision unchanged, reasoning replaced.** The rejection above rebutted only
> half the finding's proposal. "An unchanged re-send is not safe" holds for a conditional rule that
> still submits the roles, but the finding also proposed pairing it with skipping the role write when
> the roles are unchanged ("the belt to that brace"), and under that pairing nothing is re-sent, so no
> server rejection is reachable. Verified buildable: `:if` is a routine control
> (`packages/api/src/routes/endpoints/control/controlIf.js`), so `update-access.yaml` can skip
> `set_roles` on an unchanged selection. The combination would remove D2's cost, remove the deadlock,
> and drop ask 1 to a nice-to-have.
>
> Put to the author, who reaffirmed the unconditional gate: forcing the admin to resolve a role the app
> no longer configures is the intended behaviour, not an accident of the mechanics. D4 is rewritten to
> reject the pairing **on product grounds and say so**, and to record that it works mechanically —
> so the next reader finds a decision rather than the same hole. D2's cost and ask 1's prerequisite
> status are unchanged and now rest on stated intent rather than a faulty safety argument.

D2 accepts: "an admin who wants to change a member's _attributes_ must first remove that member's
orphaned role, since both sit behind one Save button." D4 then rejects the fix for exactly that
cost — "No 'skip the role write when the roles are unchanged' … D2 makes it unnecessary: nothing
invalid reaches the server, so there is no failing step to route around."

That reasoning only addresses the _server_ failure, not the cost. D2's cost is created by D2's own
client-side gate, and D4 is rejected on the grounds that D2 removed the server-side symptom. The
question D4 never asks is whether the gate should fire when the admin hasn't touched the roles at
all.

A narrower rule would keep every property the design wants and drop the cost: fail only when the
selection _differs_ from the seeded `role_ids` while still containing an orphan (or equivalently,
gate the rule on "the admin changed the roles"). The orphan is still never stripped (an unchanged
submit re-sends it verbatim — and per finding 2 the server accepts `member`, though not `old`), still
rendered and labelled, still removable, and an attributes-only edit goes through untouched. The
combination with `skip` on `set_roles` when roles are unchanged (D4's rejected idea) is the belt to
that brace.

This matters much more if finding 2 stands, because then "attributes are unsaveable until you strip
the role" applies to ordinary members, not to a rare artefact. Worth re-weighing rather than leaving
D4 rejected on its current reasoning.

### 4. The upstream ask drops the endpoint's guards and the app's organization hooks

> **Resolved.** Confirmed, and the audit was extended to the whole guard chain rather than the two
> items named. Ask 1 gains a "What the empty branch skips, and what it must reproduce" section
> establishing that almost every guard in `updateMemberRole` is _caller_ authorization satisfied by
> construction — `callPluginEndpoint` injects a member row claiming `$lowdefy-system`
> (`createActingMemberAdapter.js:43`), which is the `creatorRole` under `pinned`
> (`buildOrganizationPlugin.js:111-113`), so `hasPermission` and both creator-protection guards pass;
> the plugin's last-owner check only fires on a self-edit, which is why the step's own guard exists and
> why it covers the empty set. The endpoint's write is itself a bare `adapter.update` on `member.role`
> (`organization/adapter.mjs:193-201`), so the adapter path is not a lesser write — which is what makes
> the bifurcation sound rather than a shortcut.
>
> Both genuine losses are now specified. **Member existence / org scope:** the empty branch must throw
> when the step's existing org-scoped `findOne` misses, from the row it already fetched — closing the
> silent no-op the finding identified. Decided against reproducing BetterAuth's two distinct codes: one
> org-scoped query cannot separate "no such member" from "wrong org", both mean a bad `memberId`, and
> the module never sends one — two errors here would be surface with no reader. **The role hooks:**
> confirmed only `afterAcceptInvitation` is wired (`buildOrganizationPlugin.js:98-102`), and
> `organizationHooks` is engine-authored with no app-facing surface, so nothing external breaks. The
> branch does not fire them and the step carries a comment saying whoever wires either hook owns both
> branches — the finding's "trap worth not building in", recorded rather than designed around.
>
> Return value specified too: the adapter row, matching `updatedMember`, with its `userId` into
> `syncUserAdminRole`, which recomputes from the member row and so clears `user.role` unaided.

"Ask. `UpdateMemberRoles` handles the empty case itself instead of forwarding it: when the resolved
role list is empty, write `member.role = ''` through the adapter … rather than calling the plugin
endpoint."

`updateMemberRole` does more than validate roles before it writes, and a direct adapter write skips
all of it (`crud-members.mjs:283-345`):

- `MEMBER_NOT_FOUND` when the memberId doesn't resolve, and `FORBIDDEN
YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER` when the member belongs to another organization
  (`:285-288`). The step's own `findOne` is already org-scoped (`UpdateMemberRoles.js:41-53`) and
  deliberately falls through to the endpoint's error when it misses — on the empty-set branch that
  fall-through disappears and a bad/cross-org `memberId` becomes a silent no-op adapter update.
- `organizationHooks.beforeUpdateMemberRole` / `afterUpdateMemberRole` (`:320-345`). The engine
  wires `afterAcceptInvitation` today (`buildOrganizationPlugin.js`), so these are not load-bearing
  yet, but "clearing all roles is the one member-role write your hooks never see" is a trap worth
  not building in.

The step's existing last-owner guard does still cover the empty set (`newRoles` is `[]`, so
`!newRoles.includes('owner')` is true — `UpdateMemberRoles.js:56-71`), and `syncUserAdminRole`
recomputes from the member row so it clears `user.role` correctly. The ask should spell out that the
empty branch reproduces the member-existence and org-scope errors from the `member` row it already
fetched, and say explicitly what happens to the two hooks — otherwise the implementer writes the
happy path only. It should also say what the step returns on that branch (`updatedMember` currently
feeds `syncUserAdminRole` and the step's return value).

### 5. `orphan_ids` derives role ids from another stage's display-label fallback

> **Resolved (auto).** `roles_from_catalog.yaml` gains `id: "$$rid"` on each resolved entry and
> `orphan_ids` maps `$$r.id`. `label`/`orphan` are untouched, so `tile_attributes.yaml` and the
> stage's other two consumers (`get_all_members.yaml`, `get_all_invitations.yaml`) are unaffected.
> The design's "`label` _is_ the id for an orphan" sentence is replaced by the reason the id is
> carried explicitly. On the minor: `has_orphan` stays — after this change it and `orphan_ids` both
> `$map` the same `roles[].orphan` flag from the one stage, so D6's no-disagreement argument holds
> for both, and re-expressing the hint gate as a length test would be more config for the same fact.

The proposed read (design "Read — one new field") maps orphans to `$$r.label`, justified as
"`roles_from_catalog.yaml` sets an unmatched entry's `label` to the raw id, so `label` _is_ the id
for an orphan."

Verified true today — `roles_from_catalog.yaml` does `$ifNull: ["$$hit.label", "$$rid"]`. But that
fallback exists to make the **display** chip readable (`tile_attributes.yaml:40-42` renders
`r.label`), and this design now makes it load-bearing for two things that must be _ids_: the
selector option `value:` that gets written to `member.role`, and the validation rule's identity
check. Any future change to the display fallback — "Unknown role", a prefix, a translated
string — silently turns `orphan_ids` into non-ids. The selector would then offer options whose
`value` is a label, and D6's "the two cannot disagree" guarantee would hold while both being wrong,
so nothing would catch it. The failure mode is writing a fabricated role id to `member.role`.

**Fix.** Carry the raw id on the resolved entry in `roles_from_catalog.yaml`
(`in: { id: "$$rid", label: …, orphan: … }`) and derive `orphan_ids` from `$$r.id`. One extra field,
and the coupling to a display default disappears. It also removes the need for the explanatory
sentence in the design.

Minor, same area: `has_orphan` (`get_user_detail.yaml:71-76`) becomes a second computation of the
same fact `orphan_ids` carries. D6's own argument ("reuses a value the read already has … so the two
cannot disagree") applies — `has_orphan` could be dropped in favour of `orphan_ids` length, or the
design should say why both stay.

### 6. Removing `required: true` is not behaviour-neutral — the label asterisk goes with it

> **Resolved.** Confirmed: `MultipleSelector` forwards `required` to `Label`
> (`MultipleSelector.js:81-85`) which sets `ant-form-item-required` (`Label/labelLogic.js:50`), and it
> fires for both label spellings in play — `properties.label.title` in the modal and `properties.title`
> on the invite form — so both fields lose the asterisk. Section (4) no longer calls `required` simply
> "dead config": it is inert **as validation** and live as rendering.
>
> **The asterisk removal is intended in both places**, which is the first of the two branches the
> finding offered. Product call taken deliberately, not by omission: an invite with an empty role array
> already mints a role-less member successfully (design section (5)), so on the invite form the
> asterisk marks a field the flow does not actually require, and a nudge the module's own write path
> contradicts is worse than no nudge. D5 states this and notes that making role choice mandatory at
> invite time would need a real rule, in its own change. D5's "changes no behaviour" claim is deleted;
> the Non-goals bullet and the Files-changed row both now name the asterisk.

D5: "Removing it changes no behaviour and stops the config lying."

The validation half of that is verified: `MultipleSelector`'s `valueType` is `array`
(`MultipleSelector/meta.js`), `enforceType('array', …)` coerces anything non-array to `[]`
(`helpers/type.js:188-189`), and `[]` is not `none`, so the compiled
`pass: { _not: { _type: 'none' } }` rule (`Block.js:279-292`) can never fail. Inert, as claimed.

But `required` is also a render prop: it flows to `Label` and sets the Ant Design required class,
`'ant-form-item-required': required` (`blocks-antd/dist/blocks/Label/labelLogic.js:50`). Deleting it
removes the red asterisk from the Roles field in both places. On `modal_access.yaml:56` that is
consistent with the design's own position (role-less members are legitimate). On
`invite_form.yaml:50` it is a separate product call the design hasn't made: the invite form is where
an admin _chooses_ roles for a new member, and the asterisk is currently the only prompt that they
should. Non-goals says the invite selector "changes only by losing the inert `required: true`" — it
also loses its required marker.

Either state that the asterisk removal is intended in both places, or keep the invite form's
`required: true` for its label effect and note that the enforcement half is inert (which is also the
honest reading of Non-goals' "Repairing `required: true` for array-valued inputs generally" — the
engine wart is the reason the marker and the rule disagree).

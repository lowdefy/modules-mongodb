# UI rework — visual passes, no design decision needed

Bigger than a one-line polish fix, but none of these has an open question about
contract or behaviour. Each is a careful visual pass against the mockups, done
with screenshot verification rather than a blind edit.

Split out from `04-planning/` deliberately: these need **fidelity**, not a
decision.

Finding IDs are stable — carried over from the auth-testing run. Don't renumber.

**Verification status:** all four are from the 2026-07-24 test run and have not
been re-tested since. Confirm each still reproduces before starting.

---

## F25 — User-admin `all` page filter/sort toolbar is misaligned, incoherent, and unclosed

Several layout and styling issues on the Members + Invitations toolbars. All on
`modules/user-admin/pages/all.yaml` and its filter/sort components (notably
`components/all_members_filters.yaml`). Group as one toolbar rework.

**(a) Excel download button is `primary`, should be `default`** — reserve primary
for the page's main action. Same theme as F16 below.

**(b) Segmented selector doesn't vertically align with the other filters** — it
hangs to the top of the row instead of centering with the text input and buttons.
Needs `selfAlign: middle` on the row's children. ⚠️ Not `align: center` on the row:
`align` only accepts `top`/`middle`/`bottom`/`stretch`, and `layout.align` without
`selfAlign` is discarded outright — see F9(b) below for the mechanism and the
existing no-op this trap has already produced.

**(c) Sort selector + order-direction button wrap onto a second row** on the
Members tab instead of sitting inline with the filters — the toolbar row wraps
rather than fitting/flexing.

**(d) Invitations tab: the sort selector and order button are each on their own
line** — worse than the Members tab; same inline-layout problem, more broken.

**(e) Filter input + segmented + clear button don't read as a coherent group**;
the "clear" button in particular looks out of place. Needs a consistent control
grouping and spacing treatment.

**(f) The toolbar and content float directly on the page background with no
card** — reads as unfinished. Wrap the filter bar + table in a card, matching the
tile cards used elsewhere, so it's visually contained.

Individually cosmetic; collectively they make the console's landing page look
unpolished.

---

## F9 — Avatar picker looks unpolished

The user avatar picker (the `profile-avatar` control shown on onboarding and the
profile edit modal) reads as visually rough and needs a design pass.

![Avatar picker](../../../../Screenshot%202026-07-24%20at%2011.54.30.png)

### What's actually wrong

Four separable defects, all root-caused:

**(a) The control is unlabeled and centred, so it floats.** A 72px saturated disc
sits alone above the form with no label and no left edge to relate to. It is the
only unlabeled thing on the page, so it reads as decoration rather than as a
field. Centring is the cause, not the cure — a centred island in a left-aligned
form has nothing to align to.

**(b) It renders left-aligned, not centred as intended.** `onboarding.yaml:49-55`
sets `layout.justify: center` plus `style.flexDirection: column` /
`style.alignItems: center`. **All three are inert**, and for a reason worth knowing
(read from `@lowdefy/layout/dist/{Area,BlockLayout,deriveLayout}.js`, and confirmed
in the built page config):

- A `Box`'s unkeyed `style` resolves to `style.block` — the `BlockLayout` wrapper —
  never to the flex container. The flex container is the `Area` div _inside_ the
  block, so `style.flexDirection` / `style.alignItems` on a Box can't reach it.
- The stacking that _looks_ like `flexDirection: column` working is actually the
  child default: a child block with no `flex`/`span` gets `--lf-span: 24`, i.e.
  full width, so each child takes its own row and sits left.
- `justify: center` does reach `justify-content`, but has nothing to do while the
  children fill the row.

Two traps here, both of which will bite F25(b) as well:

- **`align` only accepts `top` / `middle` / `bottom` / `stretch`** (`ALIGN_MAP` in
  `Area.js`). `align: center` maps to `undefined` — a silent no-op. So
  `modules/deals/components/filter.yaml:51` does nothing today.
- **`layout.align` alone is discarded.** `resolveLayoutAlign` treats `align`
  without `selfAlign` as the deprecated self-alignment usage, warns, and returns
  `undefined`.

The idiom that does work — and what this fix uses — is `selfAlign: middle` on each
child (`ALIGN_SELF_MAP`, which also passes raw CSS values through) plus
`flex: 0 0 auto` so children size to content instead of claiming a full row. Both
are already used in `modules/user-admin/components/invite_email.yaml`.

**(c) The "Change colour" button is solid primary.** `Button.properties.type`
defaults to `primary` (confirmed in the block schema), so omitting
`variant`/`color` yields a solid violet pill that competes with "Save &
continue". `modal_profile.yaml:96` already sets `variant: outlined`; onboarding
does not — the two screens have drifted.

**(d) The avatar is a featureless disc until a name is typed.** Both screens
build initials with an inline `_nunjucks` template that yields `""` for an empty
name, which is the state onboarding _starts_ in. The shared
`generate-avatar-svg.js.njk` already falls back to `?`; the inline copies don't.

### Spec

**Mockup:** `mockups/f9-avatar-picker.html` (rendered: `mockups/f9-avatar-picker.png`) —
every variant below drawn at real width against the app's antd geometry, including
the rejected ones.

**The account mockup already specifies this control** —
`designs/user-account-better-auth/mockups/screens/account.html:261-267`, annotated
"profile-avatar shared component: preview + avatar_colors picker". The
implementation ignored it and copied onboarding's centred column into the modal
instead. Build the mockup's treatment, in both places:

```
[ 64px avatar ]  ·16px·  ┌ Avatar                 ← field label, 13px
                         └ ( ↻ Change colour )    ← small · round · outlined
```

- **Row:** `Box`, `layout: { span: 24, gap: 16 }`, with both children on
  `flex: 0 0 auto` + `selfAlign: middle` — see (b) for why the alignment lives on
  the children rather than on the row.
- **Inner column:** `Box`, `layout: { gap: 6 }`; its two children take the default
  full-width span, which stacks them.
- **Label:** **"Avatar"** — not "Avatar colour", which the account mock drew.
  "Avatar colour" restates the button: it names the _action_ rather than the
  _field_, so it carries nothing the button doesn't already say, and it names the
  wrong thing — the field is the avatar; colour is merely the only part of it
  currently changeable. "Avatar" reads like `First name` → its input, and stays
  correct if the control ever gains more than a colour cycle.
- **Label style:** the form's **field-label** style — 13px, weight 500,
  `--ant-color-text-secondary`, sentence case — not the account mock's
  `.subeyebrow` (11px, uppercase, tertiary). Drawn side by side in
  `mockups/f9-avatar-picker.html#section_label`: the eyebrow is visibly quieter
  than "First name" directly beneath it, so the row reads as a titled sub-section
  — the opposite of the "this is a field" claim the row is making. Both of these
  deviate from `account.html:264`, which stays as-is — it belongs to a completed
  design, and completed designs are read-only history. `mockups/f9-avatar-picker.html`
  is the current spec for this control.
- **Avatar:** 64px on both screens (onboarding drops 72 → 64; at 72 in a 400px
  card the disc dominates everything around it).
- **Button:** `size: small`, `shape: round`, `variant: outlined`.
- **Preview:** drive the `Avatar`'s `src` from the shared
  `generate-avatar-svg.js.njk` (the `contacts` module's pattern) instead of
  hand-rolled `Avatar.content` + a CSS gradient. One initials implementation, `?`
  fallback for free, and the preview then shows exactly the SVG that gets saved
  as `profile.picture`. The njk is shared, not `avatar-preview.yaml` itself —
  that block is fixed at 100px/centred for the contacts form, and parameterising
  its geometry would mean editing contacts to keep its look.
- **State:** the gradient lives in `profile.avatar_color` as `{ from, to }` (what
  the njk reads, and what F14 needs to save). `avatar_color_index` stays as the
  Change-colour cursor only. Hosts seed the gradient with
  `modules/shared/profile/avatar-picker-seed.yaml`, which fills palette index 0
  and is `skip`-guarded so a colour loaded from the database is never overwritten
  — without a seed the njk falls back to its grey defaults, which reads as broken
  rather than as unchosen.
- **Alignment:** left, on the form's own left edge. Nothing centred.
- **Grounding:** `marginBottom: 20` on the row, on top of the auth card's own 16px
  block gap (the mock's `.avatar-edit { margin-bottom: 20px }` inside
  `.auth-blocks { gap: 16px }` — same 36px total). No tinted panel, no separator —
  the label and the left edge are what ground it.

**Extract to one shared component,** `modules/shared/profile/avatar-picker.yaml`,
consumed by `pages/onboarding.yaml` and `components/view/modal_profile.yaml`. The
pattern is currently inlined twice (~55 lines each, cycle action included) and has
already drifted on the button variant and the avatar size — exactly what a shared
component prevents. Do **not** name it `profile-avatar`: that name is taken by
user-account's exported header-dropdown avatar (`layout/components/page.yaml:58`).

`contacts/components/form_profile.yaml` has the preview with no control at all
(colour is randomised on init, `contacts/pages/new.yaml:33`). It can adopt the
component later; giving contacts a colour choice is a behaviour change and needs
its own decision, so it is out of F9's scope.

### Rejected alternatives

All of these are drawn in `mockups/f9-avatar-picker.html`, so the rejections are
checkable rather than asserted.

- **Swatch grid of the full palette.** `avatar_colors` has 20 gradient _pairs_ —
  two rows of ten at 18px, and drawn in the real 400px card it becomes the loudest
  thing on a page whose job is to collect a name. At that size the gradients read
  as muddy solids: pairs 1/13, 2/18 and 5/19 are barely distinguishable, so the
  precision it offers is precision the eye can't use. The concrete need is "not
  this colour", which cycling already serves.
- **No label at all** (`#label_none` in the mockup). Worth taking seriously, since
  most of the grounding comes from the left edge and the horizontal pairing rather
  than from the label — it is already far better than the centred island. Rejected
  because with nothing above it the small pill floats against the middle of a 64px
  disc and the pair reads as a toolbar, and it would still be the one row on the
  form without a label.
- **Click the avatar to cycle** (`Avatar` does support `onClick`). Undiscoverable
  with no visible affordance, and two triggers for one action.
- **Name + email preview beside the avatar.** On onboarding the name is blank at
  first render, so it would read "Your name"; in the modal the form and tile
  already show both. No concrete need.
- **Centred + outlined** (the read that prompted this pass). A genuine improvement
  over what shipped, but it keeps the unlabeled island, which is the actual
  complaint.

### Status — implemented 2026-07-28

Built as specced above. `modules/shared/profile/avatar-picker.yaml` +
`avatar-picker-seed.yaml` are new; `pages/onboarding.yaml` and
`components/view/modal_profile.yaml` each drop ~55 inlined lines for one `_ref`.

Verified: `pnpm ldf:b` clean; the built page config confirms `_module.var:
avatar_colors` resolves inside the shared fragment (the palette inlines as 20
entries, `_array.length` folds to `20`, the seed folds to
`{from: '#c62828', to: '#ad1457'}`); onboarding screenshotted against the mockup
and matches, including the `?` fallback. **The modal was not visually confirmed** —
it needs an Edit click, which the screenshot tool can't do and the Chrome extension
wasn't connected for. Its host page renders with no client errors and it `_ref`s
the identical component, so the residual risk is only the 560px/two-column context
the mockup already drew.

### ⚠️ Side effect on the write path — needs a decision

Moving the gradient into the `profile.` subtree was forced (the shared SVG preview
reads `profile.avatar_color`; there was no way to build the specced preview on the
old `avatar_color_index`-only state). But both hosts save with
`payload: { profile: { _state: profile } }` — the whole subtree — and
`shared/contact/write-profile.yaml` `$mergeObjects`-es it onto the contact. So
**`profile.avatar_color` now persists**, where before it never left page state.

That is the right field in the right place — `contacts` stores exactly this — but
it is only half a working picker, because **every avatar in the app renders from
`profile.picture`** (denormalized to `user.image` by write-profile), and nothing in
the user-account save path regenerates it. `contacts` does:
`pages/edit.yaml:128` and `pages/new.yaml:88` both run a `generate_avatar` SetState
that rebuilds `profile.picture` from the njk immediately before the save call.

Consequences as it stands:

- A user completing onboarding stores a colour and no picture — avatars fall back
  to the Avatar block's icon. Same as before this change; the colour is simply
  recorded now.
- A user who already _has_ a picture (a contacts-created contact) and changes the
  colour in the profile modal stores a new `avatar_color` against the old
  `picture` — the two disagree, and the visible avatar doesn't change.

**Decision needed, deliberately not taken here:** adding the `generate_avatar`
SetState before `save_profile` in both hosts (~8 lines, copying the `contacts`
pattern) closes the loop and makes the picker actually work end-to-end. That is
F14's fix, not F9's, and it changes what the app writes to the database — so it is
the user's call, not an inference to make while doing a visual pass. Until then,
F14 is reduced to exactly that one step.

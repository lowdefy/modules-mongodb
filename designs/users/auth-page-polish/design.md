# Auth-page consistency & polish

The public auth pages (signup, login, verify-email, forgot/reset-password, two-factor,
two-factor-enrol, onboarding, accept, logout) all render through the shared `layout` module
`auth-page` shell, but they don't look like one coherent flow: the card jumps width mid-flow,
the brand logo sits in a heavy gradient band on every page whether the consumer's logo suits it
or not, and the two-factor enrolment page in particular is cramped and hard to use. This design
makes the shell enforce one consistent look, gives consumers a single app-wide choice of brand
treatment, and rebuilds the enrolment page around the standard card width.

Addresses **F32** (auth-page visual polish & card-width consistency) and **F49** (TOTP manual
key too long).

## Proposed change

- **One standard card width.** Raise the `auth_page.max_width` default from `360` to `420` and
  remove the per-page `max_width: 560` overrides on `two-factor-enrol` and `onboarding`;
  restack both pages to fit the standard width.
- **Brand treatment becomes a consumer choice.** Add a shell var `auth_page.logo_style`
  (`band` | `minimal`, default `band`) that the `auth-page` shell applies to **every** page —
  so a deployment is uniform, and a consumer whose logo reads badly reversed-out on the violet
  gradient can opt into the bandless `minimal` treatment.
- **Rebuild the two-factor enrolment page** at the standard width: QR as the clear primary
  path, the manual key moved behind a default-collapsed "Can't scan?" disclosure and rendered
  in 4-char chunks (F49), and the scan step stacked in one column.
- **Enter-to-submit on every code input** (enrol confirmation, Manage-modal confirmation,
  sign-in TOTP, backup code) via `onPressEnter`.
- **Normalize heading treatment** across the pages so titles share one level and spacing.
- **Delete dead config**: the unexported `auth-page-copy.yaml` split-screen layout and the
  `auth_page.brand_panel_background` var it alone consumes.

See the mockups in [`mockups/`](./mockups/): `logo-variation.html` (band vs minimal, same page
both ways) and `enrol-redesign.html` (the rebuilt enrolment page, three phases).

## Key decisions & rationale

### Card width: one standard, not tokens or per-page overrides

The shell defaults the card to `max_width: 360`; `two-factor-enrol` and `onboarding` override to
`560` because each tried to fit content on one row (enrol: QR _beside_ the manual key + code;
onboarding: honorific + first + last name on one row). The visible width jump mid-flow is the
core inconsistency.

**Decision:** one standard width (`420`), and redesign the two wide pages to fit it, rather than
named size tokens (`narrow`/`wide`) or keeping the overrides. Named tokens would still let the
width change within a single flow — deliberate, but not consistent. `420` sits in the industry
norm for a single-column auth card (GitHub ~340, Google ~450, Stripe ~400); `360` was a touch
narrow. The `max_width` var stays so a consumer can still tune it — we change the default and
drop the page-level overrides.

- **enrol** restacks vertically (the universal TOTP-setup pattern — QR on top, code below, key
  behind a disclosure), which fits `420` comfortably. See the enrol section below.
- **onboarding** lays honorific + first + last on one row via the shared `form_core.yaml`. At
  `420` that row is tight; restack it (honorific as a narrow inline field, or honorific on its
  own row above the names). **Constraint:** `form_core.yaml` is shared with the profile edit
  modal — verify the restacked layout reads well in both, or parameterize the honorific span.

### Brand treatment: a shell var, applied uniformly

The shell renders the brand logo inside a colored gradient **cover band** at the top of every
card (`auth-cover` box, `cover_background` gradient, 160px logo). On interior/flow pages the band
reads heavy, and — more concretely — the module ships to different clients, some of whose logos
will not sit well reversed-out on the violet gradient.

**Decision:** make the treatment a single **consumer-level** choice, not a per-page split.
A per-page rule (band on entry pages, minimal elsewhere) was considered and rejected: it trades
one inconsistency (heavy band) for another (band on login, none on reset within the same flow).
A uniform, consumer-selected treatment is the "one correct way" — every page in a deployment
matches, and the consumer picks what suits their brand.

New shell var:

```yaml
auth_page:
  logo_style:
    default: band
    enum: [band, minimal]
    description: >-
      Brand treatment applied to every auth page. `band` renders the logo in the
      gradient cover band (default). `minimal` renders a small logo centred above
      a bandless card — for logos that read poorly reversed-out on the cover
      gradient, or a lighter look.
```

The `auth-page` shell branches on it: `band` keeps today's `auth-cover` slot; `minimal` drops
the cover and renders a small logo block above the card (centered, ~26–40px, `logo.primary`).
`cover_background` and `logo_max_width` stay — they tune the `band` variant. Default `band`
leaves every existing deployment visually unchanged.

### Two-factor enrolment: QR-first, key behind a disclosure, 4-char chunks

The enrol page (`two-factor-enrol.yaml`) is the worst offender: the scan row crams the QR beside
the manual key and code input, which is why it needs `560`. F49 adds that the manual key is a
**52-char base32 string** and wraps badly.

**F49 secret length — verified, not configurable.** BetterAuth (`better-auth@1.6.23`) generates
the TOTP secret as `generateRandomString(32)` in
`dist/plugins/two-factor/index.mjs:89` — a hardcoded 32-byte (256-bit) secret, whose base32
form is 52 chars. `totpOptions` exposes only `digits`, `period`, `allowPasswordless`, `disable`,
and backup-code options — **no secret-length option**. Dropping to the RFC-standard 160-bit
(~32 chars) would require patching or forking BetterAuth, which isn't worth it. So F49 is
resolved **display-side only**.

**Decision — rebuild the scan step as a single column** (fits `420`):

1. **QR is the primary path**, centered and prominent, with the 6-digit code input directly
   below it.
2. **Manual key behind a default-collapsed disclosure** ("Can't scan? Enter this key instead").
   The QR is what nearly everyone uses; the long key shouldn't be the first thing they see.
3. When expanded, the key renders **grouped in 4-char chunks** (13 chunks for the 52-char
   secret) as monospace pills that wrap cleanly — fixing F32's "wraps badly" and F49's
   legibility point together. Keep it a copyable `Paragraph`/block (browsers can't select text
   in a disabled input).

The password and done phases stack fine at `420` already; only the scan row changes shape.

### Enter-to-submit on code inputs

`TextInput` exposes an `onPressEnter` event. Wire it on every code field so Enter submits:

- `enrol.confirmation_code` (`two-factor-enrol.yaml`) → confirm & enable
- `enroltotp.confirmation_code` (`modal_enroltotp.yaml`) → confirm & enable
- the sign-in TOTP code and `backup_code` inputs (`two-factor.yaml`) → verify

Each `onPressEnter` runs the same action chain as the page's primary button.

### Heading treatment

Only `login` passes a heading to the shell (`title: Sign in`); every other page passes
`title: ""` and hand-rolls its own `Title` block. Several pages legitimately swap headings per
state ("Check your email", "This link has expired"), which the single shell `title` var can't
express — so **titles stay in-block for state-aware pages**. The consistency win is uniform
typography and spacing: standardize every heading on `Title` level 3 with the same top margin,
and stop `login` being the lone page that routes its resting title through the shell var. Keep
the shell `title` var (it's exported surface) but treat in-block titles as the norm.

### Dead config removal

`modules/shared/layout/auth-page-copy.yaml` is an unexported split-screen ("brand panel +
form panel") alternate — nothing references it (`layout` exports only `auth-page`). The
`auth_page.brand_panel_background` var is consumed by that file alone. Delete both.

## Known limitation — one-time-code autocomplete (out of scope)

F32 asked for `autocomplete="one-time-code"` (and `inputMode="numeric"`) on the code inputs so
password managers stop offering saved passwords for them. **This can't be done in YAML today:**
`TextInput` has `additionalProperties: false` and exposes no `autoComplete`/`inputMode` prop, and
`class`/`style` can't set HTML attributes. Fixing it needs an upstream `TextInput` enhancement
(or a small local input plugin) that forwards these attributes. Tracked as a follow-up, not
built here.

## Files changed

- `modules/layout/module.lowdefy.yaml` — add `auth_page.logo_style`; change `auth_page.max_width`
  default `360 → 420`; remove `auth_page.brand_panel_background`.
- `modules/shared/layout/auth-page.yaml` — branch cover vs above-card logo on `logo_style`.
- `modules/shared/layout/auth-page-copy.yaml` — delete.
- `modules/user-account/pages/two-factor-enrol.yaml` — remove `max_width: 560`; rebuild scan
  step (QR primary, key disclosure, 4-char chunks); `onPressEnter` on confirmation code.
- `modules/user-account/pages/onboarding.yaml` — remove `max_width: 560`; restack profile row.
- `modules/user-account/pages/two-factor.yaml` — `onPressEnter` on TOTP + backup-code inputs.
- `modules/user-account/components/view/modal_enroltotp.yaml` — 4-char chunk key display;
  `onPressEnter` on confirmation code.
- `modules/user-account/pages/*.yaml` — heading-treatment normalization pass.
- `docs/` + `pnpm docs:gen` — regenerate `layout` vars.md for the new/changed vars.
- `apps/demo/` — exercise `logo_style: minimal` on a build-verified example (see below).

## Demo consumer

`auth_page.logo_style` is new consumer-facing surface, so it needs a demo consumer. The demo
currently uses all `auth_page` defaults (`band`). Add a build-verified example that sets
`logo_style: minimal` — either on the demo app's `layout` entry (if a single treatment is
acceptable demo-wide) or via a note/second configuration — so both variants have a worked
reference and resolve end-to-end under `ldf:b`.

## Non-goals

- Shortening the TOTP secret (BetterAuth-fixed; see above).
- The one-time-code autocomplete attribute (needs an upstream block change).
- Any change to auth _logic_ / flow — this is shell + presentation only.
- Reviving or replacing the split-screen `auth-page-copy` layout.

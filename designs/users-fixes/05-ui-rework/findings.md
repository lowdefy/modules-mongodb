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
Needs `align` / `selfAlign` on the toolbar row.

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

## F16 — Card action buttons render primary-tinted; the wireframe specifies the default (untinted) type

On `/user-account/view` the buttons inside the tile cards (e.g. the Security
tile's Manage / Set up / Disable, and peers) appear in the primary colour, whereas
the mockup shows them as the neutral **default** Button type. Primary should be
reserved for the page's main action, not every card control.


---

## F18 — Active-sessions list shows the raw User-Agent string and bare IP instead of the humanised form in the mockups

The Sessions surface renders e.g.
`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like
Gecko) Chrome/150.0.0.0 Safari/537.36` / `127.0.0.1 · expires 2026-07-31`
verbatim, whereas the mockups show a friendlier rendering — parsed browser + OS
(e.g. "Chrome on macOS") and a nicer location/time treatment.

Add a User-Agent parse and presentation layer for the session rows: browser / OS /
device from the UA, plus tidy IP and expiry copy.

Applies to **both** the account workspace Sessions tile and the user-admin `view`
Security tile if they share the rendering — check before implementing, and prefer
one shared renderer over two.

---

## F9 — Avatar picker looks unpolished

The user avatar picker (the `profile-avatar` control shown on onboarding and the
profile edit modal) reads as visually rough and needs a design pass.

![Avatar picker](../../../Screenshot%202026-07-24%20at%2011.54.30.png)

⚠️ **Needs a spec before it can be actioned.** "Looks like rubbish" isn't
something an agent can implement against. Write down the specifics — spacing,
sizing, colour-swatch layout, selected state — or point at the mockup that
supersedes it. Until then this is a note, not a task.

Low priority / cosmetic.

**Distinct from F14** (`04-planning/`), which is that the picker's output is never
saved. F9 is purely how it looks. Note that F14 is the more valuable fix — the
picker currently has no functional effect at all.

# F32 — Auth-page visual polish & card-width consistency

**Status:** `needs-design` · **Area:** layout / user-account (auth-page shell)

Umbrella finding for **visual polish and consistency across the public auth pages** (signup,
login, verify-email, reset, two-factor, two-factor-enrol, onboarding, accept, logout). All of
these render through the shared `layout` module `auth_page` shell, so fixes belong there —
the shell is the single chokepoint that enforces one look across every page. Individual
page-polish nits go here rather than spawning a finding each.

## Observations so far

1. **Inconsistent auth-card width.** The `auth_page` shell defaults the card to
   `max_width: 360` (layout `module.lowdefy.yaml`), but `two-factor-enrol` and `onboarding`
   override to `max_width: 560` (the enrol page needs the wider card so the QR scan row fits
   on one line — see its inline comment). The result is two visibly different card widths as
   the user moves through a single flow, which reads as inconsistent. **Open decision:** pick
   a better solution than per-page overrides — e.g. a small set of named size tokens
   (`narrow` / `wide`), or one standard width the scan row is designed to fit, so widths are
   deliberate and consistent rather than ad-hoc.

2. **Logo on every auth page.** The shell renders the brand logo on every auth page. Showing
   it on each step (not just the entry page) reads as heavy/"lame". **Open decision:** whether
   to drop it from interior/flow pages, show it once, or make its presence a shell option.

3. **Add-2FA (`two-factor-enrol`) page needs polish.** General UI polish called out on the
   enrolment page. Specifics observed so far:
   - **Enter does not submit** the TOTP confirmation code — the `enrol.confirmation_code`
     input has no submit-on-Enter, so the user must click **Confirm & enable**. (Likely
     applies to the sign-in challenge code input too — check both.)
   - **Browser password-manager mis-classifies the confirmation-code input.** Chrome /
     Google Password Manager treats the code field as a **password field**: it prompts to
     autofill a saved password and offers old stored values. The field should declare
     `autocomplete="one-time-code"` (and likely `inputMode="numeric"`) so the browser treats
     it as a one-time code, not a credential. Reported on the enrol page; **likely also
     affects the Manage modal's code input** (`modal_enroltotp`) and possibly the sign-in
     challenge code input — check all three.
   - The **`code: true` manual-key Paragraph wraps badly** (the base32 secret / "Can't scan?
     Enter this key" area).
   - General polish pass wanted on the page overall.

4. **Login expired-link notice copy — drop the em-dash.** The retryable magic-link notice
   ("Link expired / This link has expired or was already used — request a new one below.")
   uses an em-dash that reads badly and produces an awkward word-break. Replace with a
   sentence break (period, or a separate line) across the login notice-alert copy.

## The open question

Two real design decisions before any of this is built: (a) the auth-card **width model**
(standard width vs named size tokens vs keep per-page overrides), and (b) **logo placement**
across the flow. Both are shell-level (`layout` `auth_page`), so whatever is decided is
applied once and inherited by every page. Collect further per-page polish nits here as the
campaign surfaces them, then promote to a single auth-page-polish design.

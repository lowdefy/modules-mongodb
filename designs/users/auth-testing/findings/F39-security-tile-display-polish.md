# F39 — Security-tile display polish: passkey rows (raw `multiDevice`, casing) + optional passkey naming

**Status:** `enhancement` · **Area:** user-account / security tile

Presentation nits on the signed-in **account-workspace tiles** (Security + Sessions), gathered
on the run. Distinct from [F32](./F32-auth-page-visual-polish.md), which covers the public
**auth-page shell**; this is the in-app tiles.

A passkey row currently renders as:

```
Passkey
multiDevice · added 2026-08-06
```

## Observations

1. **Raw `deviceType` enum leaks into the UI.** The `multiDevice` string is the WebAuthn
   `deviceType` (`singleDevice` | `multiDevice`), rendered verbatim
   (`tile_security.yaml:339`, `{{ device }}` from `passkeys_ui.$.device`). It's developer
   jargon, not user-facing copy — **probably should not be shown at all** (or humanized if it
   earns its place). Reporter's lean: drop it.
2. **Casing inconsistency.** The passkey row says lowercase "**added** {date}", while an
   active session row says "**expires in** 7 days". Pick one convention (sentence-case labels,
   or consistent lowercase relative phrases) and apply it across security-tile metadata lines.
3. **Passkey naming (open question).** A `name` field already exists on the row
   (`passkeys_ui.$.name`, currently defaulting to "Passkey"), and BetterAuth supports naming
   passkeys. Decide whether to let users **name their passkeys** (e.g. "MacBook Touch ID",
   "iPhone") — increasingly common UX, and more useful than a raw device type for
   distinguishing multiple passkeys. If adopted, this replaces the value of showing
   `deviceType` in (1).

4. **Sessions-tile explainer mentions a button that isn't there (single session).** The
   Sessions card always shows: _"Devices currently signed in to your account. 'Sign out others'
   ends every session except this one."_ But the **Sign out others** button only renders when
   there are multiple sessions, so with a single session the copy references a control the user
   can't see — mildly confusing. Fix: gate the "Sign out others …" sentence on the same
   multiple-sessions condition as the button, or soften the copy when only one session exists.

## Open decision

- Drop or humanize `deviceType` in the passkey row.
- Settle a single casing/labelling convention for security-tile metadata (passkey "added",
  session "expires in …", etc.).
- Decide whether user-named passkeys are in scope; if yes, add a name input at register time
  and an edit affordance, and render the user name instead of the default "Passkey".
- Gate the Sessions-card "Sign out others" explainer sentence on the multiple-sessions
  condition so it doesn't reference a missing button.

# F39 — Security-tile display polish: passkey rows (raw `multiDevice`, casing) + optional passkey naming

**Status:** `enhancement` · **Area:** user-account / security tile ·
**Disposition:** passkey-row work **held for an upstream `PasskeyUpdate` action**; Sessions-explainer nit is independent (see below)

Presentation nits on the signed-in **account-workspace tiles** (Security + Sessions), gathered
on the run. Distinct from [F32](../../_completed/auth-page-polish/F32-auth-page-visual-polish.md), which covers the public
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

## Decisions

**Passkeys should be user-nameable, with a rename affordance** — the full ask in (3). A
user-supplied name is the distinguisher that actually works across multiple passkeys; it
replaces the value of showing `deviceType` (1).

**Drop `deviceType`, don't humanize it.** WebAuthn `deviceType` is _backup-eligibility_ (is
this a synced/multi-device passkey), **not** a device identity — humanized ("Synced passkey" vs
"This device") it still fails the job, because two synced passkeys read identically. It carries
no user value, so it goes.

**Casing resolves for free once `deviceType` is dropped.** Rule: a sub-line's first visible word
is capitalised (`Added 2026-08-06`); a `· `-separated trailing segment is a lowercase
continuation (`192.0.2.1 · expires in 6 days`). With the device segment gone, the passkey
sub-line stands alone → `Added` (capital), and the session sub-line is a continuation →
lowercase `expires` — consistent _by position_, no live string changes. (Note: the finding's
snapshot showed lowercase "added"; a later copy sweep already capitalised it, so only the
device-drop is needed to close (2).)

**Sessions explainer** (4): gate the second sentence on the button's own condition
(`_gt: [ _array.length get_sessions, 1 ]`), so single-session users see only _"Devices currently
signed in to your account."_ Softening the copy would leave it vaguer for everyone.

## Disposition — passkey work waits on an upstream `PasskeyUpdate` action

The **rename affordance cannot ship in-module** and, because it also settles the naming UX, the
whole passkey row waits with it — deliberately, to avoid building the naming entry point twice.

- **Rename has no in-repo path.** BetterAuth's `updatePasskey({ id, name })` exists server-side
  (`POST /passkey/update-passkey`, `@better-auth/passkey@1.6.23`) and is **ownership-enforced**
  (`requireResourceOwnership` — a caller can only rename their own), so the mechanism is right.
  **But** Lowdefy's client (`@lowdefy/client` `createAuthMethods`) wraps only `passkeyRegister` /
  `passkeyDelete` / `passkeySignIn`, and `@lowdefy/actions-core` ships no `PasskeyUpdate` action.
  Those are published framework packages this repo _consumes_ — the wrapper can't be added here.
  A native write over `user-passkeys` is out: the connection is deliberately `write: false`
  (_"all writes to auth-owned data go through BetterAuth … never this connection"_).
- **Naming can't be settled without rename on the table.** Register-time naming _is_ feasible
  in-module today (`PasskeyRegister` forwards `params` → `addPasskey({ name })`; `get_passkeys`
  already projects `$name`). But with rename available the better shape may be **register in one
  tap, then rename via a pencil** — making a pre-ceremony name modal redundant friction. Building
  that modal now risks throwing it away. So the naming entry point is designed _with_ rename.

**When the `PasskeyUpdate` action lands** (same shape as the sibling
[passwordless-2fa-management](../../../passwordless-2fa-management/design.md) engine bump), build
the passkey row in one pass: drop `device` from `get_passkeys.yaml` (and the identical leak in
`user-admin`'s `get_user_passkeys.yaml` + `modal_revoke_passkeys.yaml:102`), add the naming entry
point + a per-row rename pencil (`PasskeyUpdate { passkeyId, name }` → `refetch_account`, a clone
of the existing per-row delete wiring), rendering the user name in place of "Passkey".

**Independent of the above:** the Sessions-explainer gate (4) has no passkey coupling and can
ship standalone at any time, or ride the same pass.

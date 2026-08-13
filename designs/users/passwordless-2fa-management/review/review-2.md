# Review 2

_Re-review after the design folded in review-1 (all seven findings annotated resolved). This pass
verifies the current design against the installed engine and focuses on what the revision now
rests on. One finding is load-bearing for the whole design; two are smaller notes on Decision 3._

### 1. The server-side waiver the whole design depends on isn't wired in the installed engine — `allowPasswordless` is never passed to the twoFactor plugin, so Decision 1 does **not** "ship independently"

> **Resolved.** Confirmed against the installed engine: `getBetterAuthConfig.js:385` builds
> `twoFactor({ issuer, schema })` with no `allowPasswordless`, `grep -c` is `0` in all six builds
> (incl. the pinned Aug-7 one), and `shouldRequirePassword` short-circuits `if (!allowPasswordless)
return true` (`password.mjs:27`) — so today it returns `true` for every caller and the `password:
''` waiver buys nothing. Decision 1's in-module YAML is correct but not sufficient; the design's
> "Decisions 1 & 3 ship now / no engine dependency" claim was false. Reframed: this design now
> **owns** the `allowPasswordless: true` wiring as a second `@lowdefy/api` change, symmetric with
> Decision 2's `pageId` forwarding — both land in one engine bump. Status, "The mechanism the module
> got wrong" (new "The flag is a prerequisite" paragraph), Decision 1 ("Engine prerequisite"),
> Upstream (retitled plural, new first bullet + corrected "not a hard blocker"), and Files-changed
> all updated. Only Decision 3 ships independently now; until the bump lands, passkey is the sole
> passwordless enrol route. The lifecycle design records the platform as already setting the flag
> (line 273), so the shipped engine has lost or never carried it.

The design's single mechanism — send `password` as `''` for a passwordless caller and let
`allowPasswordless` waive it server-side ("The rule", lines 36–40; the coalesce, lines 92–97) —
assumes `allowPasswordless: true` is live on the BetterAuth twoFactor plugin. Against the engine
this repo actually builds on, **it is not.**

`shouldRequirePassword` short-circuits on the flag: `if (!allowPasswordless) return true;`
(`better-auth/dist/utils/password.mjs:27`). So the waiver only exists when the plugin is
instantiated **with** `allowPasswordless`. But the file that instantiates it —
`@lowdefy/api/.../routes/auth/getBetterAuthConfig.js:385` — builds it as:

```js
options.plugins.push(
  twoFactor({
    issuer: appMeta?.name,
    schema: { twoFactor: { modelName: modelNames.twoFactor } },
  }),
);
```

No `allowPasswordless`. I checked **all six** installed `@lowdefy/api` builds (incl. the latest,
`0.0.0-experimental-20260807075508`, dated Aug 7): `grep -c allowPasswordless getBetterAuthConfig.js`
is `0` in every one. The string appears in the engine only as a **comment** —
`resolveAuthentication.js:166`, "Lowdefy sets allowPasswordless: true, so TOTP is reachable by them
too" — which asserts the intent the plugin config never realizes. The lifecycle design this design
leans on specifies the wiring precisely (`two-factor-lifecycle/design.md:366` "Lowdefy sets it
unconditionally in `getBetterAuthConfig` (`:352`)"; its ship-list `:943` maps
`allowPasswordless: true` → `getBetterAuthConfig.js` twoFactor options) — but that change has not
shipped to (or has regressed in) the `@lowdefy/api` this repo consumes.

Consequence: with `allowPasswordless` undefined, `shouldRequirePassword` returns `true` for **every**
caller, and `TwoFactorEnable` / `TwoFactorDisable` / `TwoFactorGenerateBackupCodes` throw
`INVALID_PASSWORD` the moment they receive `''` (`two-factor/index.mjs:82-83`, and the sibling
handlers verified at `:156`, `backup-codes/index.mjs:241`). So a passwordless caller sending the
coalesced `''` is rejected exactly as before — the lockout Decision 1 sets out to fix is **not
fixed**. This directly contradicts the design's headline claim ("Decisions 1 & 3 are in-module and
shippable now", line 3) and the Upstream section ("Decisions 1 and 3 carry **no** engine
dependency and ship independently", lines 250–253). Decision 1 has a hard engine prerequisite at
least as fundamental as Decision 2's `pageId`-forwarding one — it just isn't named.

Fix: treat "the engine actually passes `allowPasswordless: true` into the twoFactor plugin options"
as an explicit, verified prerequisite for Decision 1 (not an assumed-live fact). Confirm whether the
shipped `@lowdefy/api` is missing the wiring the lifecycle design specified (it appears to be) and,
if so, land/​bump that engine change and re-verify `shouldRequirePassword` returns `false` for a
credential-less caller before calling Decision 1 shippable. Until then, `''` buys nothing and the
Status/Upstream claims about Decision 1 being engine-independent are wrong.

### 2. Decision 3 removes the page's only reader of the session fact but the two `UpdateSession` calls it keeps are still load-bearing — pin that, or a later refactor drops them and the loop returns

> **Resolved.** Confirmed against the installed engine, and it also exposed an imprecision worth
> fixing: the `required` gate does **not** recompute from the DB for TOTP (as Decision 3 stated) —
> `createAuthorizeOutcome` reads `user.two_factor_enrolled`, which `resolveAuthentication` derives
> from a fresh `getSession` (`session.user.twoFactorEnabled` for TOTP, a DB passkey `count` only for
> the unenrolled-TOTP case, `resolveAuthentication.js:171-185`). So the `UpdateSession` calls are
> exactly what let Continue's `required`-gated destination admit the just-enrolled TOTP caller — drop
> either and the loop returns. Decision 3 now (a) corrects the "from the DB" mechanism, (b) pins the
> invariant in a dedicated paragraph, and (c) records it in the rewritten header-comment note.

Decision 3 replaces `_user.two_factor_enrolled` across all seventeen blocks with the local
`enrol.done` flag, set `true` in the two success chains **after** their `UpdateSession`
(`refresh_enrol_session`, `two-factor-enrol.yaml:310-311`; `enrol_passkey_session`, `:183-184`).
After that change the page reads **no** session fact anywhere — but `enrol_continue` still fires
`Link { home: true }` (`:429-432`) to a `required`-gated destination, and that gate recomputes
enrolment per request from the session. The `UpdateSession` calls are what refresh the session so
the destination admits the caller; drop them and Continue bounces straight back — F48 #2's loop,
reintroduced.

The design keeps them implicitly (it anchors the `enrol.done: true` write to those chains) but never
records **why** they must stay once the page stops reading `_user`. That's precisely the non-obvious
invariant the design (source of truth for rationale) should pin: a future reader who sees the page no
longer references the session fact will read `UpdateSession` as dead and remove it. One sentence in
Decision 3 / the rewritten header comment — "`UpdateSession` stays load-bearing for Continue's
navigation even though the page no longer reads the session fact" — closes it.

### 3. Decision 3's premise "the only legitimate route to done is completing enrolment here" isn't airtight — an already-enrolled caller who reaches the page now sees the re-enrol form, not a done state

> **Accepted (documented).** Confirmed the arrival path: `createAuthorizeOutcome.js:64-71` falls
> through to `allow` for an enrolled caller (`two_factor_enrolled === false` is false), so the Back
> button / manual nav reaches the page, `seed_enrol` re-seeds `enrol.done: false`, and the enrol form
> renders — a Generate-QR there would replace the working authenticator. Named in Decision 3 as a
> deliberate tradeoff: on arrival this caller is indistinguishable from the disabled-elsewhere
> stale-truthy population that must see the form, so defaulting to the form is the correct casualty.
> Not a defect to fix.

Decision 3 justifies dropping the ambient fact with "The page was reached _because_ the gate said
'not enrolled'" (lines 178–180). But an **already-enrolled** caller can reach the page: the page gate
is `public: false` + role, and for an enrolled caller the enrolment branch doesn't fire
(`enrolmentRequired && two_factor_enrolled === false` is false), so `authorizeOutcome` falls through
to `allow` (`createAuthorizeOutcome.js:64-71`). Reaching it via the browser Back button right after
clicking Continue, or by manual navigation, re-runs `seed_enrol` (`enrol.done: false`), so the
pre-done blocks (`_not: enrol.done`) render the **enrol form** and the done cluster stays hidden.
Under the old ambient-fact gating such a caller saw the graceful "Two-factor is set up" + Continue
state; Decision 3 shows them a fresh "Add a second factor" form whose Generate-QR path would silently
**replace** their working authenticator (enable deletes and recreates the twoFactor row).

This is likely the acceptable casualty, not a defect to fix: the genuinely-enrolled Back-button
caller and the disabled-in-another-session stale-truthy caller (lines 190–194) both arrive with
`_user.two_factor_enrolled === true` but want opposite screens, and only a fresh per-request gate
read distinguishes them — so defaulting to "show the form" is the safer choice for the population
F48 #2 is actually about. The gap is that the design names only the stale-truthy-disabled case and
states its premise as airtight. Name the already-enrolled arrival as a **known, deliberate** tradeoff
(done-state no longer shown on re-arrival; acceptable because it's indistinguishable on arrival from
the disabled-elsewhere population that must see the form), so the next reader doesn't rediscover it as
a regression.

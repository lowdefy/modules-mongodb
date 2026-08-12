# F33 — Onboarding save routes on a stale `_user`, so the guard bounces back to onboarding

**Status:** `root-caused` · **Area:** platform (auth shell) / session-freshness · **upstream**

After completing onboarding and hitting **Save & continue**, the page reloads but the user
**stays on onboarding**. Manually navigating to home afterwards works. Reproduced on the
current experimental release (`20260807075508`). A prior fix (F19,
`update-session-store-refresh`) did not resolve it.

## Root cause — a platform bug in the emitted auth shell, not the module

The module's onboarding submit sequence is correct and does not need reordering:

1. `Validate`
2. `CallAPI update-profile` — writes `profile.profile_created: true` (awaited)
3. `UpdateSession` (`refresh_session`)
4. `Link { home: true }`

The engine awaits each action (`@lowdefy/engine` `Actions.js` — `await this.actions[type](...)`),
so `Link` runs only after `UpdateSession` resolves. `UpdateSession` refreshes the session,
re-resolves the caller, and imperatively sets `lowdefy.user`. On paper `_user.profile.profile_created`
should be `true` by the time the router evaluates. It isn't — because of how the generated
auth shell propagates the refreshed caller.

The defect lives in **platform-emitted code** (`.lowdefy/server/lib/client/auth/AuthConfigured.jsx`

- `@lowdefy/client` `initLowdefyContext.js`), which the module and app cannot change:

* `_user` ultimately reads `auth.user`, computed in `<Session>` as
  `{ ...normalizeCaller(session.user), ...resolved }` — **`resolved` (the ref) wins on key
  conflicts.** `profile` lives in `resolved`.
* `UpdateSession` → `updateSession()` calls `updateResolvedUser(fresh)`, which **only writes a
  ref** (`resolvedUserRef.current = fresh`) — deliberately, per the shell's own comment. A ref
  write **schedules no re-render**, so the fresh caller does not fold into `auth.user` until
  `<Session>` next renders for some other reason.
* Because `resolved` wins the merge, in that window `auth.user` is
  `{fresh session.user} masked by {stale resolved ref}` → `profile.profile_created` reads
  **stale**.
* `updateSession` also sets `lowdefy.user` imperatively as a bridge — but `Link` re-renders
  `<Client>` for the router page, and `initLowdefyContext.js` unconditionally re-runs
  `lowdefy.user = auth?.user`, **overwriting the imperative fresh value with the stale
  `auth.user`**.
* Router `onMount` reads the stale `_user.profile.profile_created` (absent) → bounces to
  onboarding. **A later manual navigation works** because by then `<Session>` has re-rendered
  (atom settle / effect) and folded the fresh ref into `auth.user`.

This is why F19's `update-session-store-refresh` fix didn't hold: that fix made the session
_store_ re-resolve correctly (and it does — the server live-joins the user row and returns fresh
`profile_created`), but the client-side propagation from the resolved-user ref into `auth.user` /
`lowdefy.user` never reaches the router on the first navigation.

## Escalation — fix is upstream (platform)

No module change resolves this. The fix belongs in the platform auth shell. Candidate approaches
(the platform's to choose):

- Make `updateResolvedUser` schedule a render (hold the resolved caller in state, not a bare ref),
  so `auth.user` reflects it before the next navigation; or
- Stop `initLowdefyContext` from clobbering an imperatively-set `lowdefy.user` on re-render; or
- Don't let a stale `resolved.profile` mask a fresh `session.user.profile` in the `<Session>`
  merge (e.g. deep-merge `profile`, or update the reactive session store alongside the ref).

Not onboarding-specific: any flow that writes session-affecting state and then navigates on
`_user` freshness (e.g. the profile edit modal relying on `_user.profile`) has the same shape.

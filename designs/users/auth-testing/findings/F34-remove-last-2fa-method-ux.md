# F34 — Removing the last 2FA method dumps the user through a raw endpoint-gate error into forced re-enrolment

**Status:** `needs-design` · **Area:** user-account / 2FA + auth-flow

With `twoFactor.required: true` and a passkey as the **only** enrolled second factor, deleting
that passkey from the Security tile leaves the caller unenrolled mid-session. The engine's
`required` gate then refuses the very next Lowdefy endpoint call, and the user experiences:

1. A **raw error** surfaced to the UI — _"2FA is required to call `'<request_id>'`"_ — leaking
   an internal Lowdefy request id.
2. The page **hangs in a loading state**.
3. An **abrupt redirect** to the forced two-factor enrolment page
   (`two-factor-enrol.yaml`), which **doesn't feel "inside the app"** (it renders on the
   chrome-less auth-page shell — see [F32](./F32-auth-page-visual-polish.md)).

## Root cause (as understood)

Correct-by-design at the core: `two-factor-enrol.yaml` documents that the engine's `required`
enforcement "refuses an unenrolled caller at **every** Lowdefy endpoint" and redirects them to
forced enrolment. So the moment the last factor is deleted, the session is valid-but-unenrolled
and the next request is gated. The system is doing the right thing — **you cannot be left with
no second factor while 2FA is required** — but the transition is unhandled UX: the gate
rejection reaches the client as a raw error + loading hang before the redirect fires, instead
of a deliberate, in-app handoff.

## The open question

The enforcement is correct; the **handoff is the open design decision**:

- **Block the action** — refuse deletion of the _last_ remaining factor with a friendly
  in-app message ("Add another method before removing this one"), so the gate is never
  tripped; or
- **Graceful handoff** — intercept the last-factor deletion, suppress the raw gate error and
  loading hang, and route deliberately into enrolment with in-app chrome and clear copy; or
- some mix (allow the deletion, but message the re-enrolment requirement up front).

Whichever is chosen, the raw _"required to call '\<request_id\>'"_ string and the loading hang
should never reach the user. The "not inside the app" feel of the destination is tracked under
F32.

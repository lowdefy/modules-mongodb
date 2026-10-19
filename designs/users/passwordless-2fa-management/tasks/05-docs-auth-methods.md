# Task 5: Correct two stale paragraphs in `auth-methods.md`

## Context

`docs/user-account/concepts/auth-methods.md` describes the forced-enrolment page and
`_user.two_factor_enrolled`. Two of its factual claims are falsified by the decisions this design
ships:

1. **"never issues a server-side request" (lines ~256-260).** The section states the enrol page
   is "self-sufficient on client actions … so the page never issues a server-side request — it
   drives `TwoFactorEnable`, `TwoFactorVerify`, and `PasskeyRegister` directly against
   `/api/auth/*`." Task 4 (Decision 2) makes the page run a self-scoped `get_accounts` request
   under the page-scoped gate exemption. This claim becomes false.

2. **`_user.two_factor_enrolled` "reads this same field to decide when done" (lines ~262-272).**
   The `### _user.two_factor_enrolled` subsection states the enrolment page "reads this same
   field to decide when the caller is done, so its completion state never disagrees with the gate
   about who still needs a factor." Task 2 (Decision 3) replaces that read with a local
   `enrol.done` flag. This claim becomes false.

`docs/` is the source of truth for consumer-observable behaviour; correct these two paragraphs to
match the shipped design. Depends on Tasks 2 and 4 being in their final state.

Note: the paragraph at lines ~249-252 ("a caller with no password credential can still complete
TOTP enrolment; BetterAuth waives the password requirement per-user for anyone holding none")
already describes the target behaviour Decisions 1/2 deliver — **leave it as is.**

## Task

In `docs/user-account/concepts/auth-methods.md`:

**1.** Rewrite the "self-sufficient on client actions" claim (~`:256-260`) so it no longer says
the page issues no server-side request. State instead that the page runs one self-scoped read
(`get_accounts`, for the `has_credential` signal that gates the password field) which the engine
admits via the enrol page's gate exemption — the invoking `pageId` is forwarded into request
authorization so an enrol-page request inherits the page's own exemption from the `required`
floor. Keep the accurate parts (the page drives `TwoFactorEnable` / `TwoFactorVerify` /
`PasskeyRegister` directly; it is protected, not public).

**2.** Rewrite the `_user.two_factor_enrolled` completion sentence (~`:270-272`). The engine and
the module still read `_user.two_factor_enrolled` for the gate and elsewhere, but the
**enrol page** now decides its done-state from a local `enrol.done` flag set by its own successful
enrolment chain — not from the ambient session fact — precisely to avoid the fact/gate
disagreement that produced the redirect loop. Keep the rest of the subsection (the field's
definition, "a passkey counts", the gate semantics) intact.

Preserve the file's front-matter and the surrounding sections. Keep edits tight to the two
paragraphs; do not restructure the page.

## Acceptance Criteria

- Neither stale claim remains: the doc no longer says the enrol page issues no server-side
  request, nor that the enrol page reads `_user.two_factor_enrolled` to decide when done.
- The passwordless-TOTP paragraph (~`:249-252`) is unchanged.
- Front-matter intact; `pnpm docs:gen` (or `pnpm docs:check`) passes — front-matter lint clean,
  no generated-file drift.

## Files

- `docs/user-account/concepts/auth-methods.md` — modify — correct the two paragraphs above.

## Notes

- `auth-methods.md` is a hand-written concept doc, not a generated file — edit it directly. Only
  `reference/vars.md` and `llms.txt` are generated; you are not touching those, but run
  `pnpm docs:check` to confirm nothing drifted.
- The design's "Files changed" list omitted docs impact; this task is the derived correction (see
  the note at the end of `tasks.md`).

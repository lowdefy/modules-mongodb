# Task 6: Flip `shared/sessions/session_fields.yaml` native reads

## Context

`shared/sessions/session_fields.yaml` is a shared fragment consumed by both modules' session
lists (`get_user_sessions` in `user-admin`, `get_sessions` in `user-account`). It reads
physical session columns directly, so its source refs move to snake_case. The other shared
fragments are audited and confirmed **no change**.

## Task

- `shared/sessions/session_fields.yaml` — flip the native source refs:
  `$userAgent → $user_agent`, `$ipAddress → $ip_address`, `$expiresAt → $expires_at` (appears
  more than once — the relative-time computation reads `$expiresAt` twice, around lines 140
  and 150). Update the comment at line 9 that names `expiresAt` (per CLAUDE.md, comments
  describe current code).
- **Audit, confirm no change:** `shared/contact/write-profile.yaml` and
  `shared/contact/create-or-link-contact.yaml` — these only pass `UpdateUserProfile` **action
  params** (`userId`, `organizationId`) and the `profile.contactId` **bag key**, all of which
  stay camelCase. The `userId` at `write-profile.yaml:143,154,156` and
  `create-or-link-contact.yaml:107` are action params — leave them.

## Acceptance Criteria

- `session_fields.yaml` reads `$user_agent`, `$ip_address`, `$expires_at` (every occurrence);
  the line-9 comment names `expires_at`.
- `shared/contact/*` are unchanged.
- `grep -rn -E '\$(userAgent|ipAddress|expiresAt)\b' modules/shared/sessions/` returns nothing.

## Files

- `modules/shared/sessions/session_fields.yaml` — modify
- `modules/shared/contact/write-profile.yaml` — audit, no change
- `modules/shared/contact/create-or-link-contact.yaml` — audit, no change

## Notes

- These are `$`-prefixed aggregation source refs, not projection output keys — flipping the
  source is enough; the fragment's own output field names (`ip`, relative-time labels) are
  author-chosen and stay as-is.

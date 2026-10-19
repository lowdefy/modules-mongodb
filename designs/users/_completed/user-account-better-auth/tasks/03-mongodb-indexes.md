# 03 — Document the contact + user uniqueness indexes

**Context**: Create-or-link (Decision 7) is an upsert keyed on the contact's
`lowercase_email` that reconciles on a duplicate-key error to close the race with
user-admin's invite flow — that reconcile path only works if a **unique index on
`user-contacts.lowercase_email`** exists. In this project **modules do not create
indexes** — index creation is a host-app concern — so this task **documents** the
required indexes (following the pattern in `docs/workflows/reference/indexes.md`),
pinning the exact shape rather than deferring it (design.md — Decision 7).

**Task**:

1. Create `docs/user-account/reference/indexes.md` with valid front-matter
   (`title: Indexes`, `module: user-account`, `type: reference`) and the standard
   "the module does not create indexes — index creation is a host-app concern; host
   apps must add the following indexes" preamble.
2. Document the **`user-contacts.lowercase_email`** index as **partial-unique** on
   `partialFilterExpression: { lowercase_email: { $exists: true } }`. State the
   rationale inline: `user-contacts` is the unified person record shared with the
   `contacts` module, whose CRM contacts legitimately have **no email**; a plain
   unique index would treat every email-less contact's missing key as `null` and
   reject the second one, so the model couldn't hold two email-less contacts. The
   partial filter indexes only email-bearing contacts, so email-less contacts
   coexist. **Constraint**: email-less contacts must **omit** `lowercase_email` (not
   store `null` — two explicit nulls still collide under this filter), so the write
   fragments (05/06) set it only when an email is present. This index serves the
   `create-or-link-contact` reconcile-on-dup-key race guard (shared with user-admin's
   invite).
3. Document the **`users.profile.contactId`** partial-unique index (one `user` per
   `contact`) — note it is a _different_ invariant and does **not** prevent duplicate
   contacts for one email.

**Acceptance Criteria**:

- `docs/user-account/reference/indexes.md` exists with valid front-matter and the
  host-app-requirement preamble.
- `lowercase_email` documented as partial-unique on `$exists`, with the CRM-contact
  rationale and the omit-when-absent constraint stated.
- `profile.contactId` documented as partial-unique, with its distinct invariant noted.

**Files**:

- `docs/user-account/reference/indexes.md`

**Notes**:

- Runs in parallel with 01/02.
- **Documentation only** — nothing in the module creates these indexes. The
  `create-or-link-contact` fragment (task 06) relies on the host app having added the
  `lowercase_email` index for its reconcile path; the doc is where that requirement
  is recorded.
- Front-matter lint / `pnpm docs:gen` run in tasks 19/20.

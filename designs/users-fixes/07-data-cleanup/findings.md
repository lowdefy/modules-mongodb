# Data cleanup — corrupted demo records

Not a code change. One-off remediation of records corrupted by the merge-on-signup
defects.

---

## Corrupted demo contact — two users sharing one record

**Do this only after F3 + F4 land** (`04-planning/`). Cleaning up first just
re-corrupts on the next signup, and leaves you unable to tell a stale record from
a fresh regression.

### What's wrong

Both the email/password signup and the magic-link signup keyed the
`create-or-link-contact` upsert on `lowercase_email: ''`, so the second signup
matched the first's bare contact instead of creating its own:

- Contact `aa320f44…` is shared by **two** users (`admin@demo.test` and
  `magic@demo.test`), violating one-user-per-contact.
- That contact has `lowercase_email: ''` and `email: null` rather than either
  real address.
- `magic@demo.test`'s onboarding wrote its profile (`given_name: M`,
  `name: "M L"`) onto the shared contact — so it now carries the wrong identity's
  profile data.
- `admin@demo.test`'s `user.profile.contactId` was never set (F4), which is the
  only reason the partial-unique index hasn't fired.

### Remediation

1. Split the shared contact: keep one user on `aa320f44…`, create a fresh contact
   for the other.
2. Backfill `lowercase_email` / `email` on both from the verified addresses on the
   `users` docs.
3. Set `user.profile.contactId` on both users to point at their own contact.
4. Confirm the partial-unique index is satisfied and doesn't fire.
5. Re-run the signup + verify + onboarding flows from clean to confirm the F3/F4
   fixes hold end-to-end and no new bare-email contact appears.

### Alternative

If nothing in the demo DB is worth preserving, **wiping the affected collections
and re-seeding is likely cheaper and safer** than a surgical split. Decide once
F3/F4 are fixed and you know what a correct record looks like.

Either way, step 5 is the point of the exercise — the cleanup is also the
verification that the fixes work.

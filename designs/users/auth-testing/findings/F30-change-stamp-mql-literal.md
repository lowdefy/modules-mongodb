# F30 — Change stamp injected into MQL expression context unwrapped

**Status:** `needs-design` · **Area:** shared / change-stamps

All three profile write seams stamp their update with

```yaml
updated:
  _ref:
    module: events
    component: change_stamp
```

inside an **aggregation-pipeline** `$set` — `modules/shared/contact/write-profile.yaml`,
`modules/contacts/api/create-contact.yaml` (both `created` and `updated`) and
`modules/contacts/api/update-contact.yaml`. The stamp's default
(`modules/events/module.lowdefy.yaml`) resolves `user.name` from `_user: profile.name`.

In expression context a string beginning with `$` is a **field path**, not a literal. So a
user whose `profile.name` starts with `$` has it resolved against the document being written:
a user named `$email` stamps `updated.user.name` with the target contact's email address
instead of their own name. The audit trail records the wrong value, silently.

This is the same defect class as the avatar-generation design's D6, which wraps every
payload-derived value in these exact stages in `$literal`. It was deliberately left out of
that change: D6 scopes its rule to values originating in the payload, and `profile.name`
reaches the stamp indirectly — derived from a payload on some earlier write, stored, then
read back through `_user`. Same lines, same fix, different provenance.

The fix is one wrapper per site:

```yaml
updated:
  $literal:
    _ref:
      module: events
      component: change_stamp
```

## The open decision

**Scope.** `change_stamp` is a consumer-overridable module var, so wrapping it declares that
a consumer may never put a live MQL expression in their stamp template. That is almost
certainly the right contract — the var's own description says it "Contains runtime operators
(`_user`, `_date`) that evaluate per-request", meaning Lowdefy operators, not MQL — but it is
a contract change to state explicitly in `docs/shared/change-stamps.md`, and it should be
applied uniformly across every change-stamped write in the repo, not only the three seams
above.

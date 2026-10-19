# F52 — Unauthorized org-role demote is a silent no-op that reports success

**Status:** `needs-design` · **Area:** user-admin / org authority

When an **admin** (not an owner) attempts to demote an **owner** via the Organization
authority selector, the operation is a **no-op that returns success** — the UI shows the
success message and nothing changes in `user-members.role`. The authority check is doing its
job (an admin genuinely can't demote an owner), but the caller is told the action succeeded.

The neighbouring cases are all correct: an admin **cannot promote to owner** (throws), an
owner **can create another owner**, and an owner **can demote another owner**. Only the
admin-demotes-owner path swallows the refusal and reports success.

## Why it matters

A success toast on an action that did nothing is misleading — the admin believes they revoked
an owner's authority when the row is unchanged. The other unauthorized path (promote to owner)
already surfaces an error, so the behaviour is also **inconsistent** between the two refusals.

## The open decision

1. Should the unauthorized demote **refuse with an error** (matching the promote-to-owner path
   and the sole-owner-demote refusal), rather than reporting success?
2. Is the no-op happening in the plugin/BetterAuth layer (returns ok, changes nothing) or in
   the app request — i.e. where does the fix belong?

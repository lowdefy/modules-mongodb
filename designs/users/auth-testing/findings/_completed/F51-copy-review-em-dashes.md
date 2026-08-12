# F51 — App-wide copy review (em-dashes and general polish)

**Status:** `enhancement` · **Area:** user-account + user-admin / copy

User-facing copy across the auth modules should get a general review pass. The trigger was
the admin **Sign out everywhere** confirm modal (user-admin security tile), whose description
uses an em-dash:

> "Signs this person out of all their active sessions. They can sign back in right away —
> this does not suspend or remove their access."

Em-dashes should be removed from all copy (house style). This finding is the umbrella for a
single sweep, not a one-line fix — the same review should catch tone, punctuation, and clarity
across every string in both modules.

A second instance (same security tile, the single-app hint) reads clumsily and could be
tightened:

> "Suspend blocks this person from signing in and signs them out. Remove takes away their
> access to this app. Delete permanently removes their login (their contact record is kept)."

## The open decision

1. Confirm the house-style rule (no em-dashes; replacement — sentence split, comma, or colon).
2. Scope the sweep: every modal description, alert, hint, and button label across `user-account`
   and `user-admin` — not just this one string.

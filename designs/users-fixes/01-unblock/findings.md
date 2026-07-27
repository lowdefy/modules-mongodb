# Unblock — small fixes that gate further testing

Two small, well-understood defects that block auth-testing progress. Same shape
as the polish batch (one agent pass, no design call), separated only because
they should land first.

Both **code-verified open** as of 2026-07-27.

Finding IDs (`F7`, `F24`) are stable — carried over from the auth-testing run.
Don't renumber.

---

## F24 — Members list (`user-admin/all`) crashes on load with no filters: empty `$and` is illegal in MongoDB

`modules/user-admin/requests/stages/members_filter.yaml:11` emits
`$match: { $and: <_array.concat of four `\_if … else: []` clauses> }`. On a clean
page load **no filter is set**, so every clause resolves to `[]`, the concat is
`[]`, and the stage becomes `$match: { $and: [] }` — which MongoDB rejects with
`$and/$or/$nor must be a nonempty array` (surfaced at `get_all_members.yaml:8`).

The stage comment claims "an empty filter matches all," but that only holds for
`$match: {}`, **not** `$match: { $and: [] }`.

**Impact:** the Members tab fails to load every time until a filter is applied —
blocks Phase 3 of the checklist.

**Fix:** drop the `$and` wrapper when the clause array is empty (emit
`$match: {}`) — a bare `$match: {}` is the canonical "match all". Build the match
object conditionally rather than seeding the array with an always-true clause.

**Scope note (verified 2026-07-27):** the finding worried the same trap lurks in
the Excel-export path, but `members_filter.yaml` has exactly one consumer —
`modules/user-admin/requests/get_all_members.yaml:25`. The stage's own header
comment ("Applied by both the list read and the Excel export") is stale. Fix the
one site; correct the comment while you're there.

---

## F7 — `_nunjucks` error on the user-admin `view` remove-modal title: the `| trim` filter is unavailable in runtime `_nunjucks`

`modules/user-admin/components/view/modal_remove.yaml:9`:

```yaml
template: "Remove {{ name }} from {{ app | trim }} User Admin?"
```

**Confirmed via live `lowdefy_eval_operator`:** the identical template with
`| trim` removed parses and renders fine (`"Remove Jane from  Demo  User
Admin?"`), while with `| trim` it throws `_nunjucks failed to parse`.

This is a **real crash of the Remove-from-app modal** — its title fails to
render.

**Fix:** drop `| trim` (the `app_title` var is already clean), or trim the value
with a Lowdefy operator in the `on` binding.

**Don't wait on the upstream fix.** F7 is the root-cause child of **F23**
(runtime `_nunjucks` missing standard filters → `03-upstream/`), but the
one-line workaround is free and the upstream call is unresolved. Its sibling
(`| join` on the backup-codes modal) was already worked around the same way with
`_array.join`.

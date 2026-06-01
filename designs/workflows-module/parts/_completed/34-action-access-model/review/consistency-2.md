# Consistency Review 2

## Summary

Walked the design and review-1's resolution annotations. Two internal inconsistencies found, both auto-resolved by updating `design.md` to match the resolved review decisions. No task or plan files exist for this part yet, so the scope was design-internal only.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** (none)
- **Reviews:** `review/review-1.md`
- **Tasks:** (none yet)
- **Plans:** (none yet)

## Inconsistencies Found

### 1. Stale "hook auth gate rule" in Consumers list

**Type:** Review-vs-Design Drift / Stale Reference
**Source of truth:** Review-1 finding #1 (Resolved — hook auth synthesis dissolved) and design D11 (three-layer enforcement, hooks internal-only).
**Files affected:** `design.md` line 445 (Consumers entry for Part 13).

The Consumers list described Part 13 as consuming a "hook auth gate rule" from Part 34. Per the resolved review-1 finding #1 and the design's own D11, hook Apis are now internal-only and carry no auth gate of their own — the framing inherited from an earlier draft that had a hook-side synthesis formula.

**Resolution:** Rewrote the Part 13 Consumers entry to describe what Part 13 actually consumes from Part 34 — the build-time verb-presence check for emission and the D10 id-naming convention — and explicitly note that hook Apis carry no auth gate (D11).

### 2. Q1 claims lint-warn is "Captured in D4" but D4 omitted it

**Type:** Internal Contradiction (Open Question vs. Key Decision)
**Source of truth:** Q1 "Resolved" annotation. Q2 also relies on this lint-warn ("The same lint warning from Q1 catches…").
**Files affected:** `design.md` D4 (No verb implication) and the Verification § Build-time bullet list.

Q1's resolution mandates a lint-warn (not a hard-error) when `edit`, `review`, or `error` are declared without `view`, and claims the rule is "Captured in D4 and in the per-verb shape rules." D4 captured "no implication" but not the lint-warn. The Verification § Build-time bullet on resolver validation also did not mention the warning.

**Resolution:**
- Added a paragraph to D4 spelling out the lint-warn behaviour and the rationale (the omission may be intentional for role-only-edits-no-read workflows, so the schema warns rather than rejects).
- Added a Build-time verification bullet pointing at D4.

## No Issues

Areas checked and found consistent:

- **`notification_roles` location** — schema, worked examples, D9, and Q3 all locate it at the action root. The "Keys at the `access:` block top level" prose explicitly excludes it from `access:`.
- **`access.roles` removal** — design body, schema "Removed surfaces" list, and worked examples all consistent.
- **`error` page emission** — D5 build-time bullet explicitly adopts the spec's gated-uniformly rule and supersedes the contrary paragraph in `action-authoring/design.md`.
- **Query-time pipeline shape** — D12 carries the concrete pipeline; the Touches row for `get-entity-workflows` references D12; `access_filter.yaml` → `visible_verbs_filter.yaml` rename is consistent across D12 and the Touches table.
- **Per-verb link map (D7)** — the action-doc example, the per-verb table, and the UI selection rule all use the same `links: { view, edit, review, error }` shape; the Touches row for Part 30 explicitly calls out the `$mergeObjects` pipeline rewrite (D11 of Part 30).
- **`visible_verbs` shape** — Schema § "Query response shape", D5, D8, and D12 all commit to the same four-key shape with `false` defaults.
- **Migration section** — removed from the design as per Review-1 finding #7 (Rejected — no workflows shipped); no stale references remain.
- **D3 cross-app clash claim** — stands unqualified, consistent with the migration removal.
- **Q2 status** — explicitly marked "Working answer pending team review"; left open intentionally, no drift.

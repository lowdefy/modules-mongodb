# Consistency Review 1

## Summary

Checked design.md against the single review (review-1, all 5 findings resolved) and against the cross-referenced sibling parts. One inconsistency found — a stale Part 59 cross-reference — and auto-resolved. All review-1 decisions are faithfully reflected in the design; no task or plan files exist yet.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** (none)
- **Reviews:** `review/review-1.md` (findings 1–5, all `Resolved` / `Resolved (auto)`)
- **Tasks:** (none)
- **Plans:** (none)
- **Cross-referenced (read-only):** `parts/59-entity-instance-pointer/design.md`, `parts/_next/26-entity-data-contract/` (confirmed exists), `parts/56-three-tier-action-pages/` (confirmed `entity.name_field` ownership)

## Inconsistencies Found

### 1. Stale Part 59 cross-reference (path, name, and status)

**Type:** Stale Reference / Stale Status
**Source of truth:** `parts/59-entity-instance-pointer/design.md` (current on disk)
**Files affected:** `design.md` (Dependents, line 171)
**Resolution:** Auto-resolved. The Dependents note cited Part 59 as `parts/_next/59-entity-object-model` and "problem statement only". Part 59 has since moved out of `_next`, been renamed to `59-entity-instance-pointer` ("Nested entity instance pointer"), and grown a full design. Updated the path to `parts/59-entity-instance-pointer`, the name to "Nested entity instance pointer", and dropped the "problem statement only" status. The substance of the note (Part 59 nests the entity object through the persistence/runtime layer; cross-cutting; no migration) remains accurate against Part 59's current design.

## No Issues

- **Finding 1 (validation framing).** design.md no longer claims the validator "already validates `entity_collection`". Lines 19, 138, 141 correctly frame the `entity.collection` required-string check as new coverage folded into the unified `entity:`-block validation. Consistent.
- **Finding 2 (per-workflow variation).** Demoted from a "Why" driver to a supported side-effect at lines 21 and 51 ("not the driver for the change"). Consistent.
- **Finding 3 (Part 26 mechanism).** Dependents note (lines 172–174) flags the build-time→runtime mechanism mismatch explicitly and frames Part 26 as parked/speculative, not a committed dependency. Matches the resolution. Part 26 path (`parts/_next/26-entity-data-contract`) verified to exist.
- **Finding 4 (`entity_link: null` behavior change).** Documented as a Non-goals note (line 167) as an inherent consequence of routing-by-workflow. Consistent.
- **Finding 5 (citation nits).** Line 49 cites `GetWorkflowOverview.js:44` (corrected from `:183`); Files-changed cites schema `lines 153–169` (line 148); the `connection.entities` doc-comment updates are covered by the generic Files-changed instruction (line 149). Consistent.
- **Part 56 / `entity.name_field` reference (line 172).** Verified against `parts/56-three-tier-action-pages` — `name_field` is owned by Part 56 and layered onto Part 57's `entity:` block. Part 57 correctly omits it from its own block fields. Consistent; no over-claim.

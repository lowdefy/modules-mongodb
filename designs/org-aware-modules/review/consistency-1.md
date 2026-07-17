# Consistency Review 1

## Summary

Checked design.md, upstream-asks.md, and review-1.md (all six findings annotated) against each other. Found 3 inconsistencies, all the same root cause — Decision 7 (system-context writes, from review-1 #3) was added after sections stating pre-#3 absolutes — plus 1 stale cross-reference. All 4 auto-resolved; no user decisions needed.

## Files Reviewed

- **Design**: `design.md`
- **Supporting**: `upstream-asks.md`
- **Reviews**: `review/review-1.md` (6/6 findings annotated: 5 Resolved (auto), 1 Resolved)
- **Tasks / Plans**: none exist yet

## Inconsistencies Found

### 1. Proposed-change bullet 1 said the tenant field is "never authored in module config"

**Type:** Internal Contradiction
**Source of truth:** review-1 #3 resolution (Decision 7: system-context writes carry `tenant: none` + explicit `organizationId`)
**Files affected:** `design.md` (Proposed change, bullet 1)
**Resolution:** Added the carve-out: "(one carve-out: system-context writes name the org explicitly, Decision 7)."

### 2. Decision 2 said "No module pipeline references `organizationId` in a `$match`, filter, or write" with no exception

**Type:** Internal Contradiction
**Source of truth:** review-1 #3 resolution (Decision 7)
**Files affected:** `design.md` (Decision 2, opening paragraph)
**Resolution:** Appended the carve-out sentence: system-context writes run outside the wall by necessity and must name the org explicitly under Decision 7's rule.

### 3. Decision 4 / Proposed-change bullet 3 claimed the `create-or-link-contact` upsert "needs no hand change" unconditionally

**Type:** Internal Contradiction
**Source of truth:** review-1 #3 resolution (Decision 7 + upstream ask 4: the merge-on-signup create half runs under `tenant: none` with an explicit org)
**Files affected:** `design.md` (Decision 4; Proposed change, bullet 3)
**Resolution:** Qualified both: the free wall mechanics hold for caller-ful paths (admin invite); the fragment's system-context caller supplies `organizationId` explicitly per Decision 7 / ask 4, with the compound unique index guarding both paths identically.

### 4. Related section cited "asks 2–3" as the sibling-design asks

**Type:** Stale Reference
**Source of truth:** upstream-asks.md (ask 4, addressed to user-account-better-auth, added by review-1 #3)
**Files affected:** `design.md` (Related)
**Resolution:** Updated to "asks 2–4."

## No Issues

- **Review annotations vs design**: all six review-1 resolutions are reflected in the design (ask 1 type correction + `storedSource` + rejection-scan bullets; ordered Migration steps with string-form backfill; Decision 2's collection-substitution bullet; Decision 7 + ask 4).
- **Ask numbering**: upstream-asks.md sections 1–4 match design.md's summary list 1–4 and the "Four platform gaps" count in Proposed change bullet 6.
- **Decision 3 vs Decision 7**: no conflict — Decision 3 governs caller-ful explicit references (`_user: organizationId`); Decision 7 governs caller-less writes (payload-provenance org under `tenant: none`).
- **Collection inventory vs Proposed change bullet 1**: same eight collections, same connection treatments.
- **Migration section vs Decision 5**: consistent (Decision 5 names the ride-along; Migration owns the ordering).
- **Open questions / Non-goals**: no resolved-question drift; nothing discussed in the body is listed as a non-goal.

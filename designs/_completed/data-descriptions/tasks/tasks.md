# Implementation Tasks — DataDescriptions Block

## Overview

These tasks implement the `DataDescriptions` block — a new display block that combines DataView's data preprocessing (20 field types, formConfig, auto-detection) with Ant Design's Descriptions component for bordered, horizontal-label rendering. Preprocessing is copied from DataView and adapted to output a tree of groups preserving nesting hierarchy. Derived from `designs/data-descriptions/design.md`.

## Tasks

| #   | File                             | Summary                                                                                                                   | Depends On |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-copy-adapt-preprocessing.md` | Copy DataView's preprocessing, fieldTypes, core, utils into DataDescriptions and adapt preprocessing to output group tree | —          |
| 2   | `02-block-scaffold.md`           | Create DataDescriptions component, meta, schema, and register the block                                                   | 1          |
| 3   | `03-swap-profile-views.md`       | Swap profile view DataView blocks to DataDescriptions                                                                     | 2          |

## Ordering Rationale

Linear dependency chain:

1. **Preprocessing first** — this is the bulk of the work. Copy all shared code (fieldTypes, value renderers, utils) and adapt the preprocessing pipeline to output `[{ title, fields, children }]` (a tree of groups preserving nesting) instead of a tree with grid wrappers. Must exist before the React component can import it.

2. **Block scaffold second** — the React component, meta, schema, and plugin registration. Imports the local preprocessing and renderers from task 1. This is the wiring task.

3. **Swap profile views last** — YAML-only changes. Depends on task 2 because the block must exist first.

## Scope

**Source:** `designs/data-descriptions/design.md`
**Context files considered:** None (single-file design)
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/consistency-3.md`, `review/review-4.md` (all findings resolved)

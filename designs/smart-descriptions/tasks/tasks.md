# Implementation Tasks — SmartDescriptions

## Overview

These tasks implement the SmartDescriptions block as designed in `designs/smart-descriptions/design.md`. SmartDescriptions replaces DataDescriptions with a simpler, flat `<Descriptions>` component that supports two modes: data-only auto-discovery and data+fields with Lowdefy block definitions as hints.

## Tasks

| #   | File                                  | Summary                                                                                                 | Depends On |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-scaffold-and-port-field-types.md` | Create directory, copy shared field type files, enhance registry, add blockTypeMap and getByDotNotation | —          |
| 2   | `02-implement-auto-discovery.md`      | Implement processData.js — flat auto-discovery with dotted-key flattening                               | 1          |
| 3   | `03-implement-fields-mode.md`         | Implement processFields.js — field resolution with block type mapping and options lookup                | 1          |
| 4   | `04-component-renderer-metadata.md`   | Create SmartDescriptions.js, renderValue.js, meta.js, schema.json, and register in plugin               | 1, 2, 3    |

## Ordering Rationale

The dependency chain is linear with one fork:

1. **Task 1 (field type infrastructure)** is the foundation. Every other file depends on the field type registry, utilities, and the block type map. Porting these first means tasks 2 and 3 can import real modules.

2. **Tasks 2 and 3 (processData + processFields)** are independent of each other — they both read from the field type infrastructure but don't interact. They can run in parallel if desired.

3. **Task 4 (component + renderValue + registration)** depends on everything above. SmartDescriptions.js calls processData or processFields and passes results to renderValue. This task also handles meta.js, schema.json, and plugin registration since these are tightly coupled to the component (won't compile separately).

**DataDescriptions removal** is explicitly out of scope for these tasks. The design states that DataDescriptions is removed once the three consumer modules (user-admin, user-account, contacts) are migrated — that migration belongs to the module-field-pattern design. Once that design's tasks are complete, DataDescriptions can be deleted and its exports removed from `src/blocks.js` and `src/metas.js`.

## Scope

**Source:** `designs/smart-descriptions/design.md`
**Context files considered:** None (no supporting non-review files in the design folder)
**Review files incorporated:** `review/review-1.md`, `review/review-2.md` (task files updated by consistency review to reflect review-2 decisions)

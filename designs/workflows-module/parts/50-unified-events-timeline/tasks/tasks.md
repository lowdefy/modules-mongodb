# Implementation Tasks — Part 50: Collapse to one config-free entity events timeline

## Overview

These tasks implement [Part 50](../design.md): re-merge the split entity timeline
into **one** events-module-owned timeline that enriches itself with action cards
when an `actions_collection` var is set. The work denormalises the action sort key
so the read engine needs no workflow config, introduces a new config-free
`EventsTimeline` plugin connection, moves the timeline onto the events module,
deletes the workflows-module duplicate, and turns enrichment on in the demo.

## Tasks

| #   | File                               | Summary                                                                                            | Depends On |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-denormalise-sort-indices.md`   | Stamp `group_index` / `decl_index` onto action docs at build time and write time                   | —          |
| 2   | `02-config-free-comparator.md`     | Comparator reads stamped indices; drop `workflowsConfig` from all 4 read engines                   | 1          |
| 3   | `03-events-timeline-connection.md` | New read-only `EventsTimeline` plugin connection type exposing `GetEventsTimeline`                 | 2          |
| 4   | `04-events-module-enrich.md`       | Events module: enrichment vars, connection, component rewrite, click handler, dead-config          | 3          |
| 5   | `05-demo-turn-on-enrichment.md`    | Demo: set `actions_collection`/`contacts_collection`, repoint `lead-view` to the events tile       | 4          |
| 6   | `06-delete-workflows-duplicate.md` | Delete the workflows-module timeline duplicate; de-register `GetEventsTimeline` from `WorkflowAPI` | 5          |
| 7   | `07-docs.md`                       | Document the enrichment vars + one-timeline model; remove two-timeline/swap material               | 4, 6       |

## Ordering Rationale

The spine is a data-before-reader dependency chain followed by a build-it-then-delete-the-old-one swap:

- **1 → 2:** The denormalised indices must be present on action docs (build-time
  attach + write-time copy) before the comparator switches to reading them.
  Task 1 changes no behaviour (the comparator still reads config); task 2 flips
  the reader. Splitting them keeps each independently verifiable.
- **2 → 3:** `GetEventsTimeline` must be fully config-free (no `workflowsConfig`
  call, no `workflowsConfig` destructure) before it can be hosted on a connection
  whose schema omits `workflowsConfig`. Task 3 relocates the engine onto the new
  `EventsTimeline` connection type.
- **3 → 4:** The connection type must exist before the events module can wire a
  connection of that type and route its component through it.
- **4 → 5:** The events timeline must be enrich-capable before the demo points at
  it and flips enrichment on.
- **5 → 6:** The demo (the one direct consumer) must stop referencing
  `workflows-events-timeline` and the `WorkflowAPI`-bound `GetEventsTimeline`
  request before they are deleted/de-registered — otherwise the build breaks.
- **4, 6 → 7:** Docs land last, once both the new behaviour (task 4) and the
  removal of the old (task 6) are settled.

Tasks 1 and 2 are pure plugin-package work; 3 is plugin-package; 4 is events
module; 5 is the demo app; 6 spans both the workflows module and the plugin
package; 7 is docs. There is no parallelism — the chain is strictly linear.

## Scope

**Source:** `designs/workflows-module/parts/50-unified-events-timeline/design.md`
**Context files considered:** none (the design folder contains only `design.md` and `review/`)
**Review files skipped:** `review/review-1.md`

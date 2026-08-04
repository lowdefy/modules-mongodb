---
"@lowdefy/modules-mongodb-activities": minor
---

**Activities** — `open_capture` and `capture_activity` in `mode: page` now carry `prefill.attributes` and `prefill.references` through to the new-activity page, where attributes merge over the page's own defaults exactly as they do in the capture modal. Previously both keys were dropped on the navigate path, so a deep-linked activity was created with no `references` and therefore unattached to the host entity it was logged against.

This is the route a host page takes when it wants its own capture entry point: a page cannot embed a second `capture_activity`, because `form_activity` hardcodes the contacts selector's request id and two instances collide. The demo's deal workspace has a "Log site visit" button showing the pattern.

Consumer guidance added alongside it: prefer a field's own `requests` over `form_requests` where the field must appear on every surface — `form_requests` are page-only, so a field relying on them is silently absent from the capture modal — and never `visible`-gate a field that writes into `references`, since hiding a block deletes its state and would discard the host's prefilled link.

---
"@lowdefy/modules-mongodb-deals": patch
---

Close two reuse gaps in the deal view left over from adopting workflows'
`actions-on-entity`: it never dropped the shared `check-action-modal`, so a
`check`-kind action clicked in the phase view full-page-navigated to its own
action page instead of opening in place; and the deal-outcome modal
hand-rolled its own `get-entity-workflows` refetch + `entity_workflows`
reseed after submitting the win/loss outcome action, instead of the exported
`entity-workflows-refetch` sequence.

The deal view (`pages/view.yaml`) now drops `check-action-modal` next to
`actions-on-entity`, with an `on_complete` that runs `entity-workflows-refetch`
plus a re-seed of the open-tasks card (mirroring the existing deal-switch and
task-save refreshes) so both cards and the stepper stay live after a check
action completes. `components/detail/deal_outcome_modal.yaml` now calls
`entity-workflows-refetch` instead of its own copy of the same two actions.

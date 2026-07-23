---
"@lowdefy/modules-mongodb-deals": minor
---

Deals view surfaces are now host-controllable:

- Add a `show_details` var (default `true`). Set it `false` to hide the read-only "Details" SmartDescriptions section — for hosts that render their domain fields through custom tiles (`components.info_grid_slots`) instead of the generic section.
- Company is no longer a fixed row in the meta strip. Hosts that want it there add a `meta_fields` entry (the same way Value is added), so a host with a dedicated company tile isn't stuck with a duplicated name.
- Info-grid layout regrouped: the read-only Details section is now full-width at the top (with a trailing divider that hides along with it), followed by a uniform tile grid — People, Files, then the host `info_grid_slots` tiles. Previously People sat alone above a divider, apart from the tiles.

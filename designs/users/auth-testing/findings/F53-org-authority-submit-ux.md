# F53 — Organization authority has its own submit hidden in the edit-role modal

**Status:** `enhancement` · **Area:** user-admin / view (Attributes tile)

The Organization authority control lives inside the edit-role modal but has its **own separate
submit button**, distinct from the modal's main "save roles" button. The result is confusing:
changing the authority selector and then clicking the modal's role-save button **does nothing**
to the authority — the change only lands via the other, less obvious button.

Logging that the flow needs rethinking; not resolving UX specifics here.

## The open decision

How should app-role editing and organization-authority editing be composed — one submit that
saves both, two clearly separated sections/actions, or authority pulled out of the edit-role
modal entirely? Needs a UX pass.

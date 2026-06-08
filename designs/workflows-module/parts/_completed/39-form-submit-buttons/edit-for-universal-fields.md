Part 24 (universal-fields) has been rewritten so that universal fields (

assignees

/

due_date

/

description

) on form-kind actions are written by their own decoupled operation

(

update-action-fields-{action_type}

→

UpdateActionFields

handler) via a right-hand sidebar card with its own Update button. The form submit must no longer touch these fields. Part

39 currently still sends them, which silently re-clobbers them on every submit. Please reconcile Part 39's design with this.

Specifically, in

designs/workflows-module/parts/39-form-submit-buttons/design.md

:

1.

Drop

fields

from the

submit

button payload

(D1). Remove the

fields: { _state: fields }

line from the submit

CallAPI

payload. Keep

form

,

comment

,

action_id

,

signal

,

current_key

. 2.

Drop

fields

from the

progress

button payload

(D2). Same removal — the Save Draft button persists

form

only, not

fields

. 3.

Narrow the submit

Validate

regex

from

params: { regex: [^form\., ^fields\.] }

to

params: { regex: [^form\.] }

. The universal-field inputs are no longer validated or written by submit; they're owned by the sidebar operation. 4.

Add a short note

(in "Why a dedicated part" / the dependency prose, or a new bullet) recording that form-kind universal fields are written by Part 24's

update-action-fields-{action_type}

operation, not by submit — so dropping

fields

here is deliberate, and Part 24's no-clobber guard in

planActionTransition.js

depends on it (the guard only

$set

s the fields when

payload.fields

is present, so an absent payload must mean "leave them untouched").

Rationale to preserve:

in edit mode the universal-fields component primes

_state.fields.*

from the loaded action doc, so if submit kept sending

fields: { _state: fields }

, the guard's "present" branch would fire and submit would overwrite whatever the sidebar last saved with stale primed state — defeating the decoupling. Simple-kind pages are out of Part 39's scope (they keep writing fields on submit), so this change is form-templates-only.
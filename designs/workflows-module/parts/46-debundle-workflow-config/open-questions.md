# Open questions — Part 46

## 1. Does the per-verb page title (`pages.{verb}.title`) earn its place, or collapse to `message`? (raised review-5 #2, 2026-06-10)

Resolving review-5 #2 settled the **shared detail header**: it reuses the canonical
per-action display string `message` (`action.{app_name}.message`) rather than a new
stable action `title`. That decision exposed a broader overlap not in scope for this
part: the action-authoring spec already carries several title-ish strings —

- workflow `title` ("Onboarding"),
- `action_group.title` ("Discovery"),
- per-verb `pages.{verb}.title` ("Capture Initial Details" / "View Initial Details" / …),
- per-stage `status_map.{stage}.{app}.message` (status copy),
- per-stage `status_map.{stage}.{app}.link.title` ("Initial Details" / "View Initial Details"),
- action `description`.

**The question:** does the per-verb `pages.{verb}.title` (baked into the generated
form pages as `page_config.title`) add value over `message`, or should `message` be the
single per-action display string everywhere — including the generated form-page headers?

**Why deferred, not resolved here:** the per-verb page title lives in the **foundational
action-authoring spec** (`designs/workflows-module-concept/action-authoring/spec.md`), not
in Part 46's surface area; collapsing it is a separate design pass touching the authoring
contract and `makeActionPages`. And the call needs the **reference implementation** (the
production app the module is extracted from) to see whether per-verb titles carry meaning
the stage `message` doesn't — that app is not reachable from this repo, so the answer can't
be verified here.

**Standing lean:** toward fewer display strings (one-correct-way), but only once the
reference implementation confirms no per-verb title conveys something `message` can't.
Does not block Part 46 — the shared header already reuses `message`; the generated form
pages keep their per-verb `page_config.title` until this is decided.

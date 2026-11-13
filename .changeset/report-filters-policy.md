---
"@lowdefy/modules-mongodb-ai-reporting": patch
"@lowdefy/modules-mongodb-plugins": patch
---

**Report filters render again instead of "This section contains values the report page cannot display".** Two rules of the report's dynamic blocks policy refused filter controls, and each refused control rendered as that Alert in its place, with its Reset button:

- A filter driving more than nine sections ran more than the policy's default 20 actions on change. The report policy now allows 47, the most a 24-section report can emit, and a test holds the limit to what the compiler emits.
- From Lowdefy 7.2.0, content may read a select's value (its options are data) only in an API call's payload or a condition. Every filter change, Reset and the AI summary button copied filter values into `summary.filter_values`, so on 7.2.0 every select filter was refused. The copy is gone: filter controls keep their values under one `filters` state object, and the AI summary drawer sends that object to `summarize-report` when you press Generate.

`summarize-report` reads each filter's value at its field's path in `filters`, so a dotted field such as `owner.user_id` is sent nested (`{ owner: { user_id } }`). An app that calls the endpoint itself with a dotted field as a flat key moves it to the nested shape. No stored data changes.

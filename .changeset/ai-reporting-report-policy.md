---
"@lowdefy/modules-mongodb-ai-reporting": minor
---

**Breaking: the report page renders under a dynamic blocks policy the app must list.** On Lowdefy v7 a `Dynamic` block renders blocks that its endpoint built from data only under a dynamic blocks policy, through a `ValidateDynamic` step. Report blocks are compiled from a stored spec, so without one every saved report rendered the "Report not found" fallback. The module now exports that policy as the `report-policy` component, the `report` page's `Dynamic` block names it, and `resolve-report` checks the compiled blocks with `ValidateDynamic` before returning them.

Lowdefy reads policies only from `lowdefy.yaml`, so consumers add:

```yaml
policies:
  dynamicBlocks:
    - _ref:
        module: ai-reporting
        component: report-policy
```

The build fails without it, naming the missing policy. The policy keeps `html: false` and lists no outside origins, so a string in a report that contains HTML tag syntax or a URL is refused. A refused value inside a section, including a row value, renders that section as an Alert; one in the report title or description renders the fallback. A section that would take the report over the policy's 8 MB `limits.bytes` renders as an Alert beside its CSV export. Each refusal is in the server log. Report re-queries and downloads now name the report and section (`report_id`, `section_id`) instead of sending the stored query, and `query-data` and `chart-data` accept that form and load the query server-side.

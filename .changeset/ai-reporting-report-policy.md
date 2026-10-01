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

The build fails without it, naming the missing policy. The policy keeps `html: false`, so a stored report whose text (markdown, title, labels) contains HTML tags now renders the fallback, with each violation in the server log.

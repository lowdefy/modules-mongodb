---
title: WorkflowProgress
module: plugins
type: reference
---

# WorkflowProgress

Renders an entity's workflows (the `get-entity-workflows` response) as collapsible, titled sections. Each workflow row shows a circular progress ring, title, optional workflow-overview link, a "Completed" pill, and a done-fraction; expanding it reveals its action groups as labelled sections of status-colored buttons.

A presentation variant of [ActionSteps](action-steps.md) — same data contract and status enum, different look. Most consumers should use the workflows module's `workflow-progress` component (see the [workflows exports reference](../workflows/reference/exports.md)), which wires the fetch, the shared `check-action-click` handler, and the status enum for you; use the block directly only when the data comes from somewhere else.

## Usage

```yaml
- id: workflow_progress
  type: WorkflowProgress
  properties:
    workflowOverviewPageId: workflow-overview
    actionStatusConfig:
      _ref: components/action_statuses.yaml
    workflows:
      _if_none:
        - _state: entity_workflows
        - []
```

## Properties

| Property                 | Type    | Default | Description                                                                                                                                                                                                              |
| ------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflows`              | array   | `[]`    | The `get-entity-workflows` response `workflows` array. Each workflow renders as a collapsible titled group; its `groups` render as labelled sections of status-colored action buttons. See the shape below.              |
| `actionStatusConfig`     | object  | —       | Map of action status key → display config from the shared `action_statuses` enum. `color` is the button fill, `borderColor` the border, `titleColor` the text, `title` the tooltip label.                                |
| `workflowOverviewPageId` | string  | —       | When set, each workflow row shows a "Workflow Overview" icon-button linking to this pageId with `urlQuery: { workflow_id: workflow._id }`. Omit to hide the button.                                                      |
| `activeActionId`         | string  | —       | The `_id` of the action currently being viewed. When it matches an action's `_id`, that button renders with a "current" highlight. Omit on entity-view pages (no current action).                                        |
| `defaultActiveKeys`      | array   | —       | `workflow_type` slugs expanded on mount. When omitted, workflows with any non-terminal action start open. Ignored when `activeKeys` is set.                                                                              |
| `activeKeys`             | array   | —       | Controlled expansion: the `workflow_type` slugs that are open. Takes precedence over `defaultActiveKeys` and user toggles — pair with the `onChange` event to update it.                                                 |
| `disableTooltip`         | boolean | `false` | When `true`, action buttons render without their hover tooltip (verb label / status name / blocked hint).                                                                                                                |

### Workflow shape

```js
{
  _id: "...",
  workflow_type: "onboarding",  // stable slug — the collapse key
  title: "Onboarding",
  groups: [                     // sorted by `order`
    {
      id: "kickoff",
      order: 1,
      title: "Kickoff",         // omit for an unlabelled section
      icon: "AiOutlineFlag",    // optional, left of the section title
      actions: [
        {
          _id: "...",
          status: "in-progress", // action_statuses enum key — drives the button colors
          message: "Technical review", // button label, HTML allowed (renderHtml)
          link: {                // optional; omit or disabled: true → non-clickable
            pageId: "review-view",
            urlQuery: { _id: "..." },
            input: { ... },
            newTab: false,
            disabled: false,
          },
        },
      ],
    },
  ],
}
```

### Progress math

The done-fraction and progress ring exclude `not-required` (waived) actions from the pool: `done / (total - notRequired)`. A workflow is **completed** (100% ring, "Completed" pill) when every action is `done` or `not-required`. A workflow whose every action is terminal (`done` / `not-required`) starts collapsed; anything in flight starts open — unless `defaultActiveKeys` / `activeKeys` override this.

## Events

| Event           | Fires with                                                                                          | When                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `onActionClick` | `{ action }` — the full action object that was clicked (`{ _id, kind, status, link, message, … }`)  | A linked action button is clicked **and** the event is wired.            |
| `onChange`      | `{ activeKeys, workflowType, open }`                                                                | A user expands or collapses a workflow row (keyed by `workflow_type`).   |

As with `ActionSteps`: when `onActionClick` is not wired, each button is a `Link` to its server-resolved `action.link`; buttons whose link is missing or `disabled: true` stay inert in both modes.

## Methods

| Method          | Params                                    | Description                                                                                                                                                 |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setActiveKeys` | `keys` — array of `workflow_type` slugs   | Set which workflows are expanded; listed workflows open, the rest collapse. No visual effect while the controlled `activeKeys` property is set.              |

## CSS Keys

| Key            | Element                                                  |
| -------------- | -------------------------------------------------------- |
| `element`      | The outer container.                                     |
| `workflowRow`  | Each workflow's collapsible header row.                  |
| `workflowLink` | The "Workflow Overview" icon-button on a header row.     |
| `section`      | Each action group's section wrapper.                     |
| `sectionTitle` | The uppercase label above an action group's buttons.     |
| `sectionLink`  | The group title when it links to the group-overview page. |
| `button`       | Each action's status-colored button.                     |

## Notes

- **HTML in `message` is rendered through `renderHtml`** from `@lowdefy/block-utils`. Sanitize upstream if the source isn't trusted. `not-required` messages render struck through.
- **Colors track the active antd theme** via CSS variables (`--ant-color-*`); per-button fill/border/text come from the `action_statuses` enum.

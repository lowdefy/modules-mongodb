export default {
  category: "display",
  icons: [],
  cssKeys: {
    element: "The outer WorkflowProgress container.",
    workflowRow:
      "Each workflow's collapsible header row (icon + title + caret).",
    workflowLink:
      "The 'Workflow Overview' icon-button on a workflow header row.",
    section: "Each action group's section wrapper.",
    sectionTitle: "The uppercase label above an action group's buttons.",
    sectionLink: "The group title when it links to the group-overview page.",
    button: "Each action's status-colored button.",
  },
  events: {
    onActionClick: {
      description:
        "Fires with the clicked action object instead of navigating. When not wired, the button navigates via the server-resolved action.link.",
      event: {
        action:
          "The action object that was clicked ({ _id, kind, status, link, message, … }).",
      },
    },
    onChange: {
      description:
        "Fires when a user expands or collapses a workflow row (keyed by workflow_type).",
      event: {
        activeKeys: "The workflow_type slugs that are open after the toggle.",
        workflowType: "The workflow_type of the row that was toggled.",
        open: "Whether that row is now open (true) or collapsed (false).",
      },
    },
  },
  methods: {
    setActiveKeys: {
      description:
        "Set which workflows are expanded. Pass an array of workflow_type slugs; listed workflows open, the rest collapse. No visual effect while the controlled `activeKeys` property is set.",
      params: {
        keys: "Array of workflow_type slugs to expand.",
      },
    },
  },
};

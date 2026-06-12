export default {
  category: "display",
  icons: [],
  styles: ["blocks/ActionSteps/style.less"],
  cssKeys: {
    element: "The outer ActionSteps container.",
    title: "The Typography.Title heading above the steps.",
    steps: "The Antd Steps component.",
    badge: "Each action's status Badge.",
    link: "Each action's Link wrapper.",
    groupLink: "Each action group's title Link (when actionGroupConfig[group].link is set).",
  },
  events: {
    onActionClick: {
      description:
        "Fires with the clicked action object instead of navigating. When not wired, the block navigates via the server-resolved action.link.",
      event: {
        action:
          "The action object that was clicked ({ _id, kind, status, link, message, … }).",
      },
    },
  },
};

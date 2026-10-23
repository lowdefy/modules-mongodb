export default {
  category: "display",
  // Embedded FileDownload lists register a CallAPI action that reads _event;
  // a page's own config may use neither, so they are counted from here.
  actions: ["CallAPI"],
  operators: ["_event"],
  icons: [],
  cssKeys: {
    element: "The outer EventsTimeline container.",
    timeline: "The antd Timeline component.",
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

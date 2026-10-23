export default {
  category: "display",
  // Embedded FileDownload lists register a CallAPI action that reads _event;
  // a page's own config may use neither, so they are counted from here.
  actions: ["CallAPI"],
  operators: ["_event"],
  icons: ["location", "Waypoints", "user", "attach"],
  slots: {
    extra: "Extra content in the header.",
  },
  cssKeys: {
    element: "The Descriptions element.",
    content: "The Descriptions content.",
    label: "The Descriptions label.",
  },
};

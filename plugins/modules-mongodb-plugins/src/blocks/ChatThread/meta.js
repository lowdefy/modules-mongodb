export default {
  category: "display",
  icons: [],
  valueType: null,
  cssKeys: {
    element: "The scrollable thread container.",
    bubble: "Each message bubble.",
    day: "The centered day-separator pill.",
  },
  properties: {
    type: "object",
    additionalProperties: false,
    properties: {
      messages: {
        type: "array",
        description:
          "Message docs: { _id, author_type, author: { name, avatar_url }, body, attachments: [{ name, mime, url }], seq }. Sorted, deduped by _id, and grouped internally.",
      },
      ownAuthorType: {
        type: "string",
        default: "user",
        description:
          'author_type rendered as "own" (right-aligned, primary-tinted).',
      },
      maxHeight: {
        type: ["string", "number"],
        default: "55vh",
        description:
          "Max height of the scroll container. The thread sticks to the bottom while the reader is there; scrolling up to read history disables the auto-scroll until they return.",
      },
      emptyText: {
        type: "string",
        description: "Centered text shown when there are no messages.",
      },
    },
  },
};

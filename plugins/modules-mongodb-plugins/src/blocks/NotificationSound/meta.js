export default {
  category: "input",
  valueType: "boolean",
  icons: [],
  cssKeys: {
    element: "The Sound switch and its label (only drawn with toggle).",
  },
  properties: {
    type: "object",
    additionalProperties: false,
    properties: {
      app: {
        type: "string",
        description:
          "Names the app the setting belongs to, so apps sharing an origin keep their own. Every instance in one app passes the same value.",
      },
      toggle: {
        type: "boolean",
        default: false,
        description:
          "Draw the Sound switch. Without it the block draws nothing and only plays.",
      },
      label: {
        type: "string",
        default: "Sound",
        description: "The switch's label.",
      },
    },
  },
  events: {
    onChange: {
      description:
        "Triggered when the viewer turns the sound on or off, in this tab or another.",
    },
  },
  methods: {
    play: {
      description:
        "Chirp once for a batch of notifications, when the viewer has turned the sound on and no other tab has chirped for these ids. Takes one argument, the batch's notification ids. Resolves true when it played.",
    },
  },
};

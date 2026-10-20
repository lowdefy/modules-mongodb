export default {
  category: "input",
  valueType: "boolean",
  icons: [],
  cssKeys: {
    element:
      "The Sound switch and its label, and the sound dropdown (only drawn with toggle or picker).",
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
          "Draw the Sound switch. Without it or picker the block draws nothing and only plays.",
      },
      label: {
        type: "string",
        default: "Sound",
        description: "The switch's label, and the dropdown's accessible name.",
      },
      sounds: {
        type: "array",
        default: [],
        description:
          "The sounds the viewer can pick from. The first is the default, and a pick no longer listed falls back to it. A sound without src is the synthesised chirp. Empty plays the chirp. Pass the same list to every instance in one app.",
        items: {
          type: "object",
          required: ["id", "title"],
          properties: {
            id: {
              type: "string",
              description: "Stored as the viewer's pick.",
            },
            title: {
              type: "string",
              description: "The sound's name in the dropdown.",
            },
            description: {
              type: "string",
              description: "A line under the name in the dropdown.",
            },
            src: {
              type: "string",
              description:
                "URL of the sound file, such as one in the app's public folder. Without it the sound is the chirp.",
            },
          },
        },
      },
      picker: {
        type: "boolean",
        default: false,
        description:
          "Draw a dropdown of the sounds, each with a button to hear it. Picking one stores it, turns the sound on and plays it.",
      },
      offLabel: {
        type: "string",
        default: "Off",
        description: "What the dropdown reads while the sound is off.",
      },
    },
  },
  events: {
    onChange: {
      description:
        "Triggered when the viewer turns the sound on or off, or picks a sound, in this tab or another.",
    },
  },
  methods: {
    play: {
      description:
        "Play the viewer's picked sound once for a batch of notifications, when the viewer has turned the sound on and no other tab has played for these ids. Takes one argument, the batch's notification ids. Resolves true when it played.",
    },
  },
};

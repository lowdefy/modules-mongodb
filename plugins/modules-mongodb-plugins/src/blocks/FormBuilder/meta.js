export default {
  category: "input-container",
  valueType: "object",
  icons: [
    "AiOutlineAppstore",
    "AiOutlineDrag",
    "AiOutlineDelete",
    "AiOutlineWarning",
  ],
  slots: {
    chat: "Rendered below the YAML editor in the assistant panel (AgentChat block goes here).",
  },
  cssKeys: {
    element: "The FormBuilder workspace container.",
    palette: "The left palette pane.",
    canvas: "The center canvas pane.",
    assistant: "The right assistant panel (YAML editor and chat slot).",
  },
  events: {
    onChange: "Triggered whenever the built form config changes.",
    onBlockSelect: {
      description: "Triggered when a block is selected on the canvas.",
      event: {
        path: "JSON path into value.blocks (e.g. 'blocks.2.blocks.0').",
        blockId: "The selected block's id.",
        type: "The selected block's type.",
        config: "The selected block's full authored config.",
        yaml: "The selected block serialized as YAML.",
      },
    },
  },
  properties: {
    type: "object",
    additionalProperties: false,
    properties: {
      palette: {
        type: "object",
        description: "Allowed block palette.",
        additionalProperties: false,
        properties: {
          blocks: {
            type: "array",
            items: { type: "string" },
            description:
              "Allowed block type names. Defaults to the curated form-builder palette when unset.",
          },
        },
      },
      mock: {
        type: "object",
        description:
          "Mock inputs used by the operator preview: state, requests, global, user, urlQuery.",
        docs: { displayType: "yaml" },
        properties: {
          state: { type: "object", description: "Mock page state." },
          requests: { type: "object", description: "Mock request responses keyed by request id." },
          global: { type: "object", description: "Mock global state." },
          user: { type: "object", description: "Mock authenticated user." },
          urlQuery: { type: "object", description: "Mock URL query parameters." },
        },
      },
      height: {
        type: "string",
        default: "70vh",
        description: "Height of the builder workspace.",
      },
    },
  },
};

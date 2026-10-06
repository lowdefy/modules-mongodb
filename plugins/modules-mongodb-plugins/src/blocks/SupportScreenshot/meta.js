export default {
  category: "display",
  valueType: null,
  icons: ["Camera"],
  cssKeys: {
    element: "The Take screenshot button.",
  },
  properties: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: {
        type: "string",
        default: "Take screenshot",
        description: "The button text.",
      },
      hideSelectors: {
        type: "array",
        items: { type: "string" },
        description:
          "CSS selectors of elements left out of the screenshot, such as the panel the button sits in.",
      },
      maskSelectors: {
        type: "array",
        items: { type: "string" },
        description:
          "CSS selectors drawn as solid boxes in the screenshot, beside the built-in password inputs (also one toggled to show) and [data-support-mask].",
      },
      s3PostPolicyRequestId: {
        type: "string",
        description:
          "The request that returns the S3 presigned POST policy for the upload, as FileManager takes it. It receives _event: file ({ name, size, type, lastModified, uid }).",
      },
      fileName: {
        type: "string",
        default: "screenshot.png",
        description: "The uploaded file's name.",
      },
      disabled: {
        type: "boolean",
        default: false,
        description: "Disable the button and the capture method.",
      },
    },
  },
  events: {
    onUse: {
      description:
        "Triggered after the edited screenshot is uploaded and the editor closes.",
      event: {
        file: "The uploaded file: { key, name, size, type }.",
      },
    },
    onError: {
      description:
        "Triggered when the capture or the upload fails. A failed upload keeps the editor open.",
      event: {
        message: "A user-facing description of what went wrong.",
      },
    },
  },
  methods: {
    capture: {
      description:
        "Capture the page and open the editor, as the button does. For a page that wants its own button.",
    },
  },
};

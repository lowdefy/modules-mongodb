export default {
  category: "input",
  valueType: "string",
  icons: ["ImagePlus", "FileText", "CircleAlert", "X"],
  cssKeys: {
    element: "The bordered box around the whole composer.",
    textarea: "The text area.",
    files: "The row of attached-file chips.",
    bar: "The bottom bar holding the attach button, the hint and Send.",
  },
  properties: {
    type: "object",
    additionalProperties: false,
    properties: {
      placeholder: {
        type: "string",
        description: "The text area's placeholder.",
      },
      maxLength: {
        type: "integer",
        description: "The most characters the message takes.",
      },
      minRows: {
        type: "integer",
        default: 2,
        description: "The text area's height, in rows, when it is empty.",
      },
      maxRows: {
        type: "integer",
        default: 8,
        description: "The rows the text area grows to before it scrolls.",
      },
      s3PostPolicyRequestId: {
        type: "string",
        description:
          "The request that returns the S3 presigned POST policy for an upload, as FileManager takes it. It receives _event: file ({ name, size, type, lastModified, uid }).",
      },
      files: {
        type: "array",
        default: [],
        description:
          "The files attached so far, { key, name, size?, type? } each. The page keeps them in state and writes them back from onUploaded and onRemove.",
        items: { type: "object" },
      },
      accept: {
        type: "string",
        default: "image/*,.pdf",
        description:
          "The attach button's file filter. Images and PDFs are the only types the block takes, whatever this says.",
      },
      maxFiles: {
        type: "integer",
        default: 5,
        description: "The most files that can be attached.",
      },
      maxSize: {
        type: "integer",
        default: 10485760,
        description: "The largest file, in bytes. The policy should cap it too.",
      },
      hint: {
        type: "string",
        default: "Markdown",
        description: "The muted text at the bottom, before the send shortcut.",
      },
      submitHint: {
        type: "boolean",
        default: true,
        description: "Show the send shortcut after the hint.",
      },
      submitLabel: {
        type: "string",
        default: "Send",
        description: "The send button's text.",
      },
      loading: {
        type: "boolean",
        default: false,
        description:
          "Show the send button loading and refuse a second send, while the page sends.",
      },
      disabled: {
        type: "boolean",
        default: false,
        description: "Disable typing, attaching and sending.",
      },
    },
  },
  events: {
    onChange: "Triggered when the message text changes.",
    onSubmit: {
      description:
        "Triggered by the send button or Ctrl/Cmd+Enter, when the message has text and no upload is running.",
      event: {
        message: "The message text.",
        files: "The attached files: [{ key, name, size, type }].",
      },
    },
    onUploaded: {
      description: "Triggered when a file is stored in the bucket.",
      event: {
        file: "The stored file: { key, name, size, type }.",
        files: "All attached files, the new one last.",
      },
    },
    onRemove: {
      description: "Triggered when the user removes an attached file.",
      event: {
        file: "The removed file.",
        files: "The files left.",
      },
    },
    onError: {
      description:
        "Triggered when a file is refused (wrong type, too large, over the limit) or its upload fails.",
      event: {
        message: "A user-facing description of what went wrong.",
        file: "The file's name.",
      },
    },
  },
};

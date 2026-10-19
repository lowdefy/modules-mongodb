export default {
  category: "input",
  valueType: "string",
  icons: [],
  cssKeys: {
    element: "The outer AvatarUpload container.",
  },
  events: {
    onChange:
      "Triggered when a new photo is picked and compressed, or the photo is removed.",
    onError: {
      description:
        "Triggered when the picked file is not an image or cannot be compressed under maxBytes.",
      event: {
        message: "A user-facing description of what went wrong.",
      },
    },
  },
};

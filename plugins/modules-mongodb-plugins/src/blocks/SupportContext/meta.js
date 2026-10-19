export default {
  category: "input",
  valueType: "object",
  icons: [],
  properties: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  events: {
    onSnapshot: {
      description:
        "Triggered by the snapshot method, after the block's value is set to the snapshot.",
      event: {
        url: "The page URL.",
        user_agent: "The browser's user agent string.",
        viewport:
          "{ width, height } of the browser window's viewport, in CSS pixels.",
        screen: "{ width, height, pixel_ratio } of the screen.",
        locale: "The browser's language, such as en-ZA.",
        timezone: "The IANA time zone, such as Africa/Johannesburg.",
        errors:
          "The tab's last 20 errors, oldest first: { at, kind: console | error | rejection, message, stack? }.",
      },
    },
  },
  methods: {
    snapshot: {
      description:
        "Read the browser's details and the tab's recent errors into the block's value, and fire onSnapshot with them.",
    },
  },
};

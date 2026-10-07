/**
 * SupportWebhook — checks that a support webhook delivery was signed by
 * Pelican with the app's webhook secret. Its one request, SupportWebhookVerify,
 * is what an endpoint's `webhook: { verify }` gate runs.
 */
import SupportWebhookVerify from "./SupportWebhookVerify.js";

export default {
  schema: {
    type: "object",
    properties: {
      secret: {
        type: ["string", "null"],
        description:
          "The webhook signing secret from the deployment's support app in Pelican (via _secret). Without one, every delivery fails verification.",
      },
    },
  },
  meta: { tenant: false },
  requests: {
    SupportWebhookVerify,
  },
};

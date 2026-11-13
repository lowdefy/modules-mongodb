/**
 * The AI Gateway's routing options for an AiText request, or undefined when
 * the request asks for none.
 *
 * The text sent can carry personal data. `zeroDataRetention: true` routes only
 * to providers that keep nothing, and `only` names the providers allowed (for
 * example ["anthropic"]), so the request never reaches a host the app has not
 * agreed to.
 */
export default function gatewayOptions({ zeroDataRetention, only } = {}) {
  const gateway = {
    ...(zeroDataRetention === true && { zeroDataRetention: true }),
    ...(Array.isArray(only) && only.length > 0 && { only }),
  };
  return Object.keys(gateway).length > 0 ? gateway : undefined;
}

export const gatewaySchemaProperties = {
  zeroDataRetention: {
    type: ["boolean", "null"],
    description:
      "Route only to gateway providers with a zero data retention policy.",
  },
  only: {
    type: ["array", "null"],
    items: { type: "string" },
    description:
      'Gateway providers the request may be routed to, e.g. ["anthropic"]. Empty or null for any.',
  },
};

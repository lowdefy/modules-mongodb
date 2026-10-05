import GenerateChatTitle, {
  buildProviderOptions,
} from "./GenerateChatTitle.js";

test("asks the gateway for zero data retention only when requested", () => {
  expect(buildProviderOptions({ zeroDataRetention: true })).toEqual({
    openai: { reasoningEffort: "low" },
    gateway: { zeroDataRetention: true },
  });
  expect(buildProviderOptions({})).toEqual({
    openai: { reasoningEffort: "low" },
  });
  expect(buildProviderOptions({ zeroDataRetention: null })).not.toHaveProperty(
    "gateway",
  );
});

test("passes the requested reasoning effort through", () => {
  expect(buildProviderOptions({ reasoningEffort: "medium" }).openai).toEqual({
    reasoningEffort: "medium",
  });
});

test("returns a null title rather than throwing when the connection has no apiKey", async () => {
  await expect(
    GenerateChatTitle({ connection: {}, request: { prompt: "q", reply: "a" } }),
  ).resolves.toMatchObject({ title: null });
});

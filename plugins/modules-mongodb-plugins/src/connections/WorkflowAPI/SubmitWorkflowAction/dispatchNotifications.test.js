import dispatchNotifications from "./dispatchNotifications.js";

function makeContext({ callApi, user } = {}) {
  return {
    callApi: callApi ?? jest.fn(async () => ({ success: true, response: {} })),
    user: user ?? { id: "u1", roles: ["account-manager"] },
  };
}

test("dispatchNotifications: calls send-notification with event_ids only", async () => {
  const callApi = jest.fn(async () => ({ success: true, response: {} }));
  const context = makeContext({ callApi });

  await dispatchNotifications(context, "EV-1");

  expect(callApi).toHaveBeenCalledTimes(1);
  const [endpoint, payload, options] = callApi.mock.calls[0];
  expect(endpoint).toEqual({ id: "send-notification", module: "notifications" });
  expect(payload).toEqual({ event_ids: ["EV-1"] });
  expect(Object.keys(payload)).toEqual(["event_ids"]);
  expect(options).toEqual({ user: context.user });
});

test("dispatchNotifications: returns undefined on success", async () => {
  const context = makeContext();
  const result = await dispatchNotifications(context, "EV-1");
  expect(result).toBeUndefined();
});

test("dispatchNotifications: throws with step marker on callApi failure", async () => {
  const callApi = jest.fn(async () => ({
    success: false,
    error: { message: "boom" },
  }));
  const context = makeContext({ callApi });

  await expect(dispatchNotifications(context, "EV-1")).rejects.toMatchObject({
    message: expect.stringMatching(/send-notification failed: boom/),
    step: "dispatch-notifications",
    cause: { message: "boom" },
  });
});

test("dispatchNotifications: failure with missing error.message still throws", async () => {
  const callApi = jest.fn(async () => ({ success: false }));
  const context = makeContext({ callApi });

  await expect(dispatchNotifications(context, "EV-1")).rejects.toMatchObject({
    message: expect.stringMatching(/send-notification failed: unknown/),
    step: "dispatch-notifications",
  });
});

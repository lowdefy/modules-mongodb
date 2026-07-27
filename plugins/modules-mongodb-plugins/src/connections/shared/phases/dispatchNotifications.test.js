import dispatchNotifications from "./dispatchNotifications.js";

// Shipped contract: callApi({ endpointId, payload }) resolves the target's
// :return value — null for send-notification (default empty send_routine) —
// and throws on failure.
function makeContext({ callApi } = {}) {
  return {
    callApi: callApi ?? jest.fn(async () => null),
    connection: {
      endpoints: { send_notification: "notifications/send-notification" },
    },
  };
}

test("dispatchNotifications: calls send-notification with event_ids only", async () => {
  const callApi = jest.fn(async () => null);
  const context = makeContext({ callApi });

  await dispatchNotifications(context, "EV-1");

  expect(callApi).toHaveBeenCalledTimes(1);
  expect(callApi).toHaveBeenCalledWith({
    endpointId: "notifications/send-notification",
    payload: { event_ids: ["EV-1"] },
  });
  const { payload } = callApi.mock.calls[0][0];
  expect(Object.keys(payload)).toEqual(["event_ids"]);
});

test("dispatchNotifications: returns undefined on success", async () => {
  const context = makeContext();
  const result = await dispatchNotifications(context, "EV-1");
  expect(result).toBeUndefined();
});

test("dispatchNotifications: a callApi throw propagates raw", async () => {
  const boom = new Error("boom");
  const callApi = jest.fn(async () => {
    throw boom;
  });
  const context = makeContext({ callApi });

  await expect(dispatchNotifications(context, "EV-1")).rejects.toBe(boom);
});

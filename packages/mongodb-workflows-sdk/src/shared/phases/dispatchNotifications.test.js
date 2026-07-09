import dispatchNotifications from "./dispatchNotifications.js";

// Callback contract (workflows-sdk-split D2): `sendNotification({ event_ids })`
// resolves null on success and throws on failure. Absent callback → silent no-op.
function makeContext({ sendNotification = jest.fn(async () => null) } = {}) {
  return { callbacks: { sendNotification } };
}

test("dispatchNotifications: calls sendNotification with event_ids only", async () => {
  const sendNotification = jest.fn(async () => null);
  const context = makeContext({ sendNotification });

  await dispatchNotifications(context, "EV-1");

  expect(sendNotification).toHaveBeenCalledTimes(1);
  expect(sendNotification).toHaveBeenCalledWith({ event_ids: ["EV-1"] });
  const payload = sendNotification.mock.calls[0][0];
  expect(Object.keys(payload)).toEqual(["event_ids"]);
});

test("dispatchNotifications: returns undefined on success", async () => {
  const context = makeContext();
  const result = await dispatchNotifications(context, "EV-1");
  expect(result).toBeUndefined();
});

test("dispatchNotifications: silent no-op when callbacks.sendNotification is absent", async () => {
  const context = { callbacks: {} };
  await expect(dispatchNotifications(context, "EV-1")).resolves.toBeUndefined();
});

test("dispatchNotifications: a sendNotification throw propagates raw", async () => {
  const boom = new Error("boom");
  const sendNotification = jest.fn(async () => {
    throw boom;
  });
  const context = makeContext({ sendNotification });

  await expect(dispatchNotifications(context, "EV-1")).rejects.toBe(boom);
});

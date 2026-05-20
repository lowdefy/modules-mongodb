/**
 * Dispatch a notification for the just-emitted log event.
 *
 * The consuming app's `send_routine` (notifications module var) re-fetches
 * the event doc to read references and metadata, so `event_ids` is the
 * only field on the payload. Adding extras risks the routine drifting
 * from the doc on disk.
 *
 * Silent no-op when the app hasn't wired a `send_routine` — the
 * notifications module ships an empty default routine.
 *
 * @param {object} context - handler context (must carry callApi, user)
 * @param {string} eventId - just-dispatched event's _id (= context.eventId)
 * @returns {Promise<void>}
 */
async function dispatchNotifications(context, eventId) {
  const result = await context.callApi(
    { id: "send-notification", module: "notifications" },
    { event_ids: [eventId] },
    { user: context.user },
  );

  if (!result.success) {
    const err = new Error(
      `dispatchNotifications: send-notification failed: ${result.error?.message ?? "unknown"}`,
    );
    err.cause = result.error;
    err.step = "dispatch-notifications";
    throw err;
  }
}

export default dispatchNotifications;

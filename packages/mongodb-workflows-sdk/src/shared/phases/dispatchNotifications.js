/**
 * Dispatch a notification for the just-emitted log event via the injected
 * `sendNotification` callback (workflows-sdk-split D2).
 *
 * The consuming app's notification routine re-fetches the event doc to read
 * references and metadata, so `event_ids` is the only field on the payload.
 * Adding extras risks the routine drifting from the doc on disk.
 *
 * Silent no-op when the caller hasn't wired a `sendNotification` callback —
 * the same posture as an app without a notification routine.
 *
 * Throws propagate to the caller (commitPlan step-4 catch).
 *
 * @param {object} context - handler context (must carry callbacks)
 * @param {string} eventId - just-dispatched event's _id (= context.event_id)
 * @returns {Promise<void>}
 */
async function dispatchNotifications(context, eventId) {
  if (typeof context.callbacks.sendNotification !== "function") {
    return;
  }
  await context.callbacks.sendNotification({ event_ids: [eventId] });
}

export default dispatchNotifications;

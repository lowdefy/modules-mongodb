/**
 * Dispatch a notification for the just-emitted log event.
 *
 * The consuming app's `send_routine` (notifications module var) re-fetches
 * the event doc to read references and metadata, so `event_ids` is the
 * only field on the payload. Adding extras risks the routine drifting
 * from the doc on disk.
 *
 * Silent no-op when the app hasn't wired a `send_routine` — the
 * notifications module ships an empty default routine, so `callApi`
 * resolves `null` (routine ends without `:return`).
 *
 * Shipped contract: `callApi({ endpointId, payload })` throws on failure;
 * throws propagate to the caller (commitPlan step-4 catch; legacy
 * handleSubmit step 8). The endpoint id is the build-resolved opaque
 * string from `connection.endpoints.send_notification`.
 *
 * @param {object} context - handler context (must carry callApi, connection)
 * @param {string} eventId - just-dispatched event's _id (= context.eventId)
 * @returns {Promise<void>}
 */
async function dispatchNotifications(context, eventId) {
  await context.callApi({
    endpointId: context.connection.endpoints.send_notification,
    payload: { event_ids: [eventId] },
  });
}

export default dispatchNotifications;

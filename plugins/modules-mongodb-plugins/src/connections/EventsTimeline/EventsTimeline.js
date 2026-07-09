import schema from "./schema.js";
import makeWorkflowRequest from "../lowdefyAdapter.js";

// GetEventsTimeline's logic lives in @lowdefy/mongodb-workflows-sdk (it shares
// the engine's access/render internals); this connection is the thin Lowdefy
// wiring over it (workflows-sdk-split design).
const EventsTimeline = {
  schema,
  requests: {
    GetEventsTimeline: makeWorkflowRequest("getEventsTimeline", {
      checkRead: false,
      checkWrite: false,
    }),
  },
};

export default EventsTimeline;

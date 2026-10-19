import schema from "./schema.js";
import GetEventsTimeline from "../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js";

const EventsTimeline = {
  schema,
  // Runtime tenant contract declaration: the resolver enforces the wall by
  // scoping the events $match and both $lookup sub-pipelines to the verdict.
  // Data-set journeys redirect it: it reads only from databaseUri and
  // databaseName (mongo/getMongoDb.js).
  meta: { tenant: true, dataSet: "redirect" },
  requests: {
    GetEventsTimeline,
  },
};

export default EventsTimeline;

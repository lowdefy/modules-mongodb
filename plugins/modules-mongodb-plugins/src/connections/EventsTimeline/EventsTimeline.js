import schema from './schema.js';
import GetEventsTimeline from '../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js';

const EventsTimeline = {
  schema,
  requests: {
    GetEventsTimeline,
  },
};

export default EventsTimeline;

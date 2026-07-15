import schema from './schema.js';
import GetEventsTimeline from './GetEventsTimeline/GetEventsTimeline.js';

const EventsTimeline = {
  schema,
  requests: {
    GetEventsTimeline,
  },
};

export default EventsTimeline;

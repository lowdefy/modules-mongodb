import schema from "./schema.js";
import AnalyticsQuery from "./AnalyticsQuery/AnalyticsQuery.js";

// Read-only by construction: AnalyticsQuery is the connection's only request,
// and its compiler cannot emit write stages.
const ReportingData = {
  schema,
  requests: {
    AnalyticsQuery,
  },
};

export default ReportingData;

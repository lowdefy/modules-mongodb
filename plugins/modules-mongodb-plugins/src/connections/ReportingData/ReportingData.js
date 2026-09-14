import schema from "./schema.js";
import AnalyticsPipeline from "./AnalyticsPipeline/AnalyticsPipeline.js";

// Read-only by construction: AnalyticsPipeline is the connection's only
// request, and validatePipeline rejects every write stage.
const ReportingData = {
  schema,
  requests: {
    AnalyticsPipeline,
  },
};

export default ReportingData;

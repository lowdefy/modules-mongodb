import * as metas from "../../metas.js";

// Lowdefy counts a page's action and operator types from its config and from
// block metas, never from events a block registers in code. A block that
// downloads through FileDownload's CallAPI action must declare both, or a page
// that uses neither itself sends a literal { _event } or fails.
test.each([
  "FileDownload",
  "FileManager",
  "EventsTimeline",
  "DataDescriptions",
  "SmartDescriptions",
])("%s declares the CallAPI action and the _event operator", (blockType) => {
  expect(metas[blockType].actions).toContain("CallAPI");
  expect(metas[blockType].operators).toContain("_event");
});

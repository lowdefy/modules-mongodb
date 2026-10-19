import { useEffect } from "react";
import { withBlockDefaults } from "@lowdefy/block-utils";

import buildSnapshot from "./buildSnapshot.js";
import { GLOBAL_KEY, installRecorder } from "./recorder.js";

// Runs when the plugin's blocks load, before the first page renders, so
// errors from the very first page's onInit are kept.
if (typeof window !== "undefined") installRecorder(window);

const SupportContext = ({ methods }) => {
  useEffect(() => {
    methods.registerMethod("snapshot", async () => {
      const snapshot = buildSnapshot(window, window[GLOBAL_KEY]);
      methods.setValue(snapshot);
      await methods.triggerEvent({ name: "onSnapshot", event: snapshot });
      return snapshot;
    });
  }, []);
  return null;
};

export default withBlockDefaults(SupportContext);

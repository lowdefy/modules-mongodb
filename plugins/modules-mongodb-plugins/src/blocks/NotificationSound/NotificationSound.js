// NotificationSound: the chirp that plays when a live popup notification
// arrives, and the viewer's switch for it. The value is the viewer's setting,
// kept in localStorage per app and off until they turn it on. With `toggle`
// the block draws a small "Sound" switch; without it the block draws nothing
// and only plays, so the layout can mount one on every page.
//
// play(ids) reads the stored setting at the moment it is called, so an
// instance on another page, or in another tab, always follows the latest
// switch. Each batch chirps once across tabs and reloads (claimNotice.js).
import React, { useCallback, useEffect, useRef } from "react";
import { Switch } from "antd";
import { withBlockDefaults } from "@lowdefy/block-utils";

import { playChirp, unlockAudio } from "./chirp.js";
import {
  claimBatch,
  readSetting,
  settingKey,
  writeSetting,
} from "./claimNotice.js";

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function claimEnv() {
  return {
    storage: browserStorage(),
    locks: window.navigator?.locks ?? null,
    hidden: window.document?.visibilityState === "hidden",
  };
}

const IconVolume = ({ muted }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    {muted ? (
      <path d="m22 9-6 6M16 9l6 6" />
    ) : (
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    )}
  </svg>
);

const NotificationSound = ({
  blockId,
  classNames = {},
  methods,
  properties,
  styles = {},
  value,
}) => {
  const key = settingKey(properties.app);
  const keyRef = useRef(key);
  keyRef.current = key;

  // State follows the stored setting on mount and whenever another tab
  // changes it.
  useEffect(() => {
    methods.setValue(readSetting(browserStorage(), key));
    const onStorage = (event) => {
      if (event.key !== keyRef.current) return;
      methods.setValue(event.newValue === "on");
      methods.triggerEvent({ name: "onChange" });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  useEffect(() => {
    methods.registerMethod("play", async (ids) => {
      if (!readSetting(browserStorage(), keyRef.current)) return false;
      if (!(await claimBatch(ids, claimEnv()))) return false;
      return playChirp();
    });
  });

  const onToggle = useCallback(
    (checked) => {
      writeSetting(browserStorage(), key, checked);
      methods.setValue(checked);
      methods.triggerEvent({ name: "onChange" });
      // The switch is a gesture, so the chirp it previews is allowed to play.
      if (checked) {
        unlockAudio();
        setTimeout(() => playChirp(), 50);
      }
    },
    [key],
  );

  if (!properties.toggle) {
    return <span id={blockId} style={{ display: "none" }} />;
  }

  const label = properties.label ?? "Sound";
  return (
    <label
      id={blockId}
      className={classNames.element}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        color: "var(--ant-color-text-secondary)",
        fontSize: "var(--ant-font-size, 14px)",
        whiteSpace: "nowrap",
        ...styles.element,
      }}
      title={value ? "Sound on for new notifications" : "Sound off"}
    >
      <IconVolume muted={!value} />
      <span>{label}</span>
      <Switch
        id={`${blockId}_input`}
        size="small"
        checked={!!value}
        onChange={onToggle}
        aria-label={label}
      />
    </label>
  );
};

export default withBlockDefaults(NotificationSound);

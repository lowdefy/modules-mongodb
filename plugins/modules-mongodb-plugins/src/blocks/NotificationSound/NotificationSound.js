// NotificationSound: the sound that plays when a live popup notification
// arrives, and the viewer's controls for it. The value is the viewer's
// on/off setting, kept in localStorage per app and off until they turn it on.
// With `toggle` the block draws a small "Sound" switch, and with `picker` a
// dropdown of the app's `sounds`; without either it draws nothing and only
// plays, so the layout can mount one on every page.
//
// play(ids) reads the stored setting and pick at the moment it is called, so
// an instance on another page, or in another tab, always follows the latest
// change. Each batch plays once across tabs and reloads (claimNotice.js).
import React, { useEffect, useRef, useState } from "react";
import { Button, Select, Switch } from "antd";
import { withBlockDefaults } from "@lowdefy/block-utils";

import { unlockAudio } from "./chirp.js";
import {
  claimBatch,
  readSetting,
  readSound,
  settingKey,
  soundKey,
  writeSetting,
  writeSound,
} from "./claimNotice.js";
import { loadSound, playSound, resolveSound } from "./sounds.js";

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

// Plays a preview after a gesture has unlocked the audio.
function preview(sound) {
  unlockAudio();
  setTimeout(() => playSound(sound), 50);
}

const NotificationSound = ({
  blockId,
  classNames = {},
  methods,
  properties,
  styles = {},
  value,
}) => {
  const key = settingKey(properties.app);
  const pickKey = soundKey(properties.app);
  const sounds = properties.sounds ?? [];
  const latest = useRef();
  latest.current = { key, pickKey, sounds };

  const [pick, setPick] = useState(null);
  const sound = resolveSound(sounds, pick);

  // State follows the stored setting and pick on mount and whenever another
  // tab changes them.
  useEffect(() => {
    methods.setValue(readSetting(browserStorage(), key));
    setPick(readSound(browserStorage(), pickKey));
    const onStorage = (event) => {
      if (event.key === latest.current.pickKey) {
        setPick(event.newValue);
      } else if (event.key === latest.current.key) {
        methods.setValue(event.newValue === "on");
      } else {
        return;
      }
      methods.triggerEvent({ name: "onChange" });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, pickKey]);

  // Decode the picked file ahead of the first notification.
  useEffect(() => {
    if (sound?.src) loadSound(sound.src);
  }, [sound?.src]);

  useEffect(() => {
    methods.registerMethod("play", async (ids) => {
      const { key, pickKey, sounds } = latest.current;
      const storage = browserStorage();
      if (!readSetting(storage, key)) return false;
      if (!(await claimBatch(ids, claimEnv()))) return false;
      return playSound(resolveSound(sounds, readSound(storage, pickKey)));
    });
  });

  // The switch and the dropdown are gestures, so the previews they play are
  // allowed to sound.
  const onToggle = (checked) => {
    writeSetting(browserStorage(), key, checked);
    methods.setValue(checked);
    methods.triggerEvent({ name: "onChange" });
    if (checked) preview(sound);
  };

  const onPick = (id) => {
    const storage = browserStorage();
    writeSound(storage, pickKey, id);
    writeSetting(storage, key, true);
    setPick(id);
    methods.setValue(true);
    methods.triggerEvent({ name: "onChange" });
    preview(resolveSound(sounds, id));
  };

  if (!properties.toggle && !properties.picker) {
    return <span id={blockId} style={{ display: "none" }} />;
  }

  const label = properties.label ?? "Sound";
  const offLabel = properties.offLabel ?? "Off";
  return (
    <span
      id={blockId}
      className={classNames.element}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "var(--ant-color-text-secondary)",
        fontSize: "var(--ant-font-size, 14px)",
        whiteSpace: "nowrap",
        ...styles.element,
      }}
    >
      {properties.toggle && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
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
      )}
      {properties.picker && (
        <Select
          id={`${blockId}_picker`}
          aria-label={label}
          style={{ minWidth: 160 }}
          popupMatchSelectWidth={240}
          value={value ? sound?.id : undefined}
          placeholder={offLabel}
          onChange={onPick}
          options={sounds.map(({ id, title }) => ({ value: id, label: title }))}
          optionRender={(option) => {
            const item = sounds.find(({ id }) => id === option.value);
            return (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block" }}>{item?.title}</span>
                  {item?.description && (
                    <span
                      style={{
                        display: "block",
                        whiteSpace: "normal",
                        fontSize: "var(--ant-font-size-sm, 12px)",
                        color: "var(--ant-color-text-secondary)",
                      }}
                    >
                      {item.description}
                    </span>
                  )}
                </span>
                <Button
                  type="text"
                  size="small"
                  icon={<IconVolume />}
                  aria-label={`Hear ${item?.title}`}
                  title={`Hear ${item?.title}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    preview(item);
                  }}
                />
              </span>
            );
          }}
        />
      )}
    </span>
  );
};

export default withBlockDefaults(NotificationSound);

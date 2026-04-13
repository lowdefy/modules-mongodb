/*
  Copyright 2020-2026 Lowdefy, Inc

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import React, { useState, useMemo } from "react";
import { Timeline, Modal, Badge, Tooltip, Card } from "antd";
import { withBlockDefaults } from "@lowdefy/block-utils";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import DOMPurify from "dompurify";

dayjs.extend(duration);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DOT_COLOR = "var(--ant-color-border)";

function sanitize(html) {
  if (html == null) return "";
  return DOMPurify.sanitize(String(html));
}

/**
 * Build initials from a name string.  Takes the first letter of the first
 * word and the first letter of the last word (or just the first letter when
 * the name is a single word).
 */
function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic-ish color from a string, used to give each user a consistent
 * avatar background.
 */
function stringToColor(str) {
  if (!str) return "#888";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = [
    "#f56a00",
    "#7265e6",
    "#ffbf00",
    "#00a2ae",
    "#eb2f96",
    "#1890ff",
    "#52c41a",
    "#fa541c",
    "#13c2c2",
    "#722ed1",
  ];
  return palette[Math.abs(hash) % palette.length];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ user }) {
  if (!user) return null;

  const size = 32;

  if (user.picture) {
    return (
      <img
        src={user.picture}
        alt={user.name || "User"}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  const initials = getInitials(user.name);
  const bg = stringToColor(user.name);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initials}
    </div>
  );
}

function TimeAgo({ timestamp, userName }) {
  if (!timestamp) return null;

  const ts = dayjs(timestamp);
  if (!ts.isValid()) return null;

  const diff = dayjs.duration(dayjs().diff(ts));

  let label;
  const totalMinutes = Math.floor(diff.asMinutes());
  const totalHours = Math.floor(diff.asHours());
  const totalDays = Math.floor(diff.asDays());
  const totalMonths = Math.floor(diff.asMonths());
  const totalYears = Math.floor(diff.asYears());

  if (totalMinutes < 1) label = "just now";
  else if (totalMinutes < 60)
    label = `${totalMinutes} min${totalMinutes !== 1 ? "s" : ""} ago`;
  else if (totalHours < 24)
    label = `${totalHours} hour${totalHours !== 1 ? "s" : ""} ago`;
  else if (totalDays < 30)
    label = `${totalDays} day${totalDays !== 1 ? "s" : ""} ago`;
  else if (totalMonths < 12)
    label = `${totalMonths} month${totalMonths !== 1 ? "s" : ""} ago`;
  else label = `${totalYears} year${totalYears !== 1 ? "s" : ""} ago`;

  const tooltipTitle = [
    ts.format("YYYY-MM-DD HH:mm:ss"),
    userName ? `by ${userName}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip title={tooltipTitle}>
      <span style={{ color: "var(--ant-color-text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>
        {label}
      </span>
    </Tooltip>
  );
}

function EventTitle({ title, timestamp, userName }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        dangerouslySetInnerHTML={{ __html: sanitize(title) }}
        style={{ fontWeight: 500 }}
      />
      <TimeAgo timestamp={timestamp} userName={userName} />
    </div>
  );
}

function EventDescription({
  event,
  typeConfig,
}) {
  const user = event.created?.user;

  const cardStyle = { marginBottom: 4 };
  if (typeConfig.card_color) {
    cardStyle.backgroundColor = typeConfig.card_color;
  }
  if (typeConfig.border_color) {
    cardStyle.borderColor = typeConfig.border_color;
  }

  return (
    <Card
      size="small"
      style={cardStyle}
      styles={{ body: { padding: "12px 16px" } }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar user={user} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EventTitle
            title={event.title}
            timestamp={event.created?.timestamp}
            userName={user?.name}
          />
          <div
            dangerouslySetInnerHTML={{ __html: sanitize(event.description) }}
            style={{ marginTop: 4, fontSize: 13 }}
          />
        </div>
      </div>
    </Card>
  );
}

function EventInfo({ info, onOpenModal }) {
  if (!info) return null;
  return (
    <a
      onClick={(e) => {
        e.preventDefault();
        onOpenModal();
      }}
      style={{ fontSize: 12, cursor: "pointer" }}
    >
      Click here for more info
    </a>
  );
}

function EventInfoModal({ open, onClose, event, typeConfig }) {
  const user = event?.created?.user;
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      destroyOnClose
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar user={user} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            dangerouslySetInnerHTML={{ __html: sanitize(event?.title) }}
            style={{ fontWeight: 500 }}
          />
          <TimeAgo
            timestamp={event?.created?.timestamp}
            userName={user?.name}
          />
        </div>
      </div>
      <div
        dangerouslySetInnerHTML={{ __html: sanitize(event?.info) }}
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
}

function EventAction({ action, actionStatusConfig, methods }) {
  if (!action || !actionStatusConfig) return null;

  const statusConf = actionStatusConfig[action.status] || {};

  // Hidden when status is "blocked"
  if (action.status === "blocked") return null;

  const link = action.link;

  return (
    <div style={{ marginTop: 6 }}>
      <Card
        size="small"
        style={{
          borderColor: statusConf.border_color || "var(--ant-color-border-secondary)",
          backgroundColor: statusConf.card_color || "var(--ant-color-fill-quaternary)",
        }}
        styles={{ body: { padding: "8px 12px" } }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Badge
            color={statusConf.color || "#999"}
            text={
              <span
                dangerouslySetInnerHTML={{
                  __html: sanitize(
                    action.message || statusConf.title || action.status
                  ),
                }}
                style={{ fontSize: 13 }}
              />
            }
          />
          {link && link.pageId && (
            <a
              onClick={(e) => {
                e.preventDefault();
                if (methods && methods.triggerEvent) {
                  methods.triggerEvent({
                    name: "onActionClick",
                    event: { pageId: link.pageId, urlQuery: link.urlQuery },
                  });
                }
              }}
              style={{
                fontSize: 12,
                marginLeft: "auto",
                cursor: "pointer",
              }}
            >
              {link.title || "Go"}
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}

function EventFiles({ files, s3GetPolicyRequestId, methods }) {
  // Lazy import approach — we render the S3Download block inline.
  // S3Download expects: blockId, properties ({ s3GetPolicyRequestId, fileList }), methods
  // We dynamically import it to avoid hard failure if @lowdefy/plugin-aws is not installed.
  const [S3Download, setS3Download] = useState(null);

  React.useEffect(() => {
    import("@lowdefy/plugin-aws/blocks/S3Download/S3Download.js")
      .then((mod) => setS3Download(() => mod.default))
      .catch(() => {
        // @lowdefy/plugin-aws not available — silently skip
      });
  }, []);

  if (!s3GetPolicyRequestId || !files || files.length === 0) return null;
  if (!S3Download) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <S3Download
        blockId={`events_files_${s3GetPolicyRequestId}`}
        properties={{
          s3GetPolicyRequestId,
          fileList: files,
        }}
        methods={methods}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline Item renderer
// ---------------------------------------------------------------------------

function EventTimelineItem({
  event,
  typeConfig,
  actionStatusConfig,
  s3GetPolicyRequestId,
  methods,
  components,
}) {
  const [modalVisible, setModalVisible] = useState(false);

  const hasDescription = !!event.description;
  const hasInfo = !!event.info;
  const hasActions =
    actionStatusConfig && Array.isArray(event.actions) && event.actions.length > 0;
  const hasFiles =
    s3GetPolicyRequestId && Array.isArray(event.files) && event.files.length > 0;

  return (
    <div>
      {hasDescription ? (
        <EventDescription event={event} typeConfig={typeConfig} />
      ) : (
        <EventTitle
          title={event.title}
          timestamp={event.created?.timestamp}
          userName={event.created?.user?.name}
        />
      )}

      {hasInfo && !hasDescription && (
        <EventInfo info={event.info} onOpenModal={() => setModalVisible(true)} />
      )}

      {hasInfo && (
        <EventInfoModal
          open={modalVisible}
          onClose={() => setModalVisible(false)}
          event={event}
          typeConfig={typeConfig}
        />
      )}

      {hasActions &&
        event.actions.map((action, idx) => (
          <EventAction
            key={action.id || idx}
            action={action}
            actionStatusConfig={actionStatusConfig}
            methods={methods}
          />
        ))}

      {hasFiles && (
        <EventFiles
          files={event.files}
          s3GetPolicyRequestId={s3GetPolicyRequestId}
          methods={methods}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const EventsTimeline = ({ blockId, classNames = {}, properties, methods, components, styles = {} }) => {
  const {
    data = [],
    eventTypeConfig = {},
    actionStatusConfig,
    s3GetPolicyRequestId,
    reverse = false,
    mode = "left",
  } = properties || {};

  const enrichedData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map((event) => {
      if (!event) return { _event: {}, _typeConfig: {} };
      const typeConf = eventTypeConfig[event.type] || {};
      return {
        _event: event,
        _typeConfig: typeConf,
      };
    });
  }, [data, eventTypeConfig]);

  const items = useMemo(() => {
    return enrichedData.map(({ _event, _typeConfig }, idx) => {
      const color = _typeConfig.color || DEFAULT_DOT_COLOR;

      const item = {
        key: _event._id || _event.id || idx,
        color: color,
        children: (
          <EventTimelineItem
            event={_event}
            typeConfig={_typeConfig}
            actionStatusConfig={actionStatusConfig}
            s3GetPolicyRequestId={s3GetPolicyRequestId}
            methods={methods}
            components={components}
          />
        ),
      };

      if (_typeConfig.icon) {
        const Icon = components?.Icon;
        if (Icon) {
          item.dot = (
            <Icon
              properties={{ name: _typeConfig.icon, color: color }}
            />
          );
        }
      }

      return item;
    });
  }, [
    enrichedData,
    actionStatusConfig,
    s3GetPolicyRequestId,
    methods,
    components,
  ]);

  return (
    <div id={blockId} className={classNames.element} style={styles.element}>
      <Timeline
        className={classNames.timeline}
        style={styles.timeline}
        mode={mode}
        reverse={reverse}
        items={items}
      />
    </div>
  );
};

export default withBlockDefaults(EventsTimeline);

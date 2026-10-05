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
import { Timeline, Modal, Tooltip, Card, Button } from "antd";
import { withBlockDefaults, HtmlComponent } from "@lowdefy/block-utils";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import "./style.module.css";

dayjs.extend(duration);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DOT_COLOR = "var(--ant-color-border)";

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

function Avatar({ user, contactLink, compact }) {
  if (!user) return null;

  const size = compact ? 16 : 26;
  const fontSize = compact ? 8 : 11;

  let visual;
  if (user.picture) {
    visual = (
      <img
        src={user.picture}
        alt={user.name || "User"}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  } else {
    const initials = getInitials(user.name);
    const bg = stringToColor(user.name);
    visual = (
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
          fontSize: fontSize,
          fontWeight: 600,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {initials}
      </div>
    );
  }

  const tooltipTitle = user.name || "Unknown user";
  const wrapper = (
    <ContactLink
      contactLink={contactLink}
      userId={user.id}
      style={{ display: "inline-block", lineHeight: 0, flexShrink: 0 }}
    >
      {visual}
    </ContactLink>
  );

  return <Tooltip title={tooltipTitle}>{wrapper}</Tooltip>;
}

function contactPageLink(contactLink, userId) {
  if (!contactLink || !userId) return null;
  const { pageId, idQueryKey, idPathKey } = contactLink;
  return {
    pageId,
    pathParams: idPathKey ? { [idPathKey]: userId } : undefined,
    urlQuery: idQueryKey ? { [idQueryKey]: userId } : undefined,
  };
}

function ContactLink({ contactLink, userId, style, children }) {
  const target = contactPageLink(contactLink, userId);
  const Link = contactLink?.Link;
  if (!target || !Link) return <span style={style}>{children}</span>;
  return (
    <Link
      pageId={target.pageId}
      pathParams={target.pathParams}
      urlQuery={target.urlQuery}
      style={style}
    >
      {children}
    </Link>
  );
}

// The note editor stores each mention as `<a class="tiptap-mention"
// href="#contact-<id>">`; the timeline turns it into a link to the contact page.
const MENTION_HREF_PREFIX = "#contact-";

function linkMentions(html, contactLink) {
  if (html == null) return "";
  const markup = String(html);
  if (!markup.includes(MENTION_HREF_PREFIX)) return markup;
  const doc = new DOMParser().parseFromString(markup, "text/html");
  doc.querySelectorAll(`a[href^="${MENTION_HREF_PREFIX}"]`).forEach((a) => {
    const id = a.getAttribute("href").slice(MENTION_HREF_PREFIX.length);
    a.removeAttribute("href");
    const target = contactPageLink(contactLink, id);
    if (!target) return;
    a.setAttribute("data-page-id", target.pageId);
    if (target.pathParams)
      a.setAttribute("data-path-params", JSON.stringify(target.pathParams));
    if (target.urlQuery)
      a.setAttribute(
        "data-url-query",
        new URLSearchParams(target.urlQuery).toString(),
      );
  });
  return doc.body.innerHTML;
}

function Html({ html, contactLink, ...props }) {
  return <HtmlComponent html={linkMentions(html, contactLink)} {...props} />;
}

function TimeAgo({
  timestamp,
  userName,
  userId,
  contactLink,
}) {
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

  const content = (
    <ContactLink
      contactLink={contactLink}
      userId={userId}
      style={{
        color: "var(--ant-color-text-tertiary)",
        fontSize: 12,
        whiteSpace: "nowrap",
        textDecoration: "none",
      }}
    >
      {label}
    </ContactLink>
  );

  return <Tooltip title={tooltipTitle}>{content}</Tooltip>;
}

function EventTitle({
  title,
  timestamp,
  userName,
  userId,
  contactLink,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Html html={title} contactLink={contactLink} style={{ fontWeight: 500 }} />
      <TimeAgo
        timestamp={timestamp}
        userName={userName}
        userId={userId}
        contactLink={contactLink}
      />
    </div>
  );
}

function EventDescription({
  event,
  typeConfig,
  contactLink,
  compact,
}) {
  const user = event.created?.user;

  const cardStyle = { marginBottom: compact ? 2 : 4 };
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
      styles={{ body: { padding: compact ? "6px 10px" : "12px 16px" } }}
    >
      <div
        style={{
          display: "flex",
          gap: compact ? 8 : 10,
          alignItems: "flex-start",
        }}
      >
        <Avatar
          user={user}
          contactLink={contactLink}
          compact={compact}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EventTitle
            title={event.title}
            timestamp={event.created?.timestamp}
            userName={user?.name}
            userId={user?.id}
            contactLink={contactLink}
          />
          <Html
            div
            html={event.description}
            contactLink={contactLink}
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

function EventInfoModal({
  open,
  onClose,
  event,
  typeConfig,
  contactLink,
  compact,
}) {
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
        <Avatar
          user={user}
          contactLink={contactLink}
          compact={compact}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Html
            div
            html={event?.title}
            contactLink={contactLink}
            style={{ fontWeight: 500 }}
          />
          <TimeAgo
            timestamp={event?.created?.timestamp}
            userName={user?.name}
            userId={user?.id}
            contactLink={contactLink}
          />
        </div>
      </div>
      <Html
        div
        html={event?.info}
        contactLink={contactLink}
        style={{ marginTop: 16 }}
      />
    </Modal>
  );
}

function EventAction({
  action,
  actionStatusConfig,
  methods,
  events,
  components,
}) {
  if (!action || !actionStatusConfig) return null;

  const statusConf = actionStatusConfig[action.status] || {};

  // Hidden when status is "blocked"
  if (action.status === "blocked") return null;

  const link = action.link;
  const hasLink = !!(link && link.pageId);
  const wired = !!events.onActionClick;
  const Link = components?.Link;

  const affordanceStyle = {
    marginLeft: "auto",
    flexShrink: 0,
  };
  // Tint the button from the action's status palette (see design D3) so the CTA
  // reinforces its status rather than the app's (black) primary: a light fill
  // (`color`) with the accent (`titleColor`) as text + border. Falls back to
  // the default button styling when the status has no enum colour.
  const accent = statusConf.titleColor;
  const tintStyle = accent
    ? {
        backgroundColor: statusConf.borderColor || accent,
        borderColor: statusConf.borderColor || accent,
        color: accent,
      }
    : null;
  const buttonStyle = tintStyle
    ? { ...affordanceStyle, ...tintStyle }
    : affordanceStyle;
  const affordanceTitle = (link && link.title) || "View";

  let affordance = null;
  if (hasLink) {
    if (wired) {
      // Host-wired: fire the action object instead of navigating.
      affordance = (
        <Button
          size="small"
          style={buttonStyle}
          onClick={(e) => {
            e.preventDefault();
            if (methods && methods.triggerEvent) {
              methods.triggerEvent({
                name: "onActionClick",
                event: { action },
              });
            }
          }}
        >
          {affordanceTitle}
        </Button>
      );
    } else if (Link) {
      // Unwired: navigate via the Lowdefy Link to the server-resolved link.
      affordance = (
        <Link
          pageId={link.pageId}
          pathParams={link.pathParams}
          urlQuery={link.urlQuery}
          style={affordanceStyle}
        >
          <Button size="small" style={tintStyle || undefined}>
            {affordanceTitle}
          </Button>
        </Link>
      );
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <Card
        size="small"
        style={{
          borderColor:
            statusConf.borderColor || "var(--ant-color-border-secondary)",
          backgroundColor:
            statusConf.color || "var(--ant-color-fill-quaternary)",
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
          <Html
            html={action.message || statusConf.title || action.status}
            // Use the fixed-dark status accent for the text, matching the
            // fixed-light `statusConf.color` card background. Without it the
            // span inherits the theme text color, which is light in dark mode
            // → light-on-light (invisible). titleColor is undefined for an
            // unknown status → inherits, the correct fallback.
            style={{ fontSize: 13, color: statusConf.titleColor }}
          />
          {affordance}
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
  contactLink,
  compact,
  methods,
  events,
  components,
}) {
  const [modalVisible, setModalVisible] = useState(false);

  const hasDescription = !!event.description;
  const hasInfo = !!event.info;
  const hasActions =
    actionStatusConfig &&
    Array.isArray(event.actions) &&
    event.actions.length > 0;
  const hasFiles =
    s3GetPolicyRequestId &&
    Array.isArray(event.files) &&
    event.files.length > 0;

  return (
    <div>
      {hasDescription ? (
        <EventDescription
          event={event}
          typeConfig={typeConfig}
          contactLink={contactLink}
          compact={compact}
        />
      ) : (
        <div
          style={{
            display: "flex",
            gap: compact ? 8 : 10,
            alignItems: "center",
          }}
        >
          <Avatar
            user={event.created?.user}
            contactLink={contactLink}
            compact={compact}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <EventTitle
              title={event.title}
              timestamp={event.created?.timestamp}
              userName={event.created?.user?.name}
              userId={event.created?.user?.id}
              contactLink={contactLink}
            />
          </div>
        </div>
      )}

      {hasInfo && !hasDescription && (
        <EventInfo
          info={event.info}
          onOpenModal={() => setModalVisible(true)}
        />
      )}

      {hasInfo && (
        <EventInfoModal
          open={modalVisible}
          onClose={() => setModalVisible(false)}
          event={event}
          typeConfig={typeConfig}
          contactLink={contactLink}
          compact={compact}
        />
      )}

      {hasActions &&
        event.actions.map((action, idx) => (
          <EventAction
            key={action.id || idx}
            action={action}
            actionStatusConfig={actionStatusConfig}
            methods={methods}
            events={events}
            components={components}
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

const EventsTimeline = ({
  blockId,
  classNames = {},
  properties,
  methods,
  events = {},
  components,
  styles = {},
}) => {
  const {
    data = [],
    eventTypeConfig = {},
    actionStatusConfig,
    s3GetPolicyRequestId,
    contactPageId,
    contactIdQueryKey,
    contactIdPathKey,
    disableContactLink = false,
    compact = false,
    reverse = false,
    mode = "left",
  } = properties || {};

  const Link = components?.Link;
  const contactLink = useMemo(
    () =>
      !disableContactLink && contactPageId
        ? {
            Link,
            pageId: contactPageId,
            idQueryKey: contactIdQueryKey,
            idPathKey: contactIdPathKey,
          }
        : null,
    [Link, contactPageId, contactIdQueryKey, contactIdPathKey, disableContactLink],
  );

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
            contactLink={contactLink}
            compact={compact}
            methods={methods}
            events={events}
            components={components}
          />
        ),
      };

      if (_typeConfig.icon) {
        const Icon = components?.Icon;
        if (Icon) {
          item.dot = (
            <Icon properties={{ name: _typeConfig.icon, color: color }} />
          );
        }
      }

      return item;
    });
  }, [
    enrichedData,
    actionStatusConfig,
    s3GetPolicyRequestId,
    contactLink,
    compact,
    methods,
    events,
    components,
  ]);

  const rootClassName = [
    classNames.element,
    compact && "events-timeline-compact",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div id={blockId} className={rootClassName} style={styles.element}>
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

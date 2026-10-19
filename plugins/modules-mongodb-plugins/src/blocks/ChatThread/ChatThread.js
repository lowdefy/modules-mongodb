import React, { useEffect, useMemo, useRef } from "react";

import decorateMessages from "./decorateMessages.js";

// A two-party conversation thread (support-ticket style): team messages left
// with an avatar, own messages right in a primary-tinted bubble, day pills,
// author grouping, linkified text, and image/file attachments. The thread is
// its own scroll container and sticks to the bottom while the reader is
// there — new messages scroll into view, but never yank the view away from
// someone reading history. All colors ride antd CSS vars so light and dark
// themes both hold. Message text renders as React text nodes (never
// innerHTML), so no escaping foot-guns.

const NEAR_BOTTOM_PX = 80;

const paperclip = (
  <svg
    viewBox="64 64 896 896"
    width="11"
    height="11"
    fill="currentColor"
    style={{ flex: "none" }}
    aria-hidden="true"
  >
    <path d="M779.3 196.6c-94.2-94.2-247.6-94.2-341.7 0l-261 260.8c-1.7 1.7-2.6 4-2.6 6.4s.9 4.7 2.6 6.4l36.9 36.9a9 9 0 0012.7 0l261-260.8c32.4-32.4 75.5-50.2 121.3-50.2s88.9 17.8 121.2 50.2c32.4 32.4 50.2 75.5 50.2 121.2 0 45.8-17.8 88.8-50.2 121.2l-266 265.9-43.1 43.1c-40.3 40.3-105.8 40.3-146.1 0-19.5-19.5-30.2-45.4-30.2-73s10.7-53.5 30.2-73l263.9-263.8c6.7-6.6 15.5-10.3 24.9-10.3h.1c9.4 0 18.1 3.7 24.7 10.3 6.7 6.7 10.3 15.5 10.3 24.9 0 9.3-3.7 18.1-10.3 24.7L372.4 653c-1.7 1.7-2.6 4-2.6 6.4s.9 4.7 2.6 6.4l36.9 36.9a9 9 0 0012.7 0l215.6-215.6c19.9-19.9 30.8-46.3 30.8-74.4s-11-54.6-30.8-74.4c-41.1-41.1-107.9-41-149 0L463 364 224.8 602.1A172.22 172.22 0 00174 724.8c0 46.3 18.1 89.8 50.8 122.5 33.9 33.8 78.3 50.7 122.7 50.7 44.4 0 88.8-16.9 122.6-50.7l309.2-309C824.8 492.7 850 432 850 367.5c.1-64.6-25.1-125.3-70.7-170.9z" />
  </svg>
);

// Split text into text nodes and clickable links.
const linkify = (text) => {
  const parts = String(text ?? "").split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{ wordBreak: "break-all" }}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
};

const Attachment = ({ attachment }) => {
  const isImage =
    attachment.url && String(attachment.mime || "").startsWith("image/");
  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "block", marginTop: 8 }}
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          style={{
            maxWidth: 280,
            maxHeight: 200,
            borderRadius: 8,
            display: "block",
            border: "1px solid var(--ant-color-border-secondary)",
          }}
        />
      </a>
    );
  }
  const chipStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    margin: "8px 6px 0 0",
    padding: "4px 10px",
    fontSize: 12,
    maxWidth: "100%",
    border: "1px solid var(--ant-color-border)",
    borderRadius: 8,
    background: "var(--ant-color-bg-container)",
    color: "var(--ant-color-text-secondary)",
  };
  const name = (
    <span
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 220,
      }}
    >
      {attachment.name}
    </span>
  );
  return attachment.url ? (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      style={chipStyle}
    >
      {paperclip}
      {name}
    </a>
  ) : (
    <span style={{ ...chipStyle, opacity: 0.65 }}>
      {paperclip}
      {name}
    </span>
  );
};

// Soft fills for the contacts module's avatar_color names (antd presets).
// Unknown values pass through as a CSS color; absent falls back to primary.
const AVATAR_COLORS = {
  blue: ["#e6f4ff", "#1677ff", "#91caff"],
  green: ["#f6ffed", "#52c41a", "#b7eb8f"],
  red: ["#fff1f0", "#f5222d", "#ffa39e"],
  orange: ["#fff7e6", "#fa8c16", "#ffd591"],
  gold: ["#fffbe6", "#d4a017", "#ffe58f"],
  purple: ["#f9f0ff", "#722ed1", "#d3adf7"],
  magenta: ["#fff0f6", "#eb2f96", "#ffadd2"],
  cyan: ["#e6fffb", "#13c2c2", "#87e8de"],
  volcano: ["#fff2e8", "#fa541c", "#ffbb96"],
  geekblue: ["#f0f5ff", "#2f54eb", "#adc6ff"],
  lime: ["#fcffe6", "#7cb305", "#eaff8f"],
};

const Avatar = ({ message, grouped }) => {
  if (grouped) return <span style={{ flex: "none", width: 30 }} />;
  const author = message.author || {};
  if (author.avatar_url) {
    return (
      <img
        src={author.avatar_url}
        alt=""
        style={{
          flex: "none",
          width: 30,
          height: 30,
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />
    );
  }
  const initials = String(author.name || "ST")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const preset = AVATAR_COLORS[author.avatar_color];
  const [bg, fg, border] =
    preset ||
    (author.avatar_color
      ? [author.avatar_color, "#fff", author.avatar_color]
      : [
          "var(--ant-color-primary-bg)",
          "var(--ant-color-primary)",
          "var(--ant-color-primary-border)",
        ]);
  return (
    <span
      style={{
        flex: "none",
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {initials}
    </span>
  );
};

const ChatThread = ({ blockId, classNames, properties, styles }) => {
  const {
    messages = [],
    ownAuthorType = "user",
    maxHeight = "55vh",
    emptyText,
  } = properties;
  const containerRef = useRef(null);
  const nearBottomRef = useRef(true);

  const decorated = useMemo(
    () => decorateMessages(messages, new Date()),
    [messages],
  );

  const lastId = decorated.length ? decorated[decorated.length - 1]._id : null;

  useEffect(() => {
    const el = containerRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [lastId, decorated.length]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  return (
    <div
      id={blockId}
      data-testid={blockId}
      ref={containerRef}
      onScroll={onScroll}
      className={classNames?.element}
      style={{
        overflowY: "auto",
        maxHeight,
        padding: "2px 2px 6px",
        overscrollBehavior: "contain",
        ...styles?.element,
      }}
    >
      {decorated.length === 0 && emptyText && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 0",
            fontSize: 13,
            color: "var(--ant-color-text-tertiary)",
          }}
        >
          {emptyText}
        </div>
      )}
      {decorated.map((m) => {
        const mine = m.author_type === ownAuthorType;
        const name = (m.author || {}).name || (mine ? "You" : "Support team");
        return (
          <React.Fragment key={m._id}>
            {m.dayBreak && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  margin: "20px 0 12px",
                }}
              >
                <span
                  className={classNames?.day}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".03em",
                    color: "var(--ant-color-text-tertiary)",
                    background: "var(--ant-color-fill-tertiary)",
                    padding: "3px 12px",
                    borderRadius: 999,
                    ...styles?.day,
                  }}
                >
                  {m.dayBreak}
                </span>
              </div>
            )}
            <div
              title={m.time}
              style={{
                display: "flex",
                gap: 10,
                justifyContent: mine ? "flex-end" : "flex-start",
                marginTop: m.grouped ? 3 : 14,
              }}
            >
              {!mine && <Avatar message={m} grouped={m.grouped} />}
              <div style={{ maxWidth: "72%", minWidth: 0 }}>
                {!m.grouped && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 3,
                      justifyContent: mine ? "flex-end" : "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ant-color-text)",
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--ant-color-text-quaternary)",
                      }}
                    >
                      {m.time}
                    </span>
                  </div>
                )}
                <div
                  className={classNames?.bubble}
                  style={{
                    padding: "9px 13px",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: "var(--ant-color-text)",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    ...(mine
                      ? {
                          background: "var(--ant-color-primary-bg)",
                          border: "1px solid var(--ant-color-primary-border)",
                          borderRadius: "14px 14px 4px 14px",
                        }
                      : {
                          background: "var(--ant-color-bg-container)",
                          border: "1px solid var(--ant-color-border-secondary)",
                          borderRadius: "14px 14px 14px 4px",
                        }),
                    ...styles?.bubble,
                  }}
                >
                  {linkify(m.body)}
                  {(m.attachments || []).length > 0 && (
                    // Block-level wrapper: attachments always start on their
                    // own line below the text, never inline with it.
                    <div>
                      {(m.attachments || []).map((a, i) => (
                        <Attachment key={a.key || i} attachment={a} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {mine && <Avatar message={m} grouped={m.grouped} />}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ChatThread;

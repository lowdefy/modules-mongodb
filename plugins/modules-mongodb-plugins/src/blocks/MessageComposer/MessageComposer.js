import React, { useEffect, useRef, useState } from "react";
import { Button, Progress } from "antd";
import { cn, withBlockDefaults } from "@lowdefy/block-utils";
import { type } from "@lowdefy/helpers";

import getS3Upload from "../FileManager/getS3Upload.js";
import {
  checkFiles,
  filesFromData,
  isImage,
  pastedFiles,
  pastedName,
} from "./files.js";
import "./style.module.css";

const asFiles = (value) => (type.isArray(value) ? value : []);

const isMac = () =>
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);

// A chip's thumbnail is the local copy of an image, kept by file key once the
// upload is stored; files that arrive from state (a screenshot) show an icon.
const Chip = ({ item, thumb, Icon, blockId, onRemove }) => {
  const failed = item.status === "error";
  const uploading = item.status === "uploading";
  return (
    <div
      className={cn("mc-chip", failed && "mc-chip-error")}
      data-testid={`${blockId}_chip`}
      title={failed ? item.message : item.name}
    >
      {thumb ? (
        <img className="mc-chip-thumb" src={thumb} alt="" />
      ) : (
        <span className="mc-chip-icon">
          <Icon
            blockId={`${blockId}_chip_icon`}
            properties={{ name: failed ? "CircleAlert" : "FileText", size: 16 }}
          />
        </span>
      )}
      <span className="mc-chip-text">
        <span className="mc-chip-name">{item.name}</span>
        {failed && <span className="mc-chip-note">{item.message}</span>}
        {uploading && (
          <Progress
            percent={Math.round(item.percent ?? 0)}
            size="small"
            showInfo={false}
          />
        )}
      </span>
      <button
        type="button"
        className="mc-chip-remove"
        aria-label={`Remove ${item.name}`}
        data-testid={`${blockId}_chip_remove`}
        onClick={onRemove}
      >
        <Icon
          blockId={`${blockId}_chip_remove_icon`}
          properties={{ name: "X", size: 14 }}
        />
      </button>
    </div>
  );
};

const MessageComposer = ({
  blockId,
  classNames = {},
  components,
  methods,
  properties,
  styles = {},
  validation,
  value,
}) => {
  const { Icon } = components;
  const maxFiles = type.isInt(properties.maxFiles) ? properties.maxFiles : 5;
  const maxSize = type.isInt(properties.maxSize)
    ? properties.maxSize
    : 10 * 1048576;
  const message = type.isString(value) ? value : "";
  const stored = asFiles(properties.files);
  const disabled = properties.disabled === true;

  // Uploads in flight or failed, newest last. A stored upload leaves this list
  // and joins properties.files through onUploaded.
  const [pending, setPending] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [thumbs, setThumbs] = useState({});
  const textRef = useRef(null);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const filesRef = useRef(stored);
  const localUrls = useRef(new Set());
  const uploadsRef = useRef({
    queue: Promise.resolve(),
    asking: null,
    held: new Map(),
  });
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  filesRef.current = stored;
  const propsRef = useRef(properties);
  propsRef.current = properties;

  useEffect(() => {
    methods.registerEvent({
      name: "__getS3PostPolicy",
      actions: [
        {
          id: "__getS3PostPolicy",
          type: "Request",
          params: [properties.s3PostPolicyRequestId],
        },
      ],
    });
    const urls = localUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Grow with the text, from minRows to maxRows.
  const minRows = properties.minRows ?? 2;
  const maxRows = properties.maxRows ?? 8;
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 22;
    const extra =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 0;
    el.style.height = "auto";
    const height = Math.min(
      Math.max(el.scrollHeight, line * minRows + extra),
      line * maxRows + extra,
    );
    el.style.height = `${height}px`;
  }, [message, minRows, maxRows]);

  const patchPending = (uid, patch) =>
    setPending((list) =>
      list.map((item) => (item.uid === uid ? { ...item, ...patch } : item)),
    );
  const dropPending = (uid) =>
    setPending((list) => list.filter((item) => item.uid !== uid));

  const setFileList = async ({ event, file, percent }) => {
    if (event === "onProgress") {
      patchPending(file.uid, { status: "uploading", percent });
    } else if (event === "onSuccess") {
      const next = [
        ...filesRef.current,
        { key: file.key, name: file.name, size: file.size, type: file.type },
      ];
      filesRef.current = next;
      const url = file.localUrl;
      if (url) setThumbs((map) => ({ ...map, [file.key]: url }));
      dropPending(file.uid);
      methods.triggerEvent({
        name: "onUploaded",
        event: { file: next[next.length - 1], files: next },
      });
    } else {
      patchPending(file.uid, {
        status: "error",
        message: "Upload failed, remove it and try again.",
      });
      methods.triggerEvent({
        name: "onError",
        event: { message: `${file.name} could not be uploaded.`, file: file.name },
      });
    }
  };

  const s3Upload = getS3Upload({
    methods,
    setFileList,
    removeFile: dropPending,
    usePolicyEvent: false,
    uploadsRef,
  });

  const addFiles = (incoming, { pasted = false } = {}) => {
    if (disabled || incoming.length === 0) return;
    const { accepted, rejected } = checkFiles({
      files: incoming,
      attached: filesRef.current.length + pendingRef.current.length,
      maxFiles,
      maxSize,
    });
    const stamp = Date.now();
    const rejectedItems = rejected.map(({ file, message: note }, i) => ({
      uid: `rejected-${stamp}-${i}`,
      name: file.name || "file",
      status: "error",
      message: note,
    }));
    rejected.forEach(({ file, message: note }) =>
      methods.triggerEvent({
        name: "onError",
        event: { message: note, file: file.name },
      }),
    );
    const taken = new Set([
      ...filesRef.current.map((f) => f.name),
      ...pendingRef.current.map((f) => f.name),
    ]);
    const uploads = accepted.map((original, i) => {
      // A clipboard image is named image.png; give it a name worth reading.
      const named =
        pasted && isImage(original)
          ? new File(
              [original],
              pastedName(new Date(), original.type, taken),
              { type: original.type },
            )
          : original;
      named.uid = `${named.name}-${stamp}-${i}`;
      if (isImage(named)) {
        named.localUrl = URL.createObjectURL(named);
        localUrls.current.add(named.localUrl);
      }
      return named;
    });
    setPending((list) => [
      ...list,
      ...rejectedItems,
      ...uploads.map((file) => ({
        uid: file.uid,
        name: file.name,
        status: "uploading",
        percent: 0,
        localUrl: file.localUrl,
      })),
    ]);
    uploads.forEach((file) => s3Upload.upload({ file, pasted }));
  };

  const removeStored = (index) => {
    const file = filesRef.current[index];
    const next = filesRef.current.filter((_, i) => i !== index);
    filesRef.current = next;
    methods.triggerEvent({ name: "onRemove", event: { file, files: next } });
  };

  const uploading = pending.some((item) => item.status === "uploading");
  const canSend =
    !disabled &&
    !uploading &&
    properties.loading !== true &&
    message.trim() !== "";

  const submit = () => {
    if (!canSend) return;
    setPending([]);
    methods.triggerEvent({
      name: "onSubmit",
      event: { message, files: filesRef.current },
    });
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const files = pastedFiles(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files, { pasted: true });
  };

  const hasFiles = (e) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const onDragEnter = (e) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(filesFromData(e.dataTransfer));
  };

  const failed = validation?.status === "error";
  const chips = [
    ...stored.map((file, index) => ({
      item: { ...file, uid: `stored-${index}-${file.key}` },
      thumb: thumbs[file.key],
      remove: () => removeStored(index),
    })),
    ...pending.map((item) => ({
      item,
      thumb: item.localUrl,
      remove: () => dropPending(item.uid),
    })),
  ];
  const hint = properties.hint ?? "Markdown";
  const atLimit = stored.length + pending.length >= maxFiles;

  return (
    <div
      id={blockId}
      data-testid={blockId}
      className={cn(
        "mc-element",
        dragging && "mc-dragging",
        failed && "mc-invalid",
        disabled && "mc-disabled",
        classNames.element,
      )}
      style={styles.element}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <textarea
        ref={textRef}
        className={cn("mc-text", classNames.textarea)}
        style={styles.textarea}
        data-testid={`${blockId}_textarea`}
        rows={minRows}
        value={message}
        disabled={disabled}
        placeholder={properties.placeholder}
        maxLength={properties.maxLength}
        aria-label={properties.placeholder ?? "Message"}
        onChange={(e) => {
          methods.setValue(e.target.value);
          methods.triggerEvent({ name: "onChange" });
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      {chips.length > 0 && (
        <div className={cn("mc-chips", classNames.files)} style={styles.files}>
          {chips.map(({ item, thumb, remove }) => (
            <Chip
              key={item.uid}
              item={item}
              thumb={thumb}
              Icon={Icon}
              blockId={blockId}
              onRemove={remove}
            />
          ))}
        </div>
      )}
      <div className={cn("mc-bar", classNames.bar)} style={styles.bar}>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={properties.accept ?? "image/*,.pdf"}
          data-testid={`${blockId}_input`}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button
          type="text"
          className="mc-attach"
          aria-label="Attach an image or PDF"
          title={
            atLimit
              ? `Up to ${maxFiles} files`
              : "Attach an image or PDF"
          }
          disabled={disabled || atLimit}
          data-testid={`${blockId}_attach`}
          icon={
            <Icon
              blockId={`${blockId}_attach_icon`}
              properties={{ name: "ImagePlus", size: 18 }}
            />
          }
          onClick={() => inputRef.current?.click()}
        />
        <span className="mc-hint">
          {hint}
          {properties.submitHint !== false && (
            <>
              {hint ? " · " : ""}
              <kbd className="mc-key">{isMac() ? "⌘" : "Ctrl"}</kbd>
              <kbd className="mc-key">{"↵"}</kbd> to send
            </>
          )}
        </span>
        <Button
          type="primary"
          className="mc-send"
          disabled={!canSend}
          loading={properties.loading === true}
          data-testid={`${blockId}_send`}
          onClick={submit}
        >
          {properties.submitLabel ?? "Send"}
        </Button>
      </div>
      {dragging && (
        <div className="mc-drop" aria-hidden="true">
          Drop to attach
        </div>
      )}
    </div>
  );
};

export default withBlockDefaults(MessageComposer);

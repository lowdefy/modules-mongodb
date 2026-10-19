import React, { useEffect, useRef, useState } from "react";
import { withBlockDefaults } from "@lowdefy/block-utils";

// Profile-photo input: a round avatar that IS the upload control. Shows the
// current photo (block value = data URI) or an initials fallback, with a
// hover/focus overlay to pick a new image. Files are center-cropped square,
// downscaled to maxDimension, and re-encoded with stepped quality until the
// decoded size fits under maxBytes — the value handed to state is always a
// data URI small enough to store inline on a MongoDB document. Drag-and-drop
// and keyboard accessible.

const dataUriBytes = (uri) => {
  const b64 = uri.slice(uri.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });

// Center-crop to square, downscale, then walk quality (and, if needed,
// dimension) down until the encoded image fits the byte cap.
const compressToDataUri = async (file, { maxBytes, maxDimension }) => {
  const { img, url } = await loadImage(file);
  try {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    let dimension = Math.min(maxDimension, side);
    // PNG stays PNG only if tiny; photos re-encode as JPEG (universal decode,
    // predictable size stepping — WebP support varies on export in older
    // Safari, and the difference at 512px is marginal).
    const qualities = [0.92, 0.85, 0.75, 0.65, 0.55, 0.45];
    for (let pass = 0; pass < 4; pass++) {
      const canvas = document.createElement("canvas");
      canvas.width = dimension;
      canvas.height = dimension;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      // JPEG carries no alpha, so an unpainted canvas leaves a transparent
      // PNG's cut-out areas BLACK. Logos are the common case here and they
      // are drawn for light ground, so flatten onto white.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, dimension, dimension);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, dimension, dimension);
      for (const q of qualities) {
        const uri = canvas.toDataURL("image/jpeg", q);
        if (dataUriBytes(uri) <= maxBytes) return uri;
      }
      dimension = Math.floor(dimension / 2);
      if (dimension < 64) break;
    }
    throw new Error("That image could not be compressed under the size limit.");
  } finally {
    URL.revokeObjectURL(url);
  }
};

const AvatarUpload = ({
  blockId,
  classNames = {},
  loading,
  methods,
  properties,
  styles = {},
  value,
}) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // The picked image, shown immediately. A block whose value path sits under
  // an unseeded parent object gets its setValue back late (or never, until an
  // unrelated re-render), and the user would see their upload do nothing —
  // so the preview never waits on the value prop round trip.
  const [pending, setPending] = useState(null);

  const size = properties.size ?? 96;
  const maxBytes = properties.maxBytes ?? 512000;
  const maxDimension = properties.maxDimension ?? 512;
  const disabled = properties.disabled === true || loading;
  const removable = properties.removable !== false;
  const isImage = (v) => typeof v === "string" && v.startsWith("data:image");
  const shown = isImage(value) ? value : pending;
  const hasPhoto = isImage(shown);

  // Once the value prop catches up, drop the local copy — from then on state
  // is the single source of truth (a Reset or an external SetState wins).
  useEffect(() => {
    if (isImage(value)) setPending(null);
  }, [value]);

  const pick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const handleFile = async (file) => {
    if (!file || disabled || busy) return;
    if (!file.type.startsWith("image/")) {
      methods.triggerEvent({
        name: "onError",
        event: { message: "Please pick an image file." },
      });
      return;
    }
    setBusy(true);
    try {
      const uri = await compressToDataUri(file, { maxBytes, maxDimension });
      setPending(uri);
      methods.setValue(uri);
      methods.triggerEvent({ name: "onChange" });
    } catch (error) {
      methods.triggerEvent({
        name: "onError",
        event: { message: error.message },
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (e) => {
    e.stopPropagation();
    if (disabled || busy) return;
    setPending(null);
    methods.setValue(null);
    methods.triggerEvent({ name: "onChange" });
  };

  const overlayLabel = hasPhoto
    ? (properties.changeLabel ?? "Change photo")
    : (properties.emptyLabel ?? "Add photo");

  const wrapper = {
    position: "relative",
    width: size,
    height: size,
    flex: "0 0 auto",
    ...styles.element,
  };
  const circle = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    overflow: "hidden",
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    // White behind a photo, not a theme fill: an image with transparency
    // (a logo PNG stored before the white-flattening encode) must read the
    // same here as it does everywhere else it renders.
    background: hasPhoto
      ? "#fff"
      : (properties.background ?? "var(--ant-color-fill-secondary, #d9d9d9)"),
    color: "#fff",
    fontWeight: 600,
    fontSize: Math.round(size * 0.34),
    letterSpacing: "0.02em",
    outline: dragOver ? "2px solid var(--ant-color-primary, #1677ff)" : "none",
    outlineOffset: 2,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
  };
  const overlay = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    background: "rgba(0,0,0,0.45)",
    color: "#fff",
    fontSize: Math.max(10, Math.round(size * 0.11)),
    opacity: busy || dragOver ? 1 : 0,
    transition: "opacity 0.15s ease",
    pointerEvents: "none",
  };

  return (
    <div
      id={blockId}
      className={classNames.element}
      style={wrapper}
      onMouseEnter={(e) => {
        const el = e.currentTarget.querySelector("[data-avatar-overlay]");
        if (el && !disabled) el.style.opacity = 1;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget.querySelector("[data-avatar-overlay]");
        if (el && !busy) el.style.opacity = 0;
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer?.files?.[0]);
      }}
    >
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={overlayLabel}
        style={circle}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        }}
      >
        {hasPhoto ? (
          <img
            src={shown}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <span>{properties.initials ?? ""}</span>
        )}
      </div>
      <div data-avatar-overlay="" style={overlay} aria-hidden="true">
        {busy ? (
          <svg
            width={size * 0.28}
            height={size * 0.28}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="2.5"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        ) : (
          <>
            <svg
              width={size * 0.24}
              height={size * 0.24}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>{overlayLabel}</span>
          </>
        )}
      </div>
      {hasPhoto && removable && !disabled && (
        <button
          type="button"
          aria-label="Remove photo"
          onClick={remove}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: Math.max(20, Math.round(size * 0.24)),
            height: Math.max(20, Math.round(size * 0.24)),
            borderRadius: "50%",
            border: "1px solid var(--ant-color-border, #d9d9d9)",
            background: "var(--ant-color-bg-elevated, #fff)",
            color: "var(--ant-color-text-secondary, #666)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(10, Math.round(size * 0.12)),
            lineHeight: 1,
            padding: 0,
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}
        >
          ✕
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
};

export default withBlockDefaults(AvatarUpload);

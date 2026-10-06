import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Modal, Segmented, Typography } from "antd";
import { withBlockDefaults } from "@lowdefy/block-utils";

import getS3Upload from "../FileManager/getS3Upload.js";
import { boxFromPoints, isBox, scaleBox } from "./boxes.js";
import capturePage from "./capturePage.js";
import renderEdited from "./renderEdited.js";

const { Text } = Typography;

// Above the floating panel (1100) the support form sits in.
const EDITOR_Z_INDEX = 1200;

const asArray = (value) => (Array.isArray(value) ? value : []);

const canvasToFile = (canvas, name) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The screenshot could not be encoded."));
        return;
      }
      const file = new File([blob], name, { type: "image/png" });
      file.uid = `support-screenshot-${Date.now()}`;
      resolve(file);
    }, "image/png");
  });

const boxStyle = (box) => ({
  position: "absolute",
  left: box.x,
  top: box.y,
  width: box.w,
  height: box.h,
});

const Editor = ({ blockId, shot, blurs, crop, draft, tool, onDraw }) => {
  const imgRef = useRef(null);
  const startRef = useRef(null);
  const [display, setDisplay] = useState(null);

  // Boxes are kept in image pixels. The image is shown scaled to fit, and
  // pointer positions are read against its on-screen box, which stays right
  // while the modal is still animating open.
  const measure = () => {
    const img = imgRef.current;
    const next = { width: img.clientWidth, height: img.clientHeight };
    if (next.width !== display?.width || next.height !== display?.height) {
      setDisplay(next);
    }
    return img.getBoundingClientRect();
  };
  const toDisplay = (box) =>
    scaleBox(box, display ? display.width / shot.canvas.width : 1);

  const point = (event, rect) => ({
    x: ((event.clientX - rect.left) * shot.canvas.width) / rect.width,
    y: ((event.clientY - rect.top) * shot.canvas.height) / rect.height,
  });
  const boxTo = (event) => {
    const rect = imgRef.current.getBoundingClientRect();
    const box = boxFromPoints(
      startRef.current,
      point(event, rect),
      shot.canvas.width,
      shot.canvas.height,
    );
    return { box, onScreen: scaleBox(box, rect.width / shot.canvas.width) };
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 || !imgRef.current?.complete) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startRef.current = point(event, measure());
    onDraw({ draft: { x: 0, y: 0, w: 0, h: 0 } });
  };
  const onPointerMove = (event) => {
    if (!startRef.current) return;
    onDraw({ draft: boxTo(event).box });
  };
  const onPointerUp = (event) => {
    if (!startRef.current) return;
    const { box, onScreen } = boxTo(event);
    startRef.current = null;
    onDraw({ draft: null, done: isBox(onScreen) ? box : null });
  };

  const shownCrop = draft && tool === "crop" ? draft : crop;

  return (
    <div
      data-testid={`${blockId}_editor_image`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "relative",
        display: "inline-block",
        maxWidth: "100%",
        overflow: "hidden",
        cursor: "crosshair",
        touchAction: "none",
        userSelect: "none",
        border: "1px solid var(--ant-color-border-secondary)",
        borderRadius: 4,
        lineHeight: 0,
      }}
    >
      <img
        ref={imgRef}
        src={shot.url}
        alt="Screenshot"
        draggable={false}
        onLoad={measure}
        style={{ display: "block", maxWidth: "100%", maxHeight: "60vh" }}
      />
      {display &&
        blurs.map((box, i) => (
          <div
            key={i}
            style={{
              ...boxStyle(toDisplay(box)),
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              background: "rgba(255, 255, 255, 0.2)",
              outline: "1px dashed var(--ant-color-text-tertiary)",
            }}
          />
        ))}
      {display && draft && tool === "blur" && (
        <div
          style={{
            ...boxStyle(toDisplay(draft)),
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            outline: "1px dashed var(--ant-color-primary)",
          }}
        />
      )}
      {display && shownCrop && (
        <div
          style={{
            ...boxStyle(toDisplay(shownCrop)),
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
            outline: "2px solid var(--ant-color-primary)",
          }}
        />
      )}
    </div>
  );
};

const SupportScreenshot = ({
  blockId,
  classNames = {},
  components,
  methods,
  properties,
  styles = {},
}) => {
  const { Icon } = components;
  const label = properties.label ?? "Take screenshot";
  const fileName = properties.fileName ?? "screenshot.png";
  const hideSelectors = asArray(properties.hideSelectors);
  const maskSelectors = asArray(properties.maskSelectors);

  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [shot, setShot] = useState(null);
  const [tool, setTool] = useState("blur");
  const [blurs, setBlurs] = useState([]);
  const [crop, setCrop] = useState(null);
  const [draft, setDraft] = useState(null);
  const retakeRef = useRef(false);
  // Settles when the editor has finished closing. A capture waits for it, so
  // the closing editor is not in the screenshot.
  const closedRef = useRef(null);
  const uploadsRef = useRef({
    queue: Promise.resolve(),
    asking: null,
    held: new Map(),
  });
  // The upload reports its end through setFileList; this settles the Use
  // click waiting on it.
  const settleRef = useRef(null);

  const fail = (message) =>
    methods.triggerEvent({ name: "onError", event: { message } });

  const s3Upload = useMemo(
    () =>
      getS3Upload({
        methods,
        setFileList: async ({ event, file }) => {
          if (event === "onSuccess") settleRef.current?.({ ok: true, file });
          if (event === "onError") settleRef.current?.({ ok: false, file });
        },
        removeFile: () => {},
        usePolicyEvent: false,
        uploadsRef,
      }),
    [methods],
  );

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
  }, [properties.s3PostPolicyRequestId]);

  const capture = useCallback(async () => {
    if (properties.disabled === true) return;
    setCapturing(true);
    try {
      await closedRef.current?.promise;
      const canvas = await capturePage({ hideSelectors, maskSelectors });
      setShot({ canvas, url: canvas.toDataURL("image/png") });
      setBlurs([]);
      setCrop(null);
      setDraft(null);
      setTool("blur");
      setOpen(true);
    } catch (error) {
      console.error(error);
      await fail(
        `The page could not be captured${error?.message ? `: ${error.message}` : "."}`,
      );
    } finally {
      setCapturing(false);
    }
  }, [
    properties.disabled,
    JSON.stringify(hideSelectors),
    JSON.stringify(maskSelectors),
  ]);

  useEffect(() => {
    methods.registerMethod("capture", capture);
  }, [capture]);

  const close = () => {
    if (!closedRef.current) {
      let resolve;
      const promise = new Promise((r) => {
        resolve = r;
      });
      closedRef.current = { promise, resolve };
    }
    setOpen(false);
  };

  const retake = () => {
    retakeRef.current = true;
    close();
  };
  const afterClose = () => {
    closedRef.current?.resolve();
    closedRef.current = null;
    setShot(null);
    if (retakeRef.current) {
      retakeRef.current = false;
      capture();
    }
  };

  const use = async () => {
    setUploading(true);
    try {
      const output = renderEdited(shot.canvas, { blurs, crop });
      const file = await canvasToFile(output, fileName);
      const result = await new Promise((resolve) => {
        settleRef.current = resolve;
        s3Upload.upload({ file });
      });
      settleRef.current = null;
      if (!result.ok) {
        await fail("The screenshot could not be uploaded.");
        return;
      }
      close();
      await methods.triggerEvent({
        name: "onUse",
        event: {
          file: {
            key: file.key,
            name: file.name,
            size: file.size,
            type: file.type,
          },
        },
      });
    } catch (error) {
      console.error(error);
      await fail("The screenshot could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const onDraw = ({ draft: next, done }) => {
    setDraft(next);
    if (!done) return;
    if (tool === "blur") setBlurs((current) => [...current, done]);
    if (tool === "crop") setCrop(done);
  };

  return (
    <>
      <Button
        id={blockId}
        data-testid={blockId}
        className={classNames.element}
        style={styles.element}
        disabled={properties.disabled === true}
        loading={capturing}
        icon={
          <Icon blockId={`${blockId}_icon`} properties={{ name: "Camera" }} />
        }
        onClick={capture}
      >
        {label}
      </Button>
      <Modal
        open={open}
        title="Screenshot"
        width="min(960px, 92vw)"
        zIndex={EDITOR_Z_INDEX}
        maskClosable={false}
        onCancel={close}
        afterClose={afterClose}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={close} disabled={uploading}>
            Cancel
          </Button>,
          <Button key="retake" onClick={retake} disabled={uploading}>
            Retake
          </Button>,
          <Button
            key="use"
            type="primary"
            loading={uploading}
            onClick={use}
            data-testid={`${blockId}_use`}
          >
            Use
          </Button>,
        ]}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <Segmented
            value={tool}
            onChange={setTool}
            options={[
              { label: "Blur", value: "blur" },
              { label: "Crop", value: "crop" },
            ]}
          />
          <Text type="secondary">
            {tool === "blur"
              ? "Drag over anything you don't want to send."
              : "Drag to keep only part of the screenshot."}
          </Text>
        </div>
        {shot && (
          <div style={{ textAlign: "center" }}>
            <Editor
              blockId={blockId}
              shot={shot}
              blurs={blurs}
              crop={crop}
              draft={draft}
              tool={tool}
              onDraw={onDraw}
            />
          </div>
        )}
      </Modal>
    </>
  );
};

export default withBlockDefaults(SupportScreenshot);

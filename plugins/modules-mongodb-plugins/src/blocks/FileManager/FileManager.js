import React, { useState, useEffect, useRef } from "react";
import { Upload, Typography, Button, Tooltip, Modal, Progress, theme } from "antd";
import { withBlockDefaults, renderHtml } from "@lowdefy/block-utils";
import { type } from "@lowdefy/helpers";
import { Label } from "@lowdefy/blocks-antd/blocks";
import dayjs from "dayjs";
import getS3Upload from "./getS3Upload.js";
import useFileList from "./useFileList.js";
import getOnPaste from "./getOnPaste.js";

const { Dragger } = Upload;
const { Text } = Typography;

const generateThumbnail = (file, maxSize = 64) =>
  new Promise((resolve) => {
    if (!file.type?.startsWith("image/")) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

const FILE_TYPE_ICONS = {
  pdf: ["AiOutlineFilePdf", "#ff4d4f"],
  xls: ["AiOutlineFileExcel", "#52c41a"],
  xlsx: ["AiOutlineFileExcel", "#52c41a"],
  csv: ["AiOutlineFileExcel", "#52c41a"],
  doc: ["AiOutlineFileWord", "#1890ff"],
  docx: ["AiOutlineFileWord", "#1890ff"],
  png: ["AiOutlineFileImage", "#722ed1"],
  jpg: ["AiOutlineFileImage", "#722ed1"],
  jpeg: ["AiOutlineFileImage", "#722ed1"],
  gif: ["AiOutlineFileImage", "#722ed1"],
  svg: ["AiOutlineFileImage", "#722ed1"],
  webp: ["AiOutlineFileImage", "#722ed1"],
};

const downloadFile = async ({ fileDoc, methods }) => {
  const s3DownloadPolicy = await methods.triggerEvent({
    name: "__getS3DownloadPolicy",
    event: { file: fileDoc.file },
  });
  window.open(
    s3DownloadPolicy?.responses?.__getS3DownloadPolicy?.response?.[0],
  );
};

/**
 * FileManager block.
 *
 * Expects `properties.files` to be an array of file documents from the
 * `files` MongoDB collection. Each doc has shape:
 *   { _id, file: { name, key, bucket, size, type, thumbnail }, file_title,
 *     file_category, metadata, created: { timestamp, user: { name, id } } }
 *
 * Events fired:
 *   onSave  — { file: { name, key, bucket, size, type, thumbnail } }
 *   onDelete — { fileDoc: <full file document> }
 */
const FileManager = ({
  blockId,
  classNames = {},
  components,
  content,
  events,
  methods,
  properties,
  styles = {},
  validation,
}) => {
  const { token } = theme.useToken();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const thumbnailRef = useRef(null);

  const fileDocs = type.isArray(properties.files) ? properties.files : [];
  const hasForm = !!content?.form;
  const viewOnly = properties.viewOnly === true;
  const showDelete = viewOnly ? false : (properties.showDelete ?? true);
  const singleFile = properties.singleFile === true;
  const maxCount = type.isInt(properties.maxCount) ? properties.maxCount : null;
  const atLimit =
    (singleFile && fileDocs.length > 0) ||
    (maxCount !== null && fileDocs.length >= maxCount);
  const hideDragger = viewOnly || atLimit;

  const interceptedMethods = {
    ...methods,
    setValue: () => {},
    triggerEvent: async ({ name, event }) => {
      if (name === "onSuccess") {
        const uploadedFile = event?.file;
        if (uploadedFile) {
          handleUploadSuccess(uploadedFile);
        }
        return { success: true };
      }
      if (name === "onProgress" || name === "onError") {
        return { success: true };
      }
      return methods.triggerEvent({ name, event });
    },
  };

  const [draggerState, loadFileList, setDraggerFileList, setDraggerValue] =
    useFileList({
      methods: interceptedMethods,
    });

  const rawS3Upload = getS3Upload({
    methods,
    setFileList: setDraggerFileList,
  });

  const s3UploadRequest = async ({ file }) => {
    thumbnailRef.current = await generateThumbnail(file);
    return rawS3Upload({ file });
  };

  const onPaste = getOnPaste({
    s3UploadRequest,
    properties,
  });

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
    methods.registerEvent({
      name: "__getS3DownloadPolicy",
      actions: [
        {
          id: "__getS3DownloadPolicy",
          type: "Request",
          params: [properties.s3GetPolicyRequestId],
        },
      ],
    });
    if (hasForm) {
      const escapedBlockId = blockId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      methods.registerEvent({
        name: "__validateForm",
        actions: [
          {
            id: "__validateForm",
            type: "Validate",
            params: { regex: `^${escapedBlockId}\\.form\\.` },
          },
        ],
      });
      methods.registerEvent({
        name: "__clearFormState",
        actions: [
          {
            id: "__clearFormState",
            type: "SetState",
            params: {
              [`${blockId}.form`]: {},
            },
          },
        ],
      });
    }
  }, []);

  useEffect(() => {
    methods.registerMethod("uploadFromPaste", async () => {
      await onPaste();
    });
  }, [onPaste]);

  const handleUploadSuccess = (uploadedFile) => {
    if (!uploadedFile) return;
    const s3File = {
      name: uploadedFile.name,
      key: uploadedFile.key,
      bucket: uploadedFile.bucket,
      size: uploadedFile.size,
      type: uploadedFile.type,
    };
    if (thumbnailRef.current) {
      s3File.thumbnail = thumbnailRef.current;
      thumbnailRef.current = null;
    }
    if (hasForm) {
      setPendingFile(s3File);
      setModalOpen(true);
    } else {
      methods.triggerEvent({
        name: "onSave",
        event: { file: s3File },
      });
      resetDragger();
    }
  };

  const resetDragger = () => {
    setDraggerValue({ file: null, fileList: [] });
  };

  const handleModalOk = async () => {
    if (!pendingFile) return;
    if (hasForm) {
      const validationResult = await methods.triggerEvent({
        name: "__validateForm",
      });
      if (validationResult?.success === false) return;
    }
    const result = await methods.triggerEvent({
      name: "onSave",
      event: { file: pendingFile },
    });
    if (result?.success !== false) {
      setModalOpen(false);
      setPendingFile(null);
      resetDragger();
      if (hasForm) {
        methods.triggerEvent({ name: "__clearFormState" });
      }
    }
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setPendingFile(null);
    resetDragger();
    if (hasForm) {
      methods.triggerEvent({ name: "__clearFormState" });
    }
  };

  const handleDeleteClick = (fileDoc) => {
    setDeleteTarget(fileDoc);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const result = await methods.triggerEvent({
      name: "onDelete",
      event: { fileDoc: deleteTarget },
    });
    if (result?.success !== false) {
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  const { Icon } = components;

  const renderFileIcon = (fileDoc, index) => {
    const file = fileDoc.file || {};
    if (file.thumbnail) {
      return (
        <img
          src={file.thumbnail}
          alt=""
          style={{
            width: 32,
            height: 32,
            borderRadius: 2,
            objectFit: "cover",
            flexShrink: 0,
            display: "block",
          }}
        />
      );
    }
    const ext = (file.name || "").split(".").pop()?.toLowerCase();
    const [iconName, color] = FILE_TYPE_ICONS[ext] || [
      "AiOutlineFile",
      "var(--ant-color-text-tertiary, #8c8c8c)",
    ];
    return (
      <Icon
        blockId={`${blockId}_file_${index}_icon`}
        properties={{ name: iconName, color, size: 24 }}
      />
    );
  };

  const renderFileItem = (fileDoc, index) => {
    const file = fileDoc.file || {};
    const displayName = fileDoc.file_title || file.name;
    const userName = fileDoc.created?.user?.name;
    const timestamp = fileDoc.created?.timestamp
      ? dayjs(fileDoc.created.timestamp).format("YYYY-MM-DD")
      : null;

    const metaParts = [];
    if (userName) metaParts.push(userName);
    if (timestamp) metaParts.push(timestamp);

    return (
      <div
        key={fileDoc._id ?? index}
        className={classNames.fileItem}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 0",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          ...styles.fileItem,
        }}
      >
        {renderFileIcon(fileDoc, index)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>
            <a
              onClick={(e) => {
                e.preventDefault();
                downloadFile({ fileDoc, methods });
              }}
              style={{ fontWeight: 500, cursor: "pointer" }}
            >
              {displayName}
            </a>
          </div>
          {metaParts.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {metaParts.join(" \u00b7 ")}
            </Text>
          )}
        </div>
        <Tooltip title="Download">
          <Button
            type="text"
            size="small"
            onClick={() => downloadFile({ fileDoc, methods })}
          >
            <Icon
              blockId={`${blockId}_file_${index}_dl`}
              properties={{ name: "AiOutlineDownload", size: 16 }}
            />
          </Button>
        </Tooltip>
        {showDelete && (
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              danger
              onClick={() => handleDeleteClick(fileDoc)}
            >
              <Icon
                blockId={`${blockId}_file_${index}_rm`}
                properties={{ name: "AiOutlineDelete", size: 16 }}
              />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  };

  const deleteFileName =
    deleteTarget?.file_title || deleteTarget?.file?.name || "this file";

  const renderContent = () => (
    <div id={blockId} className={classNames.element} style={styles.element} onPaste={viewOnly ? undefined : onPaste}>
      {!hideDragger && (
        <Dragger
          accept={properties.accept ?? "*"}
          beforeUpload={loadFileList}
          className={classNames.dragger}
          style={styles.dragger}
          customRequest={s3UploadRequest}
          disabled={properties.disabled}
          fileList={draggerState.fileList}
          multiple={false}
          showUploadList={false}
          onChange={() => methods.triggerEvent({ name: "onChange" })}
        >
          <div className={classNames.hint} style={styles.hint}>
            {renderHtml({
              html: properties.hint ?? "Click or drag file to upload",
              methods,
            })}
          </div>
        </Dragger>
      )}

      {draggerState.fileList.map((f) =>
        f.status === "uploading" ? (
          <Progress
            key={f.uid}
            percent={Math.round(f.percent ?? 0)}
            size="small"
            style={{ padding: "4px 0" }}
          />
        ) : null,
      )}

      {fileDocs.length > 0 ? (
        <div className={classNames.fileList} style={styles.fileList}>{fileDocs.map((doc, i) => renderFileItem(doc, i))}</div>
      ) : viewOnly ? (
        <Text type="secondary" style={{ fontSize: 12, fontStyle: "italic" }}>
          No files
        </Text>
      ) : null}

      {hasForm && (
        <Modal
          title={properties.modalTitle ?? "Upload File"}
          open={modalOpen}
          onOk={handleModalOk}
          onCancel={handleModalCancel}
          okText={properties.okText ?? "Save"}
          destroyOnClose
        >
          {content.form()}
        </Modal>
      )}

      <Modal
        title="Delete file"
        open={deleteModalOpen}
        onOk={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        Are you sure you want to delete <strong>{deleteFileName}</strong>?
      </Modal>
    </div>
  );

  if (properties.label) {
    return (
      <Label
        blockId={blockId}
        components={components}
        events={events}
        properties={{
          title: properties.label.title,
          size: properties.size,
          ...properties.label,
        }}
        required={properties.required}
        validation={validation}
        content={{
          content: renderContent,
        }}
      />
    );
  }

  return renderContent();
};

export default withBlockDefaults(FileManager);

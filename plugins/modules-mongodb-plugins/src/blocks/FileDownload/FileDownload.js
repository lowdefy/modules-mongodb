import React, { useEffect } from "react";
import { Upload } from "antd";
import { withBlockDefaults } from "@lowdefy/block-utils";
import { downloadFile, registerDownloadEvent } from "./downloadFile.js";

/**
 * FileDownload block.
 *
 * Lists `properties.fileList` and, on click, asks the API endpoint
 * `properties.downloadEndpointId` for a signed link to that one file with
 * payload { ...downloadPayload, file_id }, where file_id is the file's _id,
 * else its key. The endpoint returns { url }, which opens in a new tab.
 *
 * EventsTimeline and DataDescriptions render it inside themselves with their
 * own methods, so several instances share one host's registered event; each
 * click carries its own file and payload in the event.
 */
const FileDownload = ({
  blockId,
  classNames = {},
  methods,
  properties,
  styles = {},
}) => {
  const { downloadEndpointId, downloadPayload } = properties;

  useEffect(() => {
    registerDownloadEvent({ methods, downloadEndpointId });
  }, [downloadEndpointId]);

  const onDownload = (file) => downloadFile({ file, downloadPayload, methods });

  return (
    <Upload
      id={blockId}
      className={classNames.element}
      style={styles.element}
      fileList={properties.fileList ?? []}
      onPreview={onDownload}
      onDownload={onDownload}
      showUploadList={{ showDownloadIcon: true, showRemoveIcon: false }}
    />
  );
};

export default withBlockDefaults(FileDownload);

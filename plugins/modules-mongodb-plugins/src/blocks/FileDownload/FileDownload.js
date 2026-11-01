import React from "react";
import { Upload } from "antd";
import { withBlockDefaults } from "@lowdefy/block-utils";
import fileLinkHref, { getFileKey } from "./fileLinkHref.js";

// antd keys list rows by uid and, given a file without one, renders it twice
// after a re-render. File records carry no uid, so one is taken from the file.
// With a url, antd renders the file name as <a href target="_blank"
// rel="noopener noreferrer">.
const withLinks = ({ fileList, basePath, linkEndpointId, linkPath }) =>
  (fileList ?? []).map((file, index) => {
    const key = getFileKey(file);
    return {
      ...file,
      uid: file?.uid ?? String(key ?? index),
      url: fileLinkHref({ basePath, linkEndpointId, linkPath, key }),
    };
  });

const openLink = (file) => {
  if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
};

/**
 * FileDownload block.
 *
 * Lists `properties.fileList` as plain links to the link endpoint
 * `properties.linkEndpointId`:
 * <basePath>/api/endpoints/<linkEndpointId>/<...linkPath>/<key>, where key is
 * each file's _id, else its key. The endpoint checks access on every open and
 * redirects to the file.
 *
 * EventsTimeline, DataDescriptions and SmartDescriptions render it inside
 * themselves and pass their own basePath.
 */
const FileDownload = ({
  basePath,
  blockId,
  classNames = {},
  properties,
  styles = {},
}) => {
  const { fileList, linkEndpointId, linkPath } = properties;
  return (
    <Upload
      id={blockId}
      className={classNames.element}
      style={styles.element}
      fileList={withLinks({ fileList, basePath, linkEndpointId, linkPath })}
      onDownload={openLink}
      showUploadList={{ showDownloadIcon: true, showRemoveIcon: false }}
    />
  );
};

export default withBlockDefaults(FileDownload);

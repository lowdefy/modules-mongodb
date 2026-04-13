import { useState } from 'react';
import { type } from '@lowdefy/helpers';

const useFileList = ({ methods }) => {
  const [state, setState] = useState({ file: null, fileList: [] });

  const setValue = (stateValue) => {
    const file = type.isObject(stateValue?.file) ? stateValue.file : null;
    const fileList = type.isArray(stateValue?.fileList) ? stateValue.fileList : [];
    setState({ file, fileList });
  };

  const setFileList = async ({ event, file, percent }) => {
    if (!file) {
      throw new Error('File is undefined in useFileList');
    }
    const { bucket, key, lastModified, name, size, status, type: fileType, uid } = file;
    const fileObj = {
      bucket,
      key,
      lastModified,
      name,
      percent: percent ?? file.percent ?? 0,
      size,
      status,
      type: fileType,
      uid,
    };
    switch (event) {
      case 'onProgress':
        fileObj.status = 'uploading';
        fileObj.percent = percent ?? fileObj.percent;
        break;
      case 'onSuccess':
        fileObj.status = 'done';
        fileObj.percent = 100;
        break;
      case 'onRemove':
        fileObj.status = 'removed';
        break;
      default:
        fileObj.status = 'error';
        break;
    }
    setState((prev) => {
      const nextList = [...prev.fileList];
      const idx = nextList.findIndex((f) => f.uid === fileObj.uid);
      if (idx >= 0) {
        nextList.splice(idx, 1, fileObj);
      } else {
        nextList.push(fileObj);
      }
      return { file: fileObj, fileList: nextList };
    });
    await methods.triggerEvent({ name: event, event: { file: fileObj } });
  };

  const loadFileList = (file) => {
    setState((prev) => ({
      file,
      fileList: [file, ...prev.fileList],
    }));
  };

  return [state, loadFileList, setFileList, setValue];
};

export default useFileList;

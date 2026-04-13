export default {
  category: 'container',
  icons: [
    'AiFillCheckCircle',
    'AiFillCloseCircle',
    'AiFillExclamationCircle',
    'AiOutlineLoading',
    'AiOutlineFile',
    'AiOutlineFilePdf',
    'AiOutlineFileExcel',
    'AiOutlineFileWord',
    'AiOutlineFileImage',
    'AiOutlineCloudUpload',
    'AiOutlineDelete',
    'AiOutlineDownload',
  ],
  cssKeys: {
    element: 'The outer FileManager container.',
    dragger: 'The upload dragger area.',
    hint: 'The hint text inside the dragger.',
    fileList: 'The file list container.',
    fileItem: 'Individual file item row.',
  },
  events: {
    onChange: 'Triggered when upload state changes.',
    onSave: {
      description: 'Triggered when a file is uploaded and ready to save.',
      event: {
        file: 'The uploaded file object with name, key, bucket, size, type, thumbnail.',
      },
    },
    onDelete: {
      description: 'Triggered when a file delete is confirmed.',
      event: {
        fileDoc: 'The full file document being deleted.',
      },
    },
  },
};

export default {
  category: "container",
  slots: {
    form: "Fields rendered in the post-upload modal. Field ids must be nested under `{blockId}.form.*`; their state is passed through to onSave.",
  },
  icons: [
    "check-circle",
    "close-circle",
    "CircleAlert",
    "loading",
    "file",
    "FileText",
    "FileSpreadsheet",
    "FileText",
    "FileImage",
    "CloudUpload",
    "delete",
    "download",
  ],
  cssKeys: {
    element: "The outer FileManager container.",
    dragger: "The upload dragger area.",
    hint: "The hint text inside the dragger.",
    fileList: "The file list container.",
    fileItem: "Individual file item row.",
  },
  events: {
    onChange: "Triggered when upload state changes.",
    onUploadPolicy: {
      description:
        "When defined, triggered before each upload in place of the s3PostPolicyRequestId request. The actions fetch an S3 post policy (for example with CallAPI) and hand it to the block with CallMethod setUploadPolicy. If the event ends without a policy, the block holds the upload quietly, with no error state, until the page sends it with setUploadPolicy and the file's uid or forgets it with cancelUpload.",
      event: {
        file: "The file to upload: name, lastModified, size, type, uid.",
        pasted: "true when the file came from the clipboard, else false.",
      },
    },
    onSave: {
      description: "Triggered when a file is uploaded and ready to save.",
      event: {
        file: "The uploaded file object with name, key, bucket, size, type, thumbnail, and pasted: true when it came from the clipboard.",
      },
    },
    onDelete: {
      description: "Triggered when a file delete is confirmed.",
      event: {
        fileDoc: "The full file document being deleted.",
      },
    },
    onDownload: {
      description: "Triggered when a file download is initiated.",
      event: {
        fileDoc: "The full file document being downloaded.",
      },
    },
  },
  methods: {
    uploadFromPaste: {
      description:
        "Read the system clipboard (PNG or JPEG only) and start an upload.",
    },
    setUploadPolicy: {
      description:
        "Hand the block the S3 post policy for an upload. From the onUploadPolicy actions it answers the upload that asked; with the uid of a held upload, called at any time, it sends that upload.",
      params: {
        policy:
          "The post policy: { url, fields }, where fields carries the key and bucket.",
        uid: "Optional. The uid from the onUploadPolicy event of the upload this policy is for.",
      },
    },
    cancelUpload: {
      description:
        "Forget a held upload, one whose onUploadPolicy event ended without a policy.",
      params: {
        uid: "The uid from that upload's onUploadPolicy event.",
      },
    },
  },
};

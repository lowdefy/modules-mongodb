const isPolicy = (policy) => typeof policy?.url === "string";

const getPolicyFromRequest = async ({ methods, file }) => {
  const response = await methods.triggerEvent({
    name: "__getS3PostPolicy",
    event: { file },
  });
  if (response.success !== true) {
    throw new Error("S3 post policy request error.");
  }
  return response.responses.__getS3PostPolicy.response[0];
};

// uploadsRef.current holds:
//   queue: the policy event chain, so events run one at a time and each
//     setUploadPolicy call lands on the upload that asked for it
//   asking: { uid, policy } for the upload whose onUploadPolicy event is
//     running; setUploadPolicy writes its policy
//   held: uid to File, for uploads whose event ended with no policy;
//     setUploadPolicy with that uid sends one, cancelUpload forgets it
const getS3Upload = ({
  methods,
  setFileList,
  removeFile,
  usePolicyEvent,
  uploadsRef,
}) => {
  const uploads = uploadsRef.current;

  const getPolicyFromEvent = async ({ file, pasted }) => {
    uploads.asking = { uid: file.uid, policy: null };
    try {
      const response = await methods.triggerEvent({
        name: "onUploadPolicy",
        event: { file, pasted },
      });
      if (response.success !== true) return null;
      const { policy } = uploads.asking;
      return isPolicy(policy) ? policy : null;
    } finally {
      uploads.asking = null;
    }
  };

  const queuePolicyEvent = (args) => {
    const next = uploads.queue.then(() => getPolicyFromEvent(args));
    uploads.queue = next.catch(() => null);
    return next;
  };

  const send = async ({ file, policy }) => {
    try {
      const { url, fields = {} } = policy;
      const { bucket, key } = fields;
      file.bucket = bucket;
      file.key = key;
      file.percent = 20;
      const formData = new FormData();
      Object.keys(fields).forEach((field) => {
        formData.append(field, fields[field]);
      });
      formData.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = async (event) => {
        if (event.lengthComputable) {
          await setFileList({
            event: "onProgress",
            file,
            percent: (event.loaded / event.total) * 80 + 20,
          });
        }
      };
      xhr.addEventListener("error", async () => {
        await setFileList({ event: "onError", file });
      });
      xhr.addEventListener("loadend", async () => {
        await setFileList({ event: "onSuccess", file });
      });
      xhr.open("post", url);
      xhr.send(formData);
    } catch (error) {
      console.error(error);
      await setFileList({ event: "onError", file });
    }
  };

  const upload = async ({ file, pasted = false }) => {
    if (!file) {
      console.warn("File is undefined in getS3Upload");
      return;
    }
    try {
      const { lastModified, name, size, type, uid } = file;
      const fileInfo = { name, lastModified, size, type, uid };
      file.pasted = pasted === true;
      if (!usePolicyEvent) {
        const policy = await getPolicyFromRequest({ methods, file: fileInfo });
        await send({ file, policy });
        return;
      }
      const policy = await queuePolicyEvent({
        file: fileInfo,
        pasted: file.pasted,
      });
      if (policy) {
        await send({ file, policy });
        return;
      }
      uploads.held.set(uid, file);
      removeFile(uid);
    } catch (error) {
      console.error(error);
      await setFileList({ event: "onError", file });
    }
  };

  // With the uid of a held upload, sends it with this policy. Otherwise sets
  // the policy of the upload whose event is running, when uid is left out or
  // names that upload.
  const setUploadPolicy = async (policy, uid) => {
    if (uid != null && uploads.held.has(uid)) {
      if (!isPolicy(policy)) return;
      const file = uploads.held.get(uid);
      uploads.held.delete(uid);
      await send({ file, policy });
      return;
    }
    if (!uploads.asking) return;
    if (uid != null && uid !== uploads.asking.uid) return;
    uploads.asking.policy = policy ?? null;
  };

  const cancelUpload = (uid) => {
    uploads.held.delete(uid);
  };

  return { upload, setUploadPolicy, cancelUpload };
};

export default getS3Upload;

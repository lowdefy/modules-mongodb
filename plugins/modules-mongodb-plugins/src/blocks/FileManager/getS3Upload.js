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

// The page's onUploadPolicy actions hand the policy back by calling the
// block's setUploadPolicy method, which writes policyRef. No policy by the
// time the event ends (the page declined, or an action failed) means no upload.
const getPolicyFromEvent = async ({ methods, file, pasted, policyRef }) => {
  policyRef.current = null;
  const response = await methods.triggerEvent({
    name: "onUploadPolicy",
    event: { file, pasted },
  });
  const policy = policyRef.current;
  policyRef.current = null;
  if (response.success !== true) return null;
  if (typeof policy?.url !== "string") return null;
  return policy;
};

const getS3Upload = ({
  methods,
  setFileList,
  removeFile,
  usePolicyEvent,
  policyRef,
  policyQueueRef,
}) => {
  // One policy event at a time, so each setUploadPolicy call lands on the
  // upload that asked for it.
  const queuePolicyEvent = (args) => {
    const next = policyQueueRef.current.then(() => getPolicyFromEvent(args));
    policyQueueRef.current = next.catch(() => null);
    return next;
  };

  return async ({ file, pasted = false }) => {
    if (!file) {
      console.warn("File is undefined in getS3Upload");
      return;
    }
    try {
      const { lastModified, name, size, type, uid } = file;
      const fileInfo = { name, lastModified, size, type, uid };
      file.pasted = pasted === true;
      let policy;
      if (usePolicyEvent) {
        policy = await queuePolicyEvent({
          methods,
          file: fileInfo,
          pasted: file.pasted,
          policyRef,
        });
        if (!policy) {
          removeFile(uid);
          return;
        }
      } else {
        policy = await getPolicyFromRequest({ methods, file: fileInfo });
      }
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
};

export default getS3Upload;

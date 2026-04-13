const getFileFromEvent = async (event) => {
  const items = event.clipboardData.items;
  for (const item of items) {
    if (item.kind === 'file') {
      return item.getAsFile();
    }
  }
};

const getFileFromNavigator = async () => {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    for (const type of item.types) {
      if (type === 'image/png' || type === 'image/jpeg') {
        const blob = await item.getType(type);
        return new File([blob], 'clipboard.png', { type: blob.type });
      }
    }
  }
};

const getOnPaste =
  ({ s3UploadRequest, properties }) =>
  async (event) => {
    event?.preventDefault?.();
    if (properties.disabled || properties.viewOnly) return;
    const file = event ? await getFileFromEvent(event) : await getFileFromNavigator();
    if (!file) return;
    file.uid = `${file.name ?? 'clipboard'}-${Date.now()}`;
    await s3UploadRequest({ file });
  };

export default getOnPaste;

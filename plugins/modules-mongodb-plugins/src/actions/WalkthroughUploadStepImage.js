// An action because the key carries a hash of the bytes, and hashing is async where `_js` is not;
// a Blob cannot be passed between actions either, since state deep-copies through JSON.

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const IMAGE_TYPE = 'image/jpeg';
const IMAGE_QUALITY = 0.92;

// The decoded image, whose own size is the pixel space a focus point is stored in.
const decode = (blob) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file could not be read as an image.'));
    };
    image.src = objectUrl;
  });

const toJpeg = async (image, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.height = height;
  canvas.width = width;
  const context = canvas.getContext('2d');
  // JPEG has no alpha, and a transparent pixel would otherwise encode as black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, IMAGE_TYPE, IMAGE_QUALITY));
  if (!blob) throw new Error('That image could not be converted to JPEG.');
  return blob;
};

async function WalkthroughUploadStepImage({ methods: { callAPI }, params }) {
  const { endpointId, source, stepId, walkthroughId } = params ?? {};
  if (!endpointId || !source || !stepId || !walkthroughId) {
    throw new Error(
      'WalkthroughUploadStepImage requires endpointId, source, walkthroughId and stepId.'
    );
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('Screenshots can only be added over HTTPS.');
  }
  const picked = await (await fetch(source)).blob();
  const image = await decode(picked);
  const height = image.naturalHeight;
  const width = image.naturalWidth;
  // The key and the policy both say JPEG, so anything else is re-encoded rather than mislabelled.
  const blob = picked.type === IMAGE_TYPE ? picked : await toJpeg(image, width, height);
  const contentHash = toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const { response } = await callAPI({
    endpointId,
    payload: { content_hash: contentHash, step_id: stepId, walkthrough_id: walkthroughId },
  });
  const form = new FormData();
  Object.entries(response.fields ?? {}).forEach(([field, value]) => form.append(field, value));
  // S3 ignores everything after the `file` part, so the policy fields have to go in first.
  form.append('file', blob);
  const upload = await fetch(response.url, { body: form, method: 'POST' });
  if (!upload.ok) {
    const detail = (await upload.text()).match(/<Message>([^<]*)<\/Message>/)?.[1];
    throw new Error(
      `The screenshot was refused by storage (${upload.status}${detail ? `: ${detail}` : ''}).`
    );
  }
  return { height, key: response.key, width };
}

export default WalkthroughUploadStepImage;

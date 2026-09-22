// An action rather than YAML in the module: the key carries a SHA-256 of the bytes and the
// presigned policy fixes the key, so the bytes must be hashed before the policy is asked for —
// and `_js` operators are synchronous, while `crypto.subtle.digest` is not. Splitting it across
// actions does not help either, because `_state` and `_actions` deep-copy through JSON, which
// turns a Blob or an ArrayBuffer into `{}` on the way out of one action and into the next.

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

// The decoded image's own dimensions, not what the picker reported: a focus point is stored in
// this image's pixel space, so a wrong size silently puts every highlight in the wrong place.
const readNaturalSize = (blob) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file could not be read as an image.'));
    };
    image.src = objectUrl;
  });

async function WalkthroughUploadStepImage({ methods: { callAPI }, params }) {
  const { endpointId, source, stepId, walkthroughId } = params ?? {};
  if (!endpointId || !source || !stepId || !walkthroughId) {
    throw new Error(
      'WalkthroughUploadStepImage requires endpointId, source, walkthroughId and stepId.'
    );
  }
  const blob = await (await fetch(source)).blob();
  const contentHash = toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const { height, width } = await readNaturalSize(blob);
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
    throw new Error(`The screenshot was refused by storage (${upload.status}).`);
  }
  return { height, key: response.key, width };
}

export default WalkthroughUploadStepImage;

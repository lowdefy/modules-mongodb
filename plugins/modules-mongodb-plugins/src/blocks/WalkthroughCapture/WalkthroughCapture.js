import React, { useEffect, useRef, useState } from 'react';
import { withBlockDefaults } from '@lowdefy/block-utils';

// The stored key ends `.jpeg`, so the format is settled; 0.92 is where the quantiser stops being
// what limits a screenshot — above it the file grows for differences no reader can see at 1:1.
const IMAGE_TYPE = 'image/jpeg';
const IMAGE_QUALITY = 0.92;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const WalkthroughCaptureBlock = ({ blockId, methods, properties }) => {
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [supported, setSupported] = useState(null);

  useEffect(() => {
    setSupported(Boolean(navigator.mediaDevices?.getDisplayMedia));

    const release = () => {
      const stream = streamRef.current;
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      stream?.getTracks().forEach((track) => track.stop());
      return Boolean(stream);
    };

    // Stopping a track from here does not fire `ended`, so this runs only when the user stops the
    // share from the browser's own control. Without it the preview freezes and the consumer goes
    // on believing it is sharing.
    const handleEnded = () => {
      if (release()) {
        setSharing(false);
        methods.triggerEvent({ name: 'onShareEnd', event: {} });
      }
    };

    methods.registerMethod('startSharing', async () => {
      if (!navigator.mediaDevices?.getDisplayMedia) return false;
      if (streamRef.current) return true;
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } catch (error) {
        // Dismissing the picker raises the same NotAllowedError a blocked permissions policy
        // does, and nothing tells them apart — so it returns false rather than raising, because
        // changing your mind about sharing is not an error.
        if (error.name === 'NotAllowedError') return false;
        throw error;
      }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', handleEnded));
      if (videoRef.current) videoRef.current.srcObject = stream;
      setSharing(true);
      methods.triggerEvent({ name: 'onShareStart', event: {} });
      return true;
    });

    methods.registerMethod('stopSharing', () => {
      if (!release()) return false;
      setSharing(false);
      methods.triggerEvent({ name: 'onShareEnd', event: {} });
      return true;
    });

    methods.registerMethod('capture', async () => {
      const video = videoRef.current;
      if (!streamRef.current || !video) {
        throw new Error('Share a window or screen before capturing.');
      }
      // The stream's own size, not the preview's: a focus point is stored in the captured image's
      // pixel space, so the frame is taken at whatever the shared display gives.
      const height = video.videoHeight;
      const width = video.videoWidth;
      if (!height || !width) {
        throw new Error('The shared window has not produced a frame yet.');
      }
      const canvas = document.createElement('canvas');
      canvas.height = height;
      canvas.width = width;
      canvas.getContext('2d').drawImage(video, 0, 0, width, height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, IMAGE_TYPE, IMAGE_QUALITY)
      );
      if (!blob) {
        throw new Error('The captured frame could not be encoded.');
      }
      // An object URL rather than the blob: a consumer carries this through state or an action
      // response, and both deep-copy through JSON, which would leave `{}` behind.
      const captured = { height, url: URL.createObjectURL(blob), width };
      methods.triggerEvent({ name: 'onCapture', event: captured });
      return captured;
    });

    // Unmounting releases the stream, so it reports the end as well: a consumer that hides this
    // block — behind a preview toggle, say — would otherwise go on holding it as sharing, and
    // the browser's indicator would outlive the page.
    return () => {
      if (release()) {
        methods.triggerEvent({ name: 'onShareEnd', event: {} });
      }
    };
  }, []);

  const previewHeight = positive(properties.previewHeight) ?? 270;
  const previewWidth = positive(properties.previewWidth) ?? 480;

  return (
    <div id={blockId}>
      {supported === false && (
        <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
          Screen capture is not available in this browser. Upload a screenshot instead.
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          display: sharing ? 'block' : 'none',
          width: previewWidth,
          height: previewHeight,
          objectFit: 'contain',
          borderRadius: 8,
          background: '#000',
        }}
      />
    </div>
  );
};

export default withBlockDefaults(WalkthroughCaptureBlock);

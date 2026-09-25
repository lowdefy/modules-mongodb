import React, { useEffect, useRef, useState } from 'react';
import { withBlockDefaults } from '@lowdefy/block-utils';

// 0.92 is where the quantiser stops limiting a screenshot; above it the file only grows.
const IMAGE_TYPE = 'image/jpeg';
const IMAGE_QUALITY = 0.92;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const WalkthroughCaptureBlock = ({ blockId, methods, properties }) => {
  const streamRef = useRef(null);
  const pendingRef = useRef(null);
  const mountedRef = useRef(true);
  const videoRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [supported, setSupported] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(Boolean(navigator.mediaDevices?.getDisplayMedia));

    const release = () => {
      const stream = streamRef.current;
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      stream?.getTracks().forEach((track) => track.stop());
      return Boolean(stream);
    };

    // Only the browser's own stop control fires `ended`; stopping a track from here does not.
    const handleEnded = () => {
      if (release()) {
        setSharing(false);
        methods.triggerEvent({ name: 'onShareEnd', event: {} });
      }
    };

    const share = async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } catch (error) {
        // Dismissing the picker is indistinguishable from a blocked policy, and is not an error.
        if (error.name === 'NotAllowedError') return false;
        throw error;
      }
      // Unmounted while the picker was open: nothing is left to show it, so stop it here.
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', handleEnded));
      if (videoRef.current) videoRef.current.srcObject = stream;
      setSharing(true);
      methods.triggerEvent({ name: 'onShareStart', event: {} });
      return true;
    };

    methods.registerMethod('startSharing', () => {
      if (!navigator.mediaDevices?.getDisplayMedia) return false;
      if (streamRef.current) return true;
      // A second click while the picker is open shares the first one's outcome.
      if (!pendingRef.current) {
        pendingRef.current = share().finally(() => {
          pendingRef.current = null;
        });
      }
      return pendingRef.current;
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
      // The stream's own size, not the preview's: a focus point is stored in the image's pixels.
      const height = video.videoHeight;
      const width = video.videoWidth;
      if (!height || !width) {
        throw new Error('The shared screen has not produced a frame yet.');
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
      // A URL rather than the blob, which would not survive state's JSON deep copy.
      const captured = { height, url: URL.createObjectURL(blob), width };
      methods.triggerEvent({ name: 'onCapture', event: captured });
      return captured;
    });

    // Hiding the block unmounts it, so the end is reported or the consumer goes on sharing.
    return () => {
      mountedRef.current = false;
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
          {window.isSecureContext
            ? 'Screen capture is not available in this browser. Upload a screenshot instead.'
            : 'Screenshots can only be added over HTTPS.'}
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

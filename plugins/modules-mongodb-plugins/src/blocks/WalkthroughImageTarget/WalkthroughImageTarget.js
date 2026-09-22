import React, { useEffect, useRef, useState } from 'react';
import { withBlockDefaults } from '@lowdefy/block-utils';

const RING_SIZE = 44;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const clamp = (value, max) => Math.min(Math.max(value, 0), max);

const WalkthroughImageTargetBlock = ({ blockId, methods, properties }) => {
  const imgRef = useRef(null);
  const [intrinsic, setIntrinsic] = useState(null);
  // The point is held here as well as taken from the property so it lands the instant it is
  // clicked; the property re-seeds it when the consumer stores it, or when the image changes.
  const [focus, setFocus] = useState(properties.focus ?? null);

  useEffect(() => {
    setFocus(properties.focus ?? null);
  }, [properties.src, properties.focus?.x, properties.focus?.y]);

  useEffect(() => {
    methods.registerMethod('clearFocus', () => setFocus(null));
  }, []);

  // A consumer can omit the natural size, and the block cannot map a click without it, so the
  // loaded element's own dimensions stand in.
  const naturalWidth = positive(properties.naturalWidth) ?? intrinsic?.width ?? null;
  const naturalHeight = positive(properties.naturalHeight) ?? intrinsic?.height ?? null;
  const frameWidth = positive(properties.frameWidth) ?? 860;
  const frameHeight = positive(properties.frameHeight) ?? 520;

  const scale =
    naturalWidth && naturalHeight
      ? Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight)
      : null;

  const handleClick = (event) => {
    if (!imgRef.current || !naturalWidth || !naturalHeight) return;
    // The rendered rectangle is the only trustworthy scale: a resized frame or a letterboxed
    // image changes it, and neither is visible from the properties.
    const rect = imgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp(
      Math.round(((event.clientX - rect.left) / rect.width) * naturalWidth),
      naturalWidth
    );
    const y = clamp(
      Math.round(((event.clientY - rect.top) / rect.height) * naturalHeight),
      naturalHeight
    );
    setFocus({ x, y });
    methods.triggerEvent({ name: 'onPlace', event: { x, y } });
  };

  const showFocus =
    naturalWidth && naturalHeight && Number.isFinite(focus?.x) && Number.isFinite(focus?.y);

  return (
    <div
      id={blockId}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        width: frameWidth,
        height: frameHeight,
        borderRadius: 8,
        background: '#000',
      }}
    >
      <div
        style={{
          position: 'relative',
          lineHeight: 0,
          ...(scale
            ? { width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) }
            : { maxWidth: '100%', maxHeight: '100%' }),
        }}
      >
        <img
          ref={imgRef}
          alt=""
          src={properties.src}
          onClick={handleClick}
          onLoad={(event) =>
            setIntrinsic({
              width: event.target.naturalWidth,
              height: event.target.naturalHeight,
            })
          }
          style={{
            display: 'block',
            width: scale ? '100%' : 'auto',
            height: scale ? '100%' : 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            cursor: 'crosshair',
          }}
        />
        {showFocus && (
          <div
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              width: RING_SIZE,
              height: RING_SIZE,
              marginLeft: -RING_SIZE / 2,
              marginTop: -RING_SIZE / 2,
              borderRadius: '50%',
              border: '2px solid rgb(251, 146, 60)',
              background: 'rgba(251, 146, 60, 0.047)',
              left: `${(focus.x / naturalWidth) * 100}%`,
              top: `${(focus.y / naturalHeight) * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default withBlockDefaults(WalkthroughImageTargetBlock);

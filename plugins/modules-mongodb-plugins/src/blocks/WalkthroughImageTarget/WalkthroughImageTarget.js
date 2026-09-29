import React, { useEffect, useRef, useState } from 'react';
import { withBlockDefaults } from '@lowdefy/block-utils';

const RING_SIZE = 44;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const clamp = (value, size) => Math.min(Math.max(value, 0), size - 1);

const WalkthroughImageTargetBlock = ({ blockId, methods, properties }) => {
  const imgRef = useRef(null);
  const [intrinsic, setIntrinsic] = useState(null);
  // Held locally so a click shows at once; the property re-seeds it once the consumer stores it.
  const [focus, setFocus] = useState(properties.focus ?? null);

  useEffect(() => {
    setFocus(properties.focus ?? null);
  }, [properties.src, properties.focus?.x, properties.focus?.y]);

  // The loaded element's own size stands in when the consumer omits the natural size.
  // Keyed to its source, so a new image never borrows the previous one's size.
  const measured = intrinsic?.src === properties.src ? intrinsic : null;
  const naturalWidth = positive(properties.naturalWidth) ?? measured?.width ?? null;
  const naturalHeight = positive(properties.naturalHeight) ?? measured?.height ?? null;
  const frameWidth = positive(properties.frameWidth) ?? 860;
  const frameHeight = positive(properties.frameHeight) ?? 520;

  const scale =
    naturalWidth && naturalHeight
      ? Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight)
      : null;

  const handleClick = (event) => {
    if (!imgRef.current || !naturalWidth || !naturalHeight) return;
    // The rendered rectangle, since resizing or letterboxing changes the scale unseen.
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
              src: properties.src,
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

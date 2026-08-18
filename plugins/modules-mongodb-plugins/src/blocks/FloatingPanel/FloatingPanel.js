// FloatingPanel block — Intercom-style launcher + floating panel.
//
// Why this exists rather than a Drawer: a Drawer masks or reflows the page, and
// even mask:false leaves a full-height slab down one side. This is a corner
// panel over a pointer-events:none wrapper, so the page behind stays fully
// clickable — you can keep working on the page with the panel open, which is
// the entire reason for the pattern.
//
// Three things worth knowing before editing:
//
//  1. Children are LAZY-MOUNTED then KEPT MOUNTED. Nothing renders until the
//     first open (so a chat does not boot on page load), and after that closing
//     only hides the panel with CSS. Unmounting would throw away scroll
//     position, a half-typed message, and an in-flight stream every time
//     somebody minimised.
//
//  2. The body publishes its own pixel height as the CSS variable
//     --fp-body-height. Children that need to fill the panel (a chat, a
//     virtualised list) can then say `height: var(--fp-body-height)`.
//     A percentage would not work: Lowdefy wraps every block in lf-col / lf-row
//     divs that have no definite height, which breaks the percentage chain.
//     Custom properties inherit straight through those wrappers.
//
//  3. There is NO focus trap, deliberately. Trapping focus would undo the point
//     of a non-blocking panel. Escape closes and focus returns to the launcher.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { get } from '@lowdefy/helpers';
import { cn, withBlockDefaults } from '@lowdefy/block-utils';
import './style.module.css';

const asCss = (v) => (typeof v === 'number' ? `${v}px` : v);

// ── Built-in chrome. Inline SVG so the block carries no icon-registry deps. ──
const IconClose = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
    <path
      d="M4 4l8 8M12 4l-8 8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const IconExpand = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
    <path
      d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const IconCollapse = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
    <path
      d="M13 3.5H9.5V7M3 12.5H6.5V9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

// Launcher default: a chat bubble. Chevron-down on open, so the control reads
// as "put this away" rather than "destroy this" — closing keeps the thread.
const IconBubble = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path
      d="M12 3.2c-4.7 0-8.5 3.2-8.5 7.2 0 2.3 1.3 4.4 3.3 5.7v3.3l3.1-1.7c.7.1 1.4.2 2.1.2 4.7 0 8.5-3.2 8.5-7.2S16.7 3.2 12 3.2z"
      fill="currentColor"
    />
  </svg>
);

const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path
      d="M6 9.5l6 6 6-6"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const IconSpark = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
    <path
      d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"
      fill="currentColor"
    />
  </svg>
);

const FloatingPanel = ({
  blockId,
  classNames = {},
  components: { Icon } = {},
  content = {},
  events,
  methods,
  properties,
  rename,
  styles = {},
}) => {
  const [open, setOpen] = useState(Boolean(properties.defaultOpen));
  const [expanded, setExpanded] = useState(false);
  // Latch: children mount on the first open and stay mounted after that.
  const [everOpened, setEverOpened] = useState(Boolean(properties.defaultOpen));

  const bodyRef = useRef(null);
  const panelRef = useRef(null);
  const launcherRef = useRef(null);
  // Suppresses the focus hand-off on the very first paint when defaultOpen is
  // set — stealing focus on page load is hostile.
  const firstPaint = useRef(true);

  const launcher = properties.launcher === false ? null : properties.launcher || {};
  const avatar = properties.avatar || {};
  const offsetBottom = get(properties, 'offset.bottom', { default: 24 });
  const offsetSide = get(properties, 'offset.side', { default: 24 });

  const fire = useCallback(
    (name, event) =>
      methods.triggerEvent({
        name: get(rename, `events.${name}`, { default: name }),
        ...(event ? { event } : {}),
      }),
    [methods, rename]
  );

  const applyOpen = useCallback(
    (next) => {
      setOpen((prev) => {
        if (prev === next) return prev;
        if (next) setEverOpened(true);
        fire('onToggle', { open: next });
        fire(next ? 'onOpen' : 'onClose');
        return next;
      });
    },
    [fire]
  );

  const applyExpanded = useCallback(
    (next) => {
      setExpanded((prev) => {
        if (prev === next) return prev;
        fire('onExpand', { expanded: next });
        return next;
      });
    },
    [fire]
  );

  // No dependency array, matching the antd container blocks: the registered
  // closures must see the current open/expanded state on every render.
  useEffect(() => {
    methods.registerMethod(get(rename, 'methods.setOpen', { default: 'setOpen' }), (args) =>
      applyOpen(Boolean(args && args.open))
    );
    methods.registerMethod(get(rename, 'methods.toggleOpen', { default: 'toggleOpen' }), () =>
      applyOpen(!open)
    );
    methods.registerMethod(get(rename, 'methods.setExpanded', { default: 'setExpanded' }), (args) =>
      applyExpanded(Boolean(args && args.expanded))
    );
  });

  // Escape closes. Bound to the document rather than the panel because the
  // panel does not hold focus — the user may well be typing on the page behind.
  useEffect(() => {
    if (!open || properties.keyboard === false) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') applyOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, properties.keyboard, applyOpen]);

  // Publish the body's height as a CSS variable for children to size against
  // (see note 2 at the top). visibility:hidden keeps the box in layout, so this
  // stays correct while closed and updates across expand and viewport resize.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // Content-box height, NOT clientHeight — clientHeight includes the body's
    // own padding, so a child sized to it would overflow by exactly that much.
    const publish = () => {
      const cs = getComputedStyle(el);
      const h =
        el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      el.style.setProperty('--fp-body-height', `${Math.max(0, Math.round(h))}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [everOpened]);

  // Focus hand-off. Into the panel on open so Escape and Tab land somewhere
  // sensible; back to the launcher on close so the keyboard user is not
  // dumped at the top of the document.
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    if (open) panelRef.current?.focus({ preventScroll: true });
    else launcherRef.current?.focus({ preventScroll: true });
  }, [open]);

  const badge = launcher && launcher.badge;
  const hasBadge = badge !== undefined && badge !== null && badge !== '' && badge !== 0;

  // The host Icon defaults to ~16px, which is right in a button label and far
  // too small as a 56px launcher's only content — so a size is always passed.
  // An object spec wins over it, so callers can still override.
  const renderIcon = (spec, fallback, key, size) => {
    if (!spec || !Icon) return fallback;
    const iconProps = typeof spec === 'string' ? { name: spec, size } : { size, ...spec };
    return <Icon blockId={`${blockId}_${key}`} events={events} properties={iconProps} />;
  };

  return (
    <div
      id={blockId}
      className={cn('fp-root', classNames.element)}
      data-placement={properties.placement || 'bottom-right'}
      style={{
        // Only when explicitly set. A property-schema `default` is
        // documentation, not a value — it never reaches the block — so
        // relying on it left z-index:auto here and the page painted over the
        // panel. The real default lives in the stylesheet.
        ...(properties.zIndex == null ? {} : { zIndex: properties.zIndex }),
        '--fp-bottom': `${offsetBottom}px`,
        '--fp-side': `${offsetSide}px`,
        '--fp-width': asCss(properties.width),
        '--fp-width-expanded': asCss(properties.expandedWidth),
        '--fp-height': asCss(properties.height),
        ...styles.element,
      }}
    >
      <section
        ref={panelRef}
        className={cn('fp-panel', classNames.panel)}
        data-open={open ? 'true' : 'false'}
        data-expanded={expanded ? 'true' : 'false'}
        // aria-hidden while closed so the whole subtree leaves the a11y tree
        // even though it stays in the DOM.
        aria-hidden={open ? undefined : 'true'}
        aria-label={properties.title || 'Panel'}
        role="dialog"
        tabIndex={-1}
        style={styles.panel}
      >
        <header className={cn('fp-header', classNames.header)} style={styles.header}>
          <span
            className="fp-avatar"
            style={avatar.color ? { background: avatar.color } : undefined}
            aria-hidden="true"
          >
            {renderIcon(avatar.icon, <IconSpark />, 'avatar_icon', 15)}
          </span>
          <div className="fp-identity">
            {properties.title ? <div className="fp-title">{properties.title}</div> : null}
            {properties.subtitle ? (
              <div className="fp-subtitle">{properties.subtitle}</div>
            ) : null}
          </div>
          {content.header ? <div className="fp-header-extra">{content.header()}</div> : null}
          <div className="fp-controls">
            {properties.expandable === false ? null : (
              <button
                type="button"
                className="fp-ctl"
                onClick={() => applyExpanded(!expanded)}
                aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
                title={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? <IconCollapse /> : <IconExpand />}
              </button>
            )}
            {properties.closable === false ? null : (
              <button
                type="button"
                className="fp-ctl"
                onClick={() => applyOpen(false)}
                aria-label="Close panel"
                title="Close"
              >
                <IconClose />
              </button>
            )}
          </div>
        </header>

        {/* Fixed band between the chrome and the content. Whatever names the
            thing in the body belongs here rather than at the top of the body,
            where it scrolls away from the content it is naming. */}
        {content.toolbar ? (
          <div className={cn('fp-toolbar', classNames.toolbar)} style={styles.toolbar}>
            {content.toolbar()}
          </div>
        ) : null}

        <div ref={bodyRef} className={cn('fp-body', classNames.body)} style={styles.body}>
          {everOpened && content.content ? content.content() : null}
        </div>

        {content.footer ? (
          <div className={cn('fp-footer', classNames.footer)} style={styles.footer}>
            {content.footer()}
          </div>
        ) : null}
      </section>

      {launcher ? (
        <button
          ref={launcherRef}
          type="button"
          className={cn('fp-launcher', classNames.launcher)}
          data-open={open ? 'true' : 'false'}
          onClick={() => applyOpen(!open)}
          aria-expanded={open ? 'true' : 'false'}
          aria-label={open ? 'Close assistant' : launcher.ariaLabel || 'Open assistant'}
          style={styles.launcher}
        >
          {launcher.label && !open ? (
            <span className="fp-launcher-label">{launcher.label}</span>
          ) : null}
          <span className="fp-launcher-icon">
            {open ? <IconChevronDown /> : renderIcon(launcher.icon, <IconBubble />, 'launcher_icon', 24)}
          </span>
          {hasBadge && !open ? <span className="fp-badge">{badge}</span> : null}
        </button>
      ) : null}
    </div>
  );
};

export default withBlockDefaults(FloatingPanel);

// FloatingPanel block meta — an Intercom-style launcher + floating panel.
//
// A container block: it owns a fixed-position launcher button and the panel
// that springs from it, and renders whatever blocks the page nests inside.
// Unlike a Drawer it never masks or reflows the page — the wrapper is
// pointer-events:none, so everything behind stays clickable while the panel is
// open. That is the whole point of it.
//
// Chrome (close, expand, collapse) is inline SVG, so no icon-registry entries
// are needed; only the launcher and avatar icons resolve through the host's
// Icon component, and both have built-in fallbacks.
export default {
  category: 'container',
  valueType: null,
  icons: [],
  slots: {
    content: 'The panel body. Scrolls; everything else in the panel is fixed chrome.',
    header: 'Optional extra content in the header row, between the title and the window controls.',
    toolbar:
      'Optional fixed band between the header and the body. For the subject of what is in the body — a record name, a filter row — anything that must not scroll away with the content it describes.',
    footer: 'Optional pinned bar along the bottom edge of the panel.',
  },
  cssKeys: {
    element: 'The fixed full-viewport wrapper (pointer-events: none).',
    panel: 'The floating panel itself.',
    header: 'The panel header row.',
    toolbar: 'The fixed band under the header.',
    body: 'The scrolling panel body.',
    footer: 'The panel footer bar.',
    launcher: 'The launcher button.',
  },
  events: {
    onOpen: 'Fired when the panel opens.',
    onClose: 'Fired when the panel closes.',
    onToggle: 'Fired on every open/close, before onOpen / onClose. _event = { open }.',
    onExpand: 'Fired when the expand/collapse control is used. _event = { expanded }.',
  },
  methods: {
    setOpen: {
      description: 'Open or close the panel. args: { open: boolean }.',
    },
    toggleOpen: {
      description: 'Toggle the panel open/closed. Same thing the launcher does.',
    },
    setExpanded: {
      description: 'Widen or restore the panel. args: { expanded: boolean }.',
    },
  },
  properties: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: {
        type: 'string',
        description: 'Panel header title. Set in the app display font when one is defined.',
      },
      subtitle: {
        type: 'string',
        description: 'Small line under the title — an identity or status line, not a sentence.',
      },
      avatar: {
        type: 'object',
        additionalProperties: false,
        description: 'Round mark left of the title.',
        properties: {
          icon: {
            type: ['string', 'object'],
            description: 'Icon name (host Icon component). Defaults to a built-in spark glyph.',
            docs: { displayType: 'icon' },
          },
          color: {
            type: 'string',
            description: 'Mark colour. Defaults to the primary colour.',
            docs: { displayType: 'color' },
          },
        },
      },
      launcher: {
        type: ['object', 'boolean'],
        default: true,
        description:
          'The launcher button, or false to hide it and drive the panel entirely with setOpen / toggleOpen.',
        properties: {
          icon: {
            type: ['string', 'object'],
            description: 'Closed-state icon. Defaults to a built-in chat glyph.',
            docs: { displayType: 'icon' },
          },
          label: {
            type: 'string',
            description:
              'Pill of text beside the launcher while the panel is closed. Hidden on narrow viewports.',
          },
          ariaLabel: {
            type: 'string',
            default: 'Open assistant',
            description: 'Accessible name for the launcher. Always set one when there is no label.',
          },
          badge: {
            type: ['number', 'string'],
            description: 'Count or dot shown on the launcher. Omit or 0 for none.',
          },
        },
      },
      width: {
        type: ['number', 'string'],
        default: 400,
        description: 'Panel width. Numbers are px.',
      },
      height: {
        type: ['number', 'string'],
        default: 620,
        description:
          'Panel height. Numbers are px. Always clamped to the viewport, so this is a maximum in practice.',
      },
      expandedWidth: {
        type: ['number', 'string'],
        default: 720,
        description: 'Panel width while expanded.',
      },
      expandable: {
        type: 'boolean',
        default: true,
        description: 'Show the expand/collapse control in the header.',
      },
      closable: {
        type: 'boolean',
        default: true,
        description: 'Show the close control in the header.',
      },
      keyboard: {
        type: 'boolean',
        default: true,
        description: 'Escape closes the panel.',
      },
      placement: {
        type: 'string',
        enum: ['bottom-right', 'bottom-left'],
        default: 'bottom-right',
        description: 'Which corner the launcher and panel anchor to.',
      },
      offset: {
        type: 'object',
        additionalProperties: false,
        description: 'Distance from the anchored corner, in px.',
        properties: {
          bottom: { type: 'number', default: 24 },
          side: { type: 'number', default: 24 },
        },
      },
      zIndex: {
        type: 'number',
        default: 1100,
        description:
          'Stacking order of the launcher and panel. The stylesheet default (1100) clears the antd popup layer.',
      },
      defaultOpen: {
        type: 'boolean',
        default: false,
        description: 'Render with the panel already open on first mount.',
      },
    },
  },
};

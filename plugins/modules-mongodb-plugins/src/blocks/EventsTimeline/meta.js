export default {
  category: "display",
  icons: [],
  styles: ["blocks/EventsTimeline/style.less"],
  cssKeys: {
    element: 'The outer EventsTimeline container.',
    timeline: 'The antd Timeline component.',
  },
  events: {
    onActionClick: {
      description: 'Triggered when an action item is clicked.',
      event: {
        action: 'The action object that was clicked.',
        event: 'The parent event object.',
      },
    },
  },
};

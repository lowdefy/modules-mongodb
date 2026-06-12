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
      description:
        'Fires with the clicked action object instead of navigating. When not wired, the block navigates via the server-resolved action.link.',
      event: {
        action: 'The action object that was clicked ({ _id, kind, status, link, message, … }).',
      },
    },
  },
};

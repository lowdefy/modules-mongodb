export default {
  category: "list",
  valueType: "array",
  icons: ["AiOutlinePlus", "AiOutlineMinusCircle", "AiOutlineDown"],
  slots: {
    content: "Blocks rendered for each list item (the row sub-form).",
  },
  events: {
    onAdd: "Triggered after a new item is added. Payload `{ index, item }`.",
    onRemove: "Triggered after an item is removed. Payload `{ index, item }`.",
    onExpand: "Triggered after a panel is expanded. Payload `{ index, item }`.",
    onCollapse:
      "Triggered after a panel is collapsed. Payload `{ index, item }`.",
  },
  cssKeys: {
    element: "The CollapsibleList element.",
    header: "The list title header.",
    item: "A collapse panel.",
    removeIcon: "The remove-item icon wrapper.",
  },
};

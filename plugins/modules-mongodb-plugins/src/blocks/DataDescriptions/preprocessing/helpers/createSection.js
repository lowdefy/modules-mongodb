function createSection(title, level, items, { isListItem = false } = {}) {
  return {
    type: "section",
    title,
    level,
    showCard: level === 0, // Only root-level sections get cards
    isListItem, // Array elements render as collapsible panels, not cards
    items,
  };
}

export default createSection;

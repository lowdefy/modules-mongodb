function createSection(title, level, items) {
  return {
    type: "section",
    title,
    level,
    showCard: level === 0, // Only root-level sections get cards
    items,
  };
}

export default createSection;

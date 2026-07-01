import createSection from "./createSection.js";

function wrapItemsInSections(items) {
  const rootSections = [];
  let currentSection = null;

  items.forEach((item) => {
    if (item.type === "field") {
      // Field at root level - wrap in section
      if (!currentSection) {
        currentSection = createSection(null, 0, []);
        rootSections.push(currentSection);
      }
      currentSection.items.push(item);
    } else if (item.type === "section") {
      // Section at root level - ensure correct level and showCard
      currentSection = null;
      rootSections.push({
        ...item,
        level: 0,
        showCard: true,
      });
    }
  });

  return rootSections;
}

export default wrapItemsInSections;

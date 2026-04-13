import React from "react";
import Card from "./Card.js";

function Section({
  title,
  level = 0,
  children,
  sectionCards = true,
  showCard = false,
}) {
  const shouldShowHeader = title != null;
  const headerClass =
    level === 0
      ? "dataview-section-header dataview-section-header-l0"
      : "dataview-section-header dataview-section-header-l1";

  const content = (
    <div className="dataview-section">
      {shouldShowHeader && <div className={headerClass}>{title}</div>}
      <div className="dataview-section-content">{children}</div>
    </div>
  );

  if (showCard && sectionCards) {
    return <Card>{content}</Card>;
  }

  return content;
}

export default Section;

function determineGridColumns(fields) {
  // ! arbitrary threshold, can be adjusted
  const thresholdCharacters = 30;
  const hasLongLabels = fields.some((field) => {
    return field.label && field.label.length > thresholdCharacters;
  });
  return hasLongLabels ? 2 : 3;
}

export default determineGridColumns;

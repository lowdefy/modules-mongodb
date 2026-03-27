import { type } from '@lowdefy/helpers';
import createSection from './createSection.js';
import createGridNode from './createGridNode.js';
import buildObjectStructure from './buildObjectStructure.js';
import wrapItemsInSections from './wrapItemsInSections.js';

function buildStructureFromData(data) {
  // Handle arrays of objects at root
  if (type.isArray(data) && data.length > 0 && type.isObject(data[0])) {
    return {
      type: 'root',
      items: data.map((item) => {
        const itemStructure = buildObjectStructure(item, 1);
        return createSection(null, 0, itemStructure);
      }),
    };
  }

  // Handle object at root
  if (type.isObject(data)) {
    const items = buildObjectStructure(data, 0);

    // Wrap items in sections for root level consistency
    const wrappedItems = wrapItemsInSections(items);

    return {
      type: 'root',
      items: wrappedItems,
    };
  }

  // Handle simple value at root
  const gridNode = createGridNode([
    {
      type: 'field',
      key: null,
      value: data,
      label: null,
    },
  ]);

  return {
    type: 'root',
    items: [createSection(null, 0, [gridNode])],
  };
}

export default buildStructureFromData;

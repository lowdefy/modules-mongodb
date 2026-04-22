import createSearchContacts from "./contactActions/searchContacts.js";
import createSetEditContact from "./contactActions/setEditContact.js";
import createGetContactsData from "./contactActions/getContactsData.js";
import createSetNewContact from "./contactActions/setNewContact.js";
import createResetContact from "./contactActions/resetContact.js";
import createAppendContact from "./contactActions/appendContact.js";

function useContactActions({ blockId, methods, properties, value }) {
  const statePrefix = (key) => {
    const formattedBlockId = blockId.replace(/\./g, "_");
    return key ? `${formattedBlockId}_${key}` : formattedBlockId;
  };

  const searchContacts = createSearchContacts({
    statePrefix,
    methods,
    properties,
  });
  const setEditContact = createSetEditContact({
    statePrefix,
    methods,
    properties,
  });
  const getContactsData = createGetContactsData({
    statePrefix,
    methods,
    value,
    properties,
  });
  const setNewContact = createSetNewContact({ statePrefix, methods });
  const resetContact = createResetContact({ statePrefix, methods });
  const appendContact = createAppendContact({ blockId, methods, properties });

  return {
    appendContact,
    searchContacts,
    setEditContact,
    setNewContact,
    getContactsData,
    resetContact,
  };
}

export default useContactActions;

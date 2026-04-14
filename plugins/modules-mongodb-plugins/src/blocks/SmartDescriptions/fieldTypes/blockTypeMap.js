// Maps Lowdefy input block types to field type registry names.
// Used in fields mode to determine which renderer to use.
// Unknown block types fall back to auto-detection from the value.

const blockTypeMap = {
  TextInput: "string",
  TextArea: "longText",
  NumberInput: "number",
  Selector: "selector",
  MultipleSelector: "selector",
  RadioSelector: "selector",
  ButtonSelector: "selector",
  CheckboxSelector: "selector",
  Switch: "boolean",
  CheckboxSwitch: "boolean",
  DateSelector: "date",
  DateTimeSelector: "datetime",
  DateRangeSelector: "dateRange",
  PhoneNumberInput: "phoneNumber",
  LocationSelector: "location",
  S3UploadButton: "fileList",
  TiptapInput: "richText",
  ContactSelectorNumberRequired: "contact",
};

export default blockTypeMap;

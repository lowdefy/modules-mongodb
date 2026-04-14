### 1. Profile Identity Header location

Profile Identity Header should be under `modules/shared/..`, not a part of the layout module.

This is a module set of interconnected modules that reference shared files.

### 2. Global and app attributes are on user session

No request needed

### 3. app_attributes are already mapped by mutliapp auth adapter

```
_get:
  key:
    _string.concat:
      - "apps."
      - _module.var: app_name
      - ".app_attributes"
  from:
    _request: get_contact.0
```

No need for this, just read `_user: app_attributes`

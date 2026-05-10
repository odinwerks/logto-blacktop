---
"@logto/connector-kit": minor
"@logto/core": minor
---

add `email`, `phone`, and `ip` as template variables in connector payloads

Connector email and SMS templates can now use `{{email}}`, `{{phone}}`, and `{{ip}}` handlebars in addition to the existing `{{code}}` and `{{link}}`. These values are populated automatically from the passcode context and require no changes to individual connectors.

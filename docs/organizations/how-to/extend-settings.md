---
title: Extending the settings pages
module: organizations
type: how-to
concepts:
  [settings-sections, general-facts, member-page-slots, invite-fields, setup-steps]
---

# Extending the settings pages

The organization's pages hold the app's own content through module vars. Each
var below has a worked example in `apps/tenant-demo/modules/organizations/vars.yaml`.
Every var is listed in [vars](../reference/vars.md).

## The app's own settings pages

Build the page on the `settings-page` component and link it from
`settings_sections`, after the organization's own section:

```yaml
# modules/organizations/vars.yaml
settings_back_title: Back to the demo
settings_back_page_id: home
settings_sections:
  - id: settings_demo
    title: Demo
    links:
      - id: team-directory # lit when the page with this id is open
        title: Team directory
        pageId: team-directory
```

```yaml
# pages/team-directory.yaml
_ref:
  module: organizations
  component: settings-page
  vars:
    id: team-directory
    title: Team directory
    group: Demo
    description: Everyone in this organization and their department.
    requests: [...]
    blocks: [...]
```

`settings_sections` is evaluated on the page, so it may be built from a request.
List those requests in `settings_requests`: every settings page loads and
fetches them. Each section reaches the layout as it is, so a layout may read
more fields on it. A link takes `pathParams` and `urlQuery` as well as `pageId`.
Pass `selected` to `settings-page` when the link's id is not the page id.

## Facts on the General page

`general_facts` adds facts after the members and pending invitations. Each
carries the request it needs:

```yaml
general_facts:
  - id: contacts
    title: Contacts
    value:
      _if_none:
        - _request: get_contact_count.0.count
        - 0
    request:
      _ref: modules/organizations/requests/get_contact_count.yaml
```

A request on a walled connection is scoped to the active organization by the
tenant wall.

## The member page

- `member_page_blocks`: blocks above the danger zone in the side column. The
  person's user id is in state as `user_id`.
- `member_page_requests`: requests the page loads and fetches for those blocks.
  They can read the person's id from the page's `?user_id=` query.
- `member_page_on_mount`: actions the page runs on mount after its own
  requests, for blocks that load through actions.
- `remove_confirmation_note` and `leave_confirmation_note`: the app's line under
  the module's text in the remove and leave confirmations, for what else the
  person loses. Both are evaluated on the page.

## Invite fields

`invite_fields` adds input blocks to the invite form after the app roles. Their
ids sit under `invite.attributes.`:

```yaml
invite_fields:
  - id: invite.attributes.department
    type: TextInput
    properties:
      title: Department
```

The values travel with the invitation, and the engine copies them onto the
member row when it is accepted. Read them back with `member-join`'s `project`
var (`department: "$attributes.department"`).

## Setup steps

`setup_steps` adds the app's steps before the logo and invite steps on the
setup page, numbered from 1. Build each with the `setup-step` component; a step
marks itself done by setting `setup_status.<id>` to the line to show. Its
requests go in `setup_requests`.

```yaml
setup_steps:
  - _ref:
      module: organizations
      component: setup-step
      vars:
        id: welcome
        number: 1
        title: Read the welcome
        description: Each card on the home page opens a working demo of one module.
        blocks:
          - id: setup_welcome_done
            type: Button
            properties:
              title: Done
            events:
              onClick:
                - id: set_welcome_done
                  type: SetState
                  params:
                    setup_status.welcome: Welcome read
```

Skip moves on without setting a line. Nothing forces setup: General and
Members do the same things later.

## Creating organizations

`allow_create_organization: true` adds the create page and endpoint. The
creator becomes the owner and gets the app roles in `creator_app_roles`. The
create page hands off through `switch-organization` to setup. The
my-organizations page shows Create, with `my_organizations_note` as the app's
line under its list.

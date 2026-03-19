/*
  Copyright 2020-2026 Lowdefy, Inc

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import React, { useState, useEffect } from "react";
import { blockDefaultProps } from "@lowdefy/block-utils";
import { mergeObjects, get } from "@lowdefy/helpers";

import Button from "@lowdefy/blocks-antd/blocks/Button/Button.js";
import Menu from "@lowdefy/blocks-antd/blocks/Menu/Menu.js";

import Drawer from "../Drawer/Drawer.js";

const MobileMenu = ({
  basePath,
  blockId,
  components: { Icon, Link },
  events,
  methods,
  menus,
  pageId,
  properties,
  rename,
  content,
}) => {
  const [openState, setOpen] = useState(false);
  useEffect(() => {
    methods.registerMethod(
      get(rename, "methods.toggleOpen", { default: "toggleOpen" }),
      () => {
        methods._setOpen({ open: !openState });
        setOpen(!openState);
      },
    );
    methods.registerMethod(
      get(rename, "methods.setOpen", { default: "setOpen" }),
      ({ open }) => {
        methods._setOpen({ open });
        setOpen(open);
      },
    );
  });
  return (
    <div id={blockId}>
      <Button
        blockId={`${blockId}_button`}
        components={{ Icon, Link }}
        events={events}
        properties={{
          hideTitle: true,
          type: "primary",
          icon: {
            name: openState ? "AiOutlineMenuUnfold" : "AiOutlineMenuFold",
          },
          ...(properties.toggleMenuButton || {}),
        }}
        methods={methods}
        onClick={() =>
          methods[
            get(rename, "methods.toggleOpen", { default: "toggleOpen" })
          ]()
        }
        rename={{
          events: {
            onClick: "onToggleDrawer",
          },
        }}
      />
      <Drawer
        blockId={`${blockId}_drawer`}
        components={{ Icon, Link }}
        properties={mergeObjects([
          {
            bodyStyle: {
              display: "flex",
              flexDirection: "column",
              padding: "0 0 0 0",
            },
            width: "100%",
            placement: "right",
            className: "ldf-mobile-menu-drawer",
          },
          properties.drawer,
        ])}
        rename={{
          events: {
            onToggle: "onToggleDrawer",
          },
          methods: {
            setOpen: "_setOpen",
            toggleOpen: "_toggleOpen",
          },
        }}
        methods={methods}
        onClose={() =>
          methods[
            get(rename, "methods.toggleOpen", { default: "toggleOpen" })
          ]()
        }
        content={{
          extra: () => (
            <div style={{ flex: "1 0 auto" }}>
              <Link home={true}>
                <img
                  src={
                    properties.logo?.srcMobile ??
                    properties.logo?.src ??
                    `${basePath}/logo-square-${properties.header?.theme ?? "dark"}-theme.png`
                  }
                  alt={properties.logo?.alt ?? "Lowdefy"}
                  className={methods.makeCssClass([properties.logo?.style])}
                />
              </Link>
            </div>
          ),
          content: () => (
            <>
              <Menu
                basePath={basePath}
                components={{ Icon, Link }}
                blockId={`${blockId}_menu`}
                methods={methods}
                events={events}
                menus={menus}
                pageId={pageId}
                properties={{
                  collapsed: false,
                  theme: "light",
                  ...(mergeObjects(properties, { style: { marginTop: 24 } }) ||
                    {}),
                  mode: "inline",
                }}
                rename={{
                  events: {
                    onClick: "onMenuItemClick",
                    onSelect: "onMenuItemSelect",
                  },
                }}
              />
              {content.mobileDrawerContent && content.mobileDrawerContent()}
            </>
          ),
          footer: () => (
            <>{content.mobileDrawerFooter && content.mobileDrawerFooter()}</>
          ),
        }}
      />
    </div>
  );
};

MobileMenu.defaultProps = blockDefaultProps;
MobileMenu.meta = {
  category: "display",
  icons: ["AiOutlineMenuUnfold", "AiOutlineMenuFold"],
  styles: ["blocks/MobileMenu/style.less"],
};

export default MobileMenu;

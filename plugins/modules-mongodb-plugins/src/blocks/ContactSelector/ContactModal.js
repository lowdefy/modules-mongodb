import React, { useEffect, useState } from "react";
import { get } from "@lowdefy/helpers";
import { renderHtml } from "@lowdefy/block-utils";
import { Modal } from "antd";

const ContactModal = ({
  blockId,
  content,
  events,
  methods,
  properties,
  modal: { edit, isOpen, toggleModal },
  contactActions: { getContactsData },
}) => {
  const extraProps = {};
  if (content.footer) {
    extraProps.footer = content.footer();
  }
  if (properties?.footer === false) {
    extraProps.footer = null;
  }
  const [modalTitle, setModalTitle] = useState(
    properties?.title ?? "Add Contact",
  );
  const [okTitle, setOkTitle] = useState(properties?.okText ?? "Add Contact");

  useEffect(() => {
    if (edit) {
      setModalTitle(properties?.editTitle ?? "Edit Contact");
      setOkTitle(properties?.okText ?? "Save Contact");
    } else {
      setModalTitle(properties?.title ?? "Add Contact");
      setOkTitle(properties?.okText ?? "Add Contact");
    }
  }, [edit]);

  return (
    <div id={blockId}>
      <Modal
        id={`${blockId}_modal`}
        afterClose={() => methods.triggerEvent({ name: "afterClose" })}
        bodyStyle={methods.makeCssClass(properties?.bodyStyle, true)}
        cancelButtonProps={properties?.cancelButtonProps}
        cancelText={properties?.cancelText ?? "Cancel"}
        centered={!!properties?.centered}
        closable={
          properties?.closable !== undefined ? properties?.closable : true
        }
        confirmLoading={get(
          events,
          edit ? "onEditContact.loading" : "onAddContact.loading",
        )}
        mask={properties?.mask !== undefined ? properties?.mask : true}
        maskClosable={
          properties?.maskClosable !== undefined
            ? properties?.maskClosable
            : true
        }
        maskStyle={methods.makeCssClass(properties?.maskStyle, true)}
        okButtonProps={properties?.okButtonProps}
        okText={okTitle}
        style={properties?.style}
        title={renderHtml({ html: modalTitle, methods })}
        open={isOpen}
        zIndex={properties?.zIndex}
        onOk={async () => {
          const response = await methods.triggerEvent({
            name: edit ? "onEditContact" : "onAddContact",
          });
          if (response.success === false) return;
          if (response.bounced !== true) {
            if (edit) getContactsData();
            toggleModal();
          }
        }}
        onCancel={async () => {
          const response = await methods.triggerEvent({ name: "onCancel" });
          if (response.success === false) return;
          if (response.bounced !== true) {
            toggleModal();
          }
        }}
        {...extraProps}
      >
        {content.content && content.content()}
      </Modal>
    </div>
  );
};

export default ContactModal;

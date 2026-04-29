import React, { useEffect, useState } from "react";
import { Modal } from "antd";
import { get } from "@lowdefy/helpers";
import { renderHtml } from "@lowdefy/block-utils";

const ContactModal = ({
  blockId,
  classNames = {},
  styles = {},
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
    <div id={blockId} className={classNames.element} style={styles.element}>
      <Modal
        id={`${blockId}_modal`}
        afterClose={() => methods.triggerEvent({ name: "afterClose" })}
        cancelButtonProps={properties?.cancelButtonProps}
        cancelText={properties?.cancelText ?? "Cancel"}
        centered={!!properties?.centered}
        closable={properties?.closable ?? true}
        confirmLoading={get(
          events,
          edit ? "onEditContact.loading" : "onAddContact.loading",
        )}
        mask={properties?.mask ?? true}
        maskClosable={properties?.maskClosable ?? true}
        styles={{
          body: properties?.bodyStyle,
          mask: properties?.maskStyle,
        }}
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

import React, { useMemo } from "react";
import DOMPurify from "dompurify";

const HtmlComponent = React.memo(
  ({ div, domPurifyOptions, events, html, id, methods, onClick, style }) => {
    const memoizedHtml = useMemo(
      () => DOMPurify.sanitize(html?.toString() ?? "", domPurifyOptions ?? {}),
      [html],
    );

    if (memoizedHtml === "") return undefined;

    const onTextSelection = () => {
      if (events?.onTextSelection) {
        const selection = window.getSelection().toString();
        if (selection !== "") {
          methods.triggerEvent({
            name: "onTextSelection",
            event: { selection },
          });
        }
      }
    };

    const childProps = {
      "data-testid": id,
      style: {
        outline: "none",
        cursor: onClick || events?.onClick ? "pointer" : undefined,
        ...style,
      },
      dangerouslySetInnerHTML: { __html: memoizedHtml },
      id,
      onClick,
      onTextSelection,
    };
    if (div === true) {
      return <div {...childProps} />;
    }
    return <span {...childProps} />;
  },
);

export default HtmlComponent;

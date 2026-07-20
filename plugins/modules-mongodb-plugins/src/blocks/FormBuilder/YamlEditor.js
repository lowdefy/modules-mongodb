import React, { useEffect, useState } from "react";
import YAML from "yaml";
import { Input } from "antd";

const YamlEditor = ({ block, update }) => {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editing) return;
    setText(YAML.stringify(block).replace(/\n$/, ""));
  }, [block, editing]);

  const commit = () => {
    setEditing(false);
    try {
      const parsed = YAML.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("Block config must be a YAML object.");
        return;
      }
      setError(null);
      update(parsed);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="fb-yaml-editor">
      <Input.TextArea
        className="fb-mono"
        autoSize={{ minRows: 6, maxRows: 16 }}
        value={text}
        status={error ? "error" : undefined}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {error ? <div className="fb-field-error">{error}</div> : null}
    </div>
  );
};

export default YamlEditor;

import React from "react";
import { Card as AntCard } from "antd";

function Card({ children }) {
  return <AntCard className="dataview-card">{children}</AntCard>;
}

export default Card;

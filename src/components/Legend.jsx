import React from "react";
import { areaByOwner } from "../model/document.js";
import { formatArea } from "../model/geometry.js";

/** Owner colours and areas — shown on the canvas and composed into every export. */
export default function Legend({ doc, colorMode }) {
  const { totals, unassigned, calibrated } = areaByOwner(doc);
  const rows = doc.owners.filter((o) => (totals.get(o.id) || 0) > 0 || colorMode === "owner");
  if (!rows.length && !unassigned) return null;

  return (
    <aside className="legend">
      <h4>Legend</h4>
      {rows.map((o) => (
        <div key={o.id} className="legendRow">
          <span className="legendSwatch" style={{ background: o.color }} />
          <span className="legendName">{o.name}</span>
          <span className="legendArea">{calibrated ? formatArea(totals.get(o.id) || 0) : ""}</span>
        </div>
      ))}
      {unassigned > 0 && (
        <div className="legendRow">
          <span className="legendSwatch" style={{ background: "#e9edf1" }} />
          <span className="legendName">Unassigned</span>
          <span className="legendArea">{calibrated ? formatArea(unassigned) : ""}</span>
        </div>
      )}
    </aside>
  );
}

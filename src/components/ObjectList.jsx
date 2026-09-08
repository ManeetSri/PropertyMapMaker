import React from "react";
import { TYPE_LABELS } from "../model/objects.js";

/**
 * Every object on the map, topmost first. This is how a locked or off-screen
 * object stays reachable — nothing can get "lost" on the canvas any more.
 */
export default function ObjectList({ objects, selectedIds, onSelect, onToggleVisible, onToggleLock }) {
  const selected = new Set(selectedIds);
  return (
    <section className="panelSection">
      <div className="panelHead">
        <h3>Objects <span className="badge">{objects.length}</span></h3>
      </div>
      <ul className="objectList">
        {[...objects].reverse().map((o) => (
          <li key={o.id} className={selected.has(o.id) ? "selected" : ""}>
            <button className="rowMain" onClick={(e) => onSelect(o.id, e.shiftKey || e.metaKey || e.ctrlKey)}>
              <span className="rowType">{TYPE_LABELS[o.type] || o.type}</span>
              <span className="rowLabel">{o.label || "(no label)"}</span>
            </button>
            <button className="iconBtn" title={o.visible ? "Hide" : "Show"} onClick={() => onToggleVisible(o.id)}>
              {o.visible ? "👁" : "🚫"}
            </button>
            <button className="iconBtn" title={o.locked ? "Unlock" : "Lock"} onClick={() => onToggleLock(o.id)}>
              {o.locked ? "🔒" : "🔓"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

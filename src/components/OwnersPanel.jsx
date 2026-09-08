import React from "react";
import { areaByOwner } from "../model/document.js";
import { formatArea } from "../model/geometry.js";

/**
 * Who owns what, and how much of the plot that is. Areas only appear once the
 * map has a scale — an uncalibrated map reports no square feet rather than
 * inventing them.
 */
export default function OwnersPanel({
  doc,
  selectedIds,
  colorMode,
  onToggleColorMode,
  onUpdate,
  onAdd,
  onRemove,
  onAssign
}) {
  const { totals, unassigned, calibrated } = areaByOwner(doc);
  const grand = [...totals.values()].reduce((a, b) => a + b, 0) + unassigned;
  const pct = (v) => (grand > 0 ? `${Math.round((v / grand) * 100)}%` : "—");

  return (
    <section className="panelSection">
      <div className="panelHead">
        <h3>Owners <span className="badge">{doc.owners.length}</span></h3>
        <button className={colorMode === "owner" ? "active" : ""} onClick={onToggleColorMode}>
          {colorMode === "owner" ? "Colour: owner" : "Colour: natural"}
        </button>
      </div>

      {!calibrated && (
        <p className="warn">No scale set yet — set one in the Scale tab to see areas in square feet.</p>
      )}

      <ul className="rowList">
        {doc.owners.map((o) => (
          <li key={o.id}>
            <input
              type="color"
              className="swatch"
              value={o.color}
              title="Owner colour"
              onChange={(e) => onUpdate(o.id, { color: e.target.value })}
            />
            <input
              className="rowInput"
              value={o.name}
              onChange={(e) => onUpdate(o.id, { name: e.target.value })}
            />
            <span className="rowType">
              {calibrated ? formatArea(totals.get(o.id) || 0) : "—"} · {pct(totals.get(o.id) || 0)}
            </span>
            <button
              className="iconBtn"
              title={selectedIds.length ? `Assign ${selectedIds.length} selected` : "Select objects first"}
              disabled={!selectedIds.length}
              onClick={() => onAssign(o.id)}
            >
              ⤵
            </button>
            <button className="iconBtn danger" title="Remove owner" onClick={() => onRemove(o.id)}>✕</button>
          </li>
        ))}
      </ul>

      <div className="totalRow">
        <span>Unassigned</span>
        <span>{calibrated ? formatArea(unassigned) : "—"} · {pct(unassigned)}</span>
      </div>
      <div className="totalRow strong">
        <span>Total</span>
        <span>{calibrated ? formatArea(grand) : "—"}</span>
      </div>

      <div className="btnRow">
        <button onClick={onAdd}>＋ Add owner</button>
        <button disabled={!selectedIds.length} onClick={() => onAssign(null)}>Clear on selection</button>
      </div>
    </section>
  );
}

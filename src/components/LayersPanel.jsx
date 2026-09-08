import React from "react";

/**
 * Layers are the coarse control: hide the dimensions while arranging rooms,
 * lock the boundary so it can never be nudged. A layer's flags fold into every
 * object on it (see effectiveFlags in model/document.js).
 */
export default function LayersPanel({ doc, selectedIds, onUpdate, onMove, onSelectLayer, onAssignLayer }) {
  const counts = new Map();
  for (const o of doc.objects) counts.set(o.layer, (counts.get(o.layer) || 0) + 1);

  return (
    <section className="panelSection">
      <div className="panelHead">
        <h3>Layers <span className="badge">{doc.layers.length}</span></h3>
      </div>
      <p className="muted">Listed bottom to top — the last layer draws over the others.</p>

      <ul className="rowList">
        {doc.layers.map((l, i) => (
          <li key={l.id}>
            <button className="rowMain" onClick={() => onSelectLayer(l.id)} title="Select everything on this layer">
              <span className="rowLabel">{l.name}</span>
              <span className="rowType">{counts.get(l.id) || 0}</span>
            </button>
            <button className="iconBtn" title="Move down" disabled={i === 0} onClick={() => onMove(l.id, -1)}>↓</button>
            <button className="iconBtn" title="Move up" disabled={i === doc.layers.length - 1} onClick={() => onMove(l.id, 1)}>↑</button>
            <button className="iconBtn" title={l.visible ? "Hide layer" : "Show layer"} onClick={() => onUpdate(l.id, { visible: !l.visible })}>
              {l.visible ? "👁" : "🚫"}
            </button>
            <button className="iconBtn" title={l.locked ? "Unlock layer" : "Lock layer"} onClick={() => onUpdate(l.id, { locked: !l.locked })}>
              {l.locked ? "🔒" : "🔓"}
            </button>
          </li>
        ))}
      </ul>

      {selectedIds.length > 0 && (
        <label className="field">
          <span>Move {selectedIds.length} selected to</span>
          <select defaultValue="" onChange={(e) => e.target.value && onAssignLayer(e.target.value)}>
            <option value="">Choose a layer…</option>
            {doc.layers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

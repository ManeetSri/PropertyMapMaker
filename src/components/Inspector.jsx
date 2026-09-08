import React from "react";
import NumberField from "./NumberField.jsx";
import { CAPS, MIN_FONT, MIN_SIZE, TYPE_LABELS, areaOf, dimensionLength } from "../model/objects.js";
import { formatArea, formatFeet, round, toFeet, toSquareFeet } from "../model/geometry.js";

export default function Inspector({
  doc,
  selected,
  count,
  onPatch,
  onZOrder,
  onToggleLock,
  onDuplicate,
  onDelete,
  onAssignOwner,
  onAnchor,
  onClose
}) {
  if (!selected) {
    return (
      <section className="panelSection">
        <div className="panelHead"><h3>Selection</h3></div>
        <p className="muted">Nothing selected. Click a section on the map, or pick one from the list below.</p>
      </section>
    );
  }

  const caps = CAPS[selected.type] || {};
  const upf = doc.scale.unitsPerFoot;
  const notation = doc.scale.feetNotation;
  const area = areaOf(selected);

  return (
    <section className="panelSection">
      <div className="panelHead">
        <h3>
          {TYPE_LABELS[selected.type] || selected.type}
          {count > 1 ? <span className="badge">{count} selected</span> : null}
        </h3>
        <button className="iconBtn" onClick={onClose} title="Deselect">✕</button>
      </div>

      {/* Real-world readout first: this is a property document, not a drawing. */}
      {upf && (caps.size || caps.area) ? (
        <div className="readout">
          {caps.size && (
            <span>
              {formatFeet(toFeet(selected.w, upf), notation)} × {formatFeet(toFeet(selected.h, upf), notation)}
            </span>
          )}
          {area > 0 && <strong>{formatArea(toSquareFeet(area, upf))}</strong>}
        </div>
      ) : null}
      {!upf && (caps.size || caps.area) ? (
        <p className="warn">No scale set — see the Scale tab for real sizes and areas.</p>
      ) : null}

      <label className="field">
        <span>Label</span>
        <input
          value={selected.label}
          placeholder="Label"
          onChange={(e) => onPatch({ label: e.target.value }, { coalesceKey: "label:" + selected.id })}
        />
      </label>

      {(selected.type === "rect" || selected.type === "polygon") && (
        <label className="checkRow">
          <input type="checkbox" checked={selected.showLabel} onChange={(e) => onPatch({ showLabel: e.target.checked })} />
          <span>Draw label on the shape</span>
        </label>
      )}

      <div className="fieldRow">
        <label className="field">
          <span>Owner</span>
          <select value={selected.owner || ""} onChange={(e) => onAssignOwner(e.target.value || null)}>
            <option value="">Unassigned</option>
            {doc.owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Layer</span>
          <select value={selected.layer} onChange={(e) => onPatch({ layer: e.target.value })}>
            {doc.layers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
      </div>

      {selected.type === "dimension" && (
        <>
          <div className="readout">
            <span>Drawn {upf ? formatFeet(toFeet(dimensionLength(selected), upf), notation) : `${Math.round(dimensionLength(selected))} units`}</span>
          </div>
          <NumberField
            label="Surveyed length (ft)"
            value={selected.realFt || 0}
            min={0}
            step={0.1}
            onCommit={(realFt) => onPatch({ realFt: realFt > 0 ? realFt : null })}
          />
          <NumberField label="Offset" value={selected.offset} onCommit={(offset) => onPatch({ offset })} />
          <label className="checkRow">
            <input
              type="checkbox"
              checked={!!selected.manualLabel}
              onChange={(e) => onPatch({ manualLabel: e.target.checked })}
            />
            <span>Override auto label</span>
          </label>
          {selected.manualLabel && (
            <p className="muted">The Label field above is drawn as-is instead of the measured length.</p>
          )}
          <label className="field">
            <span>Follow object edge</span>
            <select
              value={selected.anchor ? selected.anchor.objectId : ""}
              onChange={(e) => onAnchor && onAnchor(e.target.value || null, (selected.anchor && selected.anchor.edge) || "bottom")}
            >
              <option value="">Not attached</option>
              {doc.objects
                .filter((o) => o.id !== selected.id && o.id !== "bg-sheet" && (o.w || o.type === "polygon"))
                .map((o) => (
                  <option key={o.id} value={o.id}>{o.label || o.id}</option>
                ))}
            </select>
          </label>
          {selected.anchor && (
            <label className="field">
              <span>Edge</span>
              <select
                value={selected.anchor.edge}
                onChange={(e) => onAnchor && onAnchor(selected.anchor.objectId, e.target.value)}
              >
                <option value="top">Top</option>
                <option value="right">Right</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
              </select>
            </label>
          )}
        </>
      )}

      <div className="fieldRow">
        <NumberField label="X" value={selected.x} onCommit={(x) => onPatch({ x })} />
        <NumberField label="Y" value={selected.y} onCommit={(y) => onPatch({ y })} />
      </div>

      {caps.size && (
        <>
          <div className="fieldRow">
            <NumberField label="Width" value={selected.w} min={MIN_SIZE} onCommit={(w) => onPatch({ w })} />
            <NumberField label="Height" value={selected.h} min={MIN_SIZE} onCommit={(h) => onPatch({ h })} />
          </div>
          {upf && (
            <div className="fieldRow">
              <NumberField
                label="Width (ft)"
                value={round(toFeet(selected.w, upf), 2)}
                min={0.1}
                step={0.1}
                onCommit={(ft) => onPatch({ w: ft * upf })}
              />
              <NumberField
                label="Height (ft)"
                value={round(toFeet(selected.h, upf), 2)}
                min={0.1}
                step={0.1}
                onCommit={(ft) => onPatch({ h: ft * upf })}
              />
            </div>
          )}
        </>
      )}

      <div className="fieldRow">
        {caps.rotate && (
          <NumberField label="Rotation°" value={selected.rotation} onCommit={(rotation) => onPatch({ rotation })} />
        )}
        {caps.fontSize && (
          <NumberField label="Font Size" value={selected.fontSize} min={MIN_FONT} onCommit={(fontSize) => onPatch({ fontSize })} />
        )}
      </div>

      {caps.fill && (
        <label className="field">
          <span>Fill</span>
          <input
            type="color"
            value={selected.fill}
            onChange={(e) => onPatch({ fill: e.target.value }, { coalesceKey: "fill:" + selected.id })}
          />
        </label>
      )}

      {caps.stroke && (
        <>
          <label className="field">
            <span>Border colour</span>
            <input
              type="color"
              value={selected.stroke}
              onChange={(e) => onPatch({ stroke: e.target.value }, { coalesceKey: "stroke:" + selected.id })}
            />
          </label>
          <NumberField
            label="Border width"
            value={selected.strokeWidth}
            min={selected.type === "line" || selected.type === "dimension" ? 1 : 0}
            onCommit={(strokeWidth) => onPatch({ strokeWidth })}
          />
        </>
      )}

      {selected.type === "line" && (
        <label className="checkRow">
          <input type="checkbox" checked={selected.dash} onChange={(e) => onPatch({ dash: e.target.checked })} />
          <span>Dashed</span>
        </label>
      )}

      {caps.opacity && (
        <label className="field">
          <span>Opacity — {Math.round(selected.opacity * 100)}%</span>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={selected.opacity}
            onChange={(e) => onPatch({ opacity: +e.target.value }, { coalesceKey: "opacity:" + selected.id })}
          />
        </label>
      )}

      <div className="btnRow">
        <button onClick={() => onZOrder("front")} title="Bring to front">⤒ Front</button>
        <button onClick={() => onZOrder("forward")}>↑</button>
        <button onClick={() => onZOrder("backward")}>↓</button>
        <button onClick={() => onZOrder("back")} title="Send to back">⤓ Back</button>
      </div>

      <div className="btnRow">
        <button onClick={onToggleLock}>{selected.locked ? "🔓 Unlock" : "🔒 Lock"}</button>
        <button onClick={onDuplicate}>⧉ Duplicate</button>
        <button className="danger" onClick={onDelete}>🗑 Delete</button>
      </div>

      {caps.vertices && <p className="muted">Selected: drag the round handles to reshape. Double-click an edge to add a point, Alt-click a point to remove it.</p>}
    </section>
  );
}

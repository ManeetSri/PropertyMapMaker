import React from "react";

const ADD_BUTTONS = [
  ["rect", "＋ Block"],
  ["text", "T Text"],
  ["line", "╱ Marking"],
  ["tree", "🌳 Tree"],
  ["table", "🪑 Table"],
  ["wall", "🧱 Wall"],
  ["temple", "🛕 Temple"]
];

const TOOLS = [
  ["select", "↖ Select", "Select, move and resize"],
  ["polygon", "⬠ Section", "Click each corner of an irregular section"],
  ["freehand", "✎ Freehand", "Trace an outline freehand"],
  ["dimension", "⟷ Measure", "Drag out a dimension that labels itself"]
];

export default function Toolbar({
  tool,
  onTool,
  onAdd,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  onExportJSON,
  onExportPNG,
  onExportPDF,
  onImport,
  onReset,
  onDelete,
  onDuplicate,
  hasSelection,
  snapEnabled,
  onToggleSnap,
  gridEnabled,
  onToggleGrid,
  colorMode,
  onToggleColorMode,
  saveStatus
}) {
  return (
    <header className="toolbar">
      <div className="group">
        {TOOLS.map(([id, label, title]) => (
          <button key={id} className={tool === id ? "active" : ""} title={title} onClick={() => onTool(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="group">
        {ADD_BUTTONS.map(([type, label]) => (
          <button key={type} onClick={() => onAdd(type)} title={"Add " + label.replace(/^\S+\s/, "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="group">
        <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">↺</button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">↻</button>
        <button onClick={onDuplicate} disabled={!hasSelection} title="Duplicate (Ctrl/Cmd+D)">⧉</button>
        <button className="danger" onClick={onDelete} disabled={!hasSelection} title="Delete (Del)">🗑</button>
      </div>

      <div className="group">
        <button onClick={onZoomOut} title="Zoom out">−</button>
        <span className="zoomText">{Math.round(zoom * 100)}%</span>
        <button onClick={onZoomIn} title="Zoom in">＋</button>
        <button onClick={onFit} title="Fit the whole map in view">Fit</button>
        <button onClick={onResetView} title="Back to 90%">Reset View</button>
      </div>

      <div className="group">
        <button className={snapEnabled ? "active" : ""} onClick={onToggleSnap} title="Snap to edges, centres and vertices; hold Shift while rotating for free angles">
          ⇥ Snap
        </button>
        <button className={gridEnabled ? "active" : ""} onClick={onToggleGrid} title="Show and snap to a grid">
          ▦ Grid
        </button>
        <button className={colorMode === "owner" ? "active" : ""} onClick={onToggleColorMode} title="Colour every section by its owner">
          🎨 By owner
        </button>
      </div>

      <div className="group">
        <button onClick={onSave} title="Flush to browser storage now">Save</button>
        <button onClick={onExportPNG} title="Image of the whole map with legend and scale bar">PNG</button>
        <button onClick={onExportPDF} title="Printable PDF at true scale">PDF</button>
        <button onClick={onExportJSON}>JSON</button>
        <label className="fileBtn">
          Import
          <input type="file" accept=".json,application/json" onChange={onImport} />
        </label>
        <button className="danger" onClick={onReset} title="Discard the saved map and start from the original layout">Reset</button>
      </div>

      <div className="saveStatus">{saveStatus}</div>
    </header>
  );
}

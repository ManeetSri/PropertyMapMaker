import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Toolbar from "./components/Toolbar.jsx";
import Canvas from "./components/Canvas.jsx";
import Inspector from "./components/Inspector.jsx";
import ObjectList from "./components/ObjectList.jsx";
import LayersPanel from "./components/LayersPanel.jsx";
import OwnersPanel from "./components/OwnersPanel.jsx";
import ScalePanel from "./components/ScalePanel.jsx";
import UnsquashDialog from "./components/UnsquashDialog.jsx";
import Legend from "./components/Legend.jsx";
import { useHistory } from "./hooks/useHistory.js";
import { makeObject, uid } from "./model/objects.js";
import {
  defaultDocument,
  effectiveFlags,
  orderedObjects
} from "./model/document.js";
import {
  backupDocument,
  clearSaved,
  exportDocument,
  loadDocument,
  parseImport,
  saveDocument
} from "./model/storage.js";
import { applyAnchors, documentExtent, guessOwners, placeDimensionOnEdge, planUnsquash } from "./model/transforms.js";
import { exportPNG, exportPDF } from "./export/exportMap.js";
import { exportFamilyPage } from "./export/exportViewer.js";

const GRID_SIZE = 10;
const AUTOSAVE_MS = 500;
const PANELS = [
  ["inspector", "Selection"],
  ["layers", "Layers"],
  ["owners", "Owners"],
  ["scale", "Scale"]
];

export default function App() {
  // Read storage during the initial render instead of overwriting state from a
  // mount effect, so nothing ever flashes the defaults over a saved map.
  const { present: doc, commit, undo, redo, reset, canUndo, canRedo } = useHistory(
    () => loadDocument() || defaultDocument()
  );
  const [selectedIds, setSelectedIds] = useState([]);
  const [view, setView] = useState({ x: 20, y: 20, zoom: 0.9 });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPx, setSnapPx] = useState(6);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [colorMode, setColorMode] = useState("natural");
  const [tool, setTool] = useState("select");
  const [panel, setPanel] = useState("inspector");
  const [panelOpen, setPanelOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [unsquash, setUnsquash] = useState(null);
  const [pdfOpts, setPdfOpts] = useState(null);
  const stageRef = useRef({});
  const firstRun = useRef(true);

  const byId = useMemo(() => new Map(doc.objects.map((o) => [o.id, o])), [doc.objects]);
  const rendered = useMemo(() => orderedObjects(doc), [doc]);
  const flagsById = useMemo(() => {
    const m = new Map();
    for (const o of doc.objects) m.set(o.id, effectiveFlags(doc, o));
    return m;
  }, [doc]);
  const ownerColors = useMemo(
    () => new Map(doc.owners.map((o) => [o.id, o.color])),
    [doc.owners]
  );
  const primary = selectedIds.length ? byId.get(selectedIds[selectedIds.length - 1]) : null;

  const flash = useCallback((text, ms = 1800) => {
    setStatus(text);
    if (ms) setTimeout(() => setStatus((s) => (s === text ? "" : s)), ms);
  }, []);

  // ---- Autosave -----------------------------------------------------------
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      const res = saveDocument(doc);
      if (res.ok) flash("Saved", 1400);
      else setStatus(res.error);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, flash]);

  // ---- Commit helpers -----------------------------------------------------
  const commitObjects = useCallback(
    (fn, opts) =>
      commit((d) => ({ ...d, objects: applyAnchors(fn(d.objects)) }), opts),
    [commit]
  );

  const patchSelected = useCallback(
    (patch, opts) => {
      // A label belongs to one object; styling can apply across a selection.
      const ids = "label" in patch || "showLabel" in patch ? selectedIds.slice(-1) : selectedIds;
      const set = new Set(ids);
      commitObjects((prev) => prev.map((o) => (set.has(o.id) ? { ...o, ...patch } : o)), opts);
    },
    [commitObjects, selectedIds]
  );

  /** Centre of what is currently on screen, in world coordinates. */
  const viewCenter = useCallback(() => {
    const size = stageRef.current.size || { width: 800, height: 600 };
    return {
      x: (size.width / 2 - view.x) / view.zoom,
      y: (size.height / 2 - view.y) / view.zoom
    };
  }, [view]);

  const addObject = useCallback(
    (type) => {
      let center = viewCenter();
      // Cascade so repeated adds never land pixel-identical on top of each other.
      const near = (p) => doc.objects.some((o) => Math.abs(o.x - p.x) < 4 && Math.abs(o.y - p.y) < 4);
      let guard = 0;
      let obj = makeObject(type, center);
      while (near(obj) && guard++ < 40) {
        center = { x: center.x + 24, y: center.y + 24 };
        obj = makeObject(type, center);
      }
      commitObjects((prev) => [...prev, obj]);
      setSelectedIds([obj.id]);
    },
    [commitObjects, doc.objects, viewCenter]
  );

  /** Objects produced by the drawing tools arrive already positioned. */
  const addDrawn = useCallback(
    (obj) => {
      commitObjects((prev) => [...prev, obj]);
      setSelectedIds([obj.id]);
      setTool("select");
    },
    [commitObjects]
  );

  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const set = new Set(selectedIds);
    const copies = doc.objects
      .filter((o) => set.has(o.id))
      .map((o) => ({
        ...o,
        id: uid(),
        x: o.x + 20,
        y: o.y + 20,
        points: o.points ? [...o.points] : undefined,
        locked: false
      }));
    commitObjects((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }, [commitObjects, doc.objects, selectedIds]);

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const set = new Set(selectedIds);
    commitObjects((prev) => prev.filter((o) => !set.has(o.id)));
    setSelectedIds([]);
  }, [commitObjects, selectedIds]);

  const nudge = useCallback(
    (dx, dy) => {
      if (!selectedIds.length) return;
      const set = new Set(selectedIds);
      commitObjects(
        (prev) =>
          prev.map((o) =>
            set.has(o.id) && !flagsById.get(o.id).locked ? { ...o, x: o.x + dx, y: o.y + dy } : o
          ),
        { coalesceKey: "nudge" }
      );
    },
    [commitObjects, selectedIds, flagsById]
  );

  const changeZOrder = useCallback(
    (mode) => {
      const set = new Set(selectedIds);
      commitObjects((prev) => {
        const moving = prev.filter((o) => set.has(o.id));
        const rest = prev.filter((o) => !set.has(o.id));
        if (!moving.length) return prev;
        if (mode === "front") return [...rest, ...moving];
        if (mode === "back") return [...moving, ...rest];
        const next = [...prev];
        const indexes = next.map((o, i) => (set.has(o.id) ? i : -1)).filter((i) => i >= 0);
        const ordered = mode === "forward" ? indexes.reverse() : indexes;
        for (const i of ordered) {
          const target = mode === "forward" ? i + 1 : i - 1;
          if (target < 0 || target >= next.length || set.has(next[target].id)) continue;
          [next[i], next[target]] = [next[target], next[i]];
        }
        return next;
      });
    },
    [commitObjects, selectedIds]
  );

  const toggleFlag = useCallback(
    (id, key) => commitObjects((prev) => prev.map((o) => (o.id === id ? { ...o, [key]: !o[key] } : o))),
    [commitObjects]
  );

  // ---- Layers & owners ----------------------------------------------------
  const updateLayer = useCallback(
    (id, patch) =>
      commit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    [commit]
  );

  const moveLayer = useCallback(
    (id, dir) =>
      commit((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.layers.length) return d;
        const layers = [...d.layers];
        [layers[i], layers[j]] = [layers[j], layers[i]];
        return { ...d, layers };
      }),
    [commit]
  );

  const updateOwner = useCallback(
    (id, patch) =>
      commit(
        (d) => ({ ...d, owners: d.owners.map((o) => (o.id === id ? { ...o, ...patch } : o)) }),
        { coalesceKey: "owner:" + id }
      ),
    [commit]
  );

  const addOwner = useCallback(
    () =>
      commit((d) => ({
        ...d,
        owners: [...d.owners, { id: uid(), name: "New owner", color: "#c98bd6" }]
      })),
    [commit]
  );

  const removeOwner = useCallback(
    (id) =>
      commit((d) => ({
        ...d,
        owners: d.owners.filter((o) => o.id !== id),
        objects: d.objects.map((o) => (o.owner === id ? { ...o, owner: null } : o))
      })),
    [commit]
  );

  const assignOwner = useCallback(
    (ownerId) => {
      if (!selectedIds.length) return;
      const set = new Set(selectedIds);
      commitObjects((prev) => prev.map((o) => (set.has(o.id) ? { ...o, owner: ownerId } : o)));
    },
    [commitObjects, selectedIds]
  );

  // ---- Scale --------------------------------------------------------------
  const openUnsquash = useCallback(() => {
    const plan = planUnsquash(doc);
    if (!plan.ok) {
      flash(plan.reason, 5000);
      return;
    }
    setUnsquash(plan);
  }, [doc, flash]);

  const applyUnsquash = useCallback(() => {
    if (!unsquash) return;
    backupDocument(doc, "before-unsquash");
    // One commit, so a single Ctrl+Z puts the map back exactly as it was.
    commit(() => unsquash.document);
    setUnsquash(null);
    setSelectedIds([]);
    flash("Vertical squash corrected — one Ctrl+Z reverts it", 5000);
  }, [unsquash, doc, commit, flash]);

  const setDimensionAnchor = useCallback(
    (objectId, edge) => {
      if (!primary || primary.type !== "dimension") return;
      commit((d) => ({
        ...d,
        objects: d.objects.map((o) => {
          if (o.id !== primary.id) return o;
          if (!objectId) return { ...o, anchor: null };
          const target = d.objects.find((t) => t.id === objectId);
          return target ? placeDimensionOnEdge(o, target, edge || "bottom") : { ...o, anchor: null };
        })
      }));
    },
    [commit, primary]
  );

  // ---- View helpers -------------------------------------------------------
  const zoomBy = (factor) => stageRef.current.zoomTo && stageRef.current.zoomTo(view.zoom * factor);

  const fitToContent = useCallback(() => {
    const size = stageRef.current.size;
    const ext = documentExtent(doc);
    if (!size || !ext.w || !ext.h) return;
    const pad = 40;
    const zoom = Math.max(
      0.05,
      Math.min(4, Math.min((size.width - pad * 2) / ext.w, (size.height - pad * 2) / ext.h))
    );
    setView({
      zoom,
      x: size.width / 2 - (ext.x + ext.w / 2) * zoom,
      y: size.height / 2 - (ext.y + ext.h / 2) * zoom
    });
  }, [doc]);

  // ---- File actions -------------------------------------------------------
  const onImport = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setStatus("Could not read that file.");
    reader.onload = () => {
      const res = parseImport(String(reader.result || ""));
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      reset(res.doc);
      setSelectedIds([]);
      flash("Imported " + res.doc.objects.length + " objects", 2200);
    };
    reader.readAsText(file);
  };

  const resetMap = () => {
    if (!window.confirm("Discard the saved map and go back to the original layout?")) return;
    clearSaved();
    reset(defaultDocument());
    setSelectedIds([]);
    flash("Reset to the original layout", 2200);
  };

  const saveNow = () => {
    const res = saveDocument(doc);
    flash(res.ok ? "Saved to this browser" : res.error);
  };

  const doExport = async (kind, extra = {}) => {
    const stage = stageRef.current.stage;
    if (!stage) return;
    try {
      flash(kind === "png" ? "Rendering PNG…" : "Building PDF…", 0);
      if (kind === "png") await exportPNG(doc, { pixelRatio: 2, colorMode });
      else await exportPDF(doc, { colorMode, format: extra.format || "a3" });
      flash("Export ready", 2200);
    } catch (err) {
      console.error(err);
      flash("Export failed: " + (err && err.message), 5000);
    }
  };

  const exportFamily = async () => {
    try {
      flash("Building family page…", 0);
      await exportFamilyPage(doc);
      flash("Family page downloaded", 2200);
    } catch (err) {
      console.error(err);
      flash("Could not export family page: " + (err && err.message), 5000);
    }
  };

  // ---- Keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(
          doc.objects.filter((o) => {
            const f = flagsById.get(o.id);
            return f && f.visible && !f.locked;
          }).map((o) => o.id)
        );
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        setSelectedIds([]);
        setTool("select");
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSelected, deleteSelected, nudge, doc.objects, flagsById]);

  const selectFromList = (id, additive) => {
    setSelectedIds((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
    });
  };

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        onTool={setTool}
        onAdd={addObject}
        zoom={view.zoom}
        onZoomIn={() => zoomBy(1.15)}
        onZoomOut={() => zoomBy(1 / 1.15)}
        onFit={fitToContent}
        onResetView={() => setView({ x: 20, y: 20, zoom: 0.9 })}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={saveNow}
        onExportJSON={() => exportDocument(doc)}
        onExportPNG={() => doExport("png")}
        onExportPDF={() => setPdfOpts({ format: "a3" })}
        onFamilyPage={exportFamily}
        onOpenViewer={() => window.open("viewer.html", "_blank")}
        onImport={onImport}
        onReset={resetMap}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        hasSelection={selectedIds.length > 0}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        gridEnabled={gridEnabled}
        onToggleGrid={() => setGridEnabled((g) => !g)}
        colorMode={colorMode}
        onToggleColorMode={() => setColorMode((m) => (m === "owner" ? "natural" : "owner"))}
        snapPx={snapPx}
        onSnapPx={setSnapPx}
        saveStatus={status}
      />

      <main className="workspace">
        <div className="canvasColumn">
        <Canvas
          doc={doc}
          objects={rendered}
          flagsById={flagsById}
          ownerColors={ownerColors}
          colorMode={colorMode}
          tool={tool}
          onToolDone={addDrawn}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onCommit={commitObjects}
          view={view}
          onViewChange={setView}
          snapEnabled={snapEnabled}
          gridEnabled={gridEnabled}
          gridSize={GRID_SIZE}
          snapPx={snapPx}
          stageRef={stageRef}
        />
        <Legend doc={doc} colorMode={colorMode} />
        </div>

        <button
          className={"panelToggle" + (panelOpen ? " shifted" : "")}
          onClick={() => setPanelOpen((p) => !p)}
          title="Show / hide the side panel"
        >
          {panelOpen ? "▸" : "◂"}
        </button>

        {panelOpen && (
          <aside className="panel">
            <nav className="panelTabs">
              {PANELS.map(([id, label]) => (
                <button key={id} className={panel === id ? "active" : ""} onClick={() => setPanel(id)}>
                  {label}
                </button>
              ))}
            </nav>

            {panel === "inspector" && (
              <>
                <Inspector
                  doc={doc}
                  selected={primary}
                  count={selectedIds.length}
                  onPatch={patchSelected}
                  onZOrder={changeZOrder}
                  onToggleLock={() => primary && toggleFlag(primary.id, "locked")}
                  onDuplicate={duplicateSelected}
                  onDelete={deleteSelected}
                  onAssignOwner={assignOwner}
                  onAnchor={setDimensionAnchor}
                  onClose={() => setSelectedIds([])}
                />
                <ObjectList
                  objects={[...doc.objects]}
                  selectedIds={selectedIds}
                  onSelect={selectFromList}
                  onToggleVisible={(id) => toggleFlag(id, "visible")}
                  onToggleLock={(id) => toggleFlag(id, "locked")}
                />
              </>
            )}

            {panel === "layers" && (
              <LayersPanel
                doc={doc}
                selectedIds={selectedIds}
                onUpdate={updateLayer}
                onMove={moveLayer}
                onSelectLayer={(layerId) =>
                  setSelectedIds(doc.objects.filter((o) => o.layer === layerId).map((o) => o.id))
                }
                onAssignLayer={(layerId) => {
                  const set = new Set(selectedIds);
                  commitObjects((prev) => prev.map((o) => (set.has(o.id) ? { ...o, layer: layerId } : o)));
                }}
              />
            )}

            {panel === "owners" && (
              <OwnersPanel
                doc={doc}
                selectedIds={selectedIds}
                colorMode={colorMode}
                onToggleColorMode={() => setColorMode((m) => (m === "owner" ? "natural" : "owner"))}
                onUpdate={updateOwner}
                onAdd={addOwner}
                onRemove={removeOwner}
                onAssign={assignOwner}
                onGuess={() => {
                  commitObjects(guessOwners);
                  flash("Owners guessed from labels", 2200);
                }}
              />
            )}

            {panel === "scale" && (
              <ScalePanel
                doc={doc}
                onCommit={commit}
                onUnsquash={openUnsquash}
                onSelect={(id) => setSelectedIds([id])}
                onFlash={flash}
              />
            )}
          </aside>
        )}
      </main>

      {unsquash && (
        <UnsquashDialog plan={unsquash} onApply={applyUnsquash} onCancel={() => setUnsquash(null)} />
      )}

      {pdfOpts && (
        <div className="modalBackdrop" onClick={() => setPdfOpts(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Export PDF</h2>
            <p className="muted">The sheet is fitted to the page. Pick a size that matches the printer.</p>
            <label className="field">
              <span>Page size</span>
              <select
                value={pdfOpts.format}
                onChange={(e) => setPdfOpts({ format: e.target.value })}
              >
                <option value="a4">A4</option>
                <option value="a3">A3</option>
                <option value="letter">Letter</option>
              </select>
            </label>
            <div className="btnRow">
              <button onClick={() => setPdfOpts(null)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  const format = pdfOpts.format;
                  setPdfOpts(null);
                  doExport("pdf", { format });
                }}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="status">
        {tool === "select"
          ? "Drag to move • Handles to resize/rotate • Shift+drag to marquee-select • Double-click to rename • Ctrl/Cmd+Z to undo"
          : tool === "polygon"
            ? "Click to place each corner • Enter or click the first point to finish • Esc to cancel"
            : tool === "freehand"
              ? "Drag to trace the outline • release to finish • Esc to cancel"
              : "Drag from one end of the measurement to the other • Esc to cancel"}
      </div>
    </div>
  );
}

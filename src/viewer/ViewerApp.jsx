import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas from "../components/Canvas.jsx";
import Legend from "../components/Legend.jsx";
import { areaSqFt, defaultDocument, effectiveFlags, migrateDocument, orderedObjects, ownerById } from "../model/document.js";
import { formatArea } from "../model/geometry.js";
import { loadDocument, parseImport } from "../model/storage.js";
import { documentExtent } from "../model/transforms.js";

function bootDocument() {
  if (typeof window !== "undefined" && window.__MAP_DOCUMENT__) {
    return migrateDocument(window.__MAP_DOCUMENT__) || defaultDocument();
  }
  const el = document.getElementById("map-doc");
  if (el && el.textContent && el.textContent.trim() && el.textContent.trim() !== "null") {
    try {
      return migrateDocument(JSON.parse(el.textContent)) || defaultDocument();
    } catch {}
  }
  return loadDocument() || defaultDocument();
}

export default function ViewerApp() {
  const [doc, setDoc] = useState(bootDocument);
  const [selectedIds, setSelectedIds] = useState([]);
  const [view, setView] = useState({ x: 20, y: 20, zoom: 0.85 });
  const [colorMode, setColorMode] = useState("owner");
  const stageRef = useRef({});

  const rendered = useMemo(() => orderedObjects(doc), [doc]);
  const flagsById = useMemo(() => {
    const m = new Map();
    for (const o of doc.objects) m.set(o.id, effectiveFlags(doc, o));
    return m;
  }, [doc]);
  const ownerColors = useMemo(() => new Map(doc.owners.map((o) => [o.id, o.color])), [doc.owners]);
  const selected = selectedIds.length ? doc.objects.find((o) => o.id === selectedIds[selectedIds.length - 1]) : null;
  const owner = selected ? ownerById(doc, selected.owner) : null;
  const area = selected ? areaSqFt(doc, selected) : null;

  const fit = useCallback(() => {
    const size = stageRef.current.size;
    const ext = documentExtent(doc);
    if (!size || !ext.w || !ext.h) return;
    const pad = 40;
    const zoom = Math.max(0.05, Math.min(4, Math.min((size.width - pad * 2) / ext.w, (size.height - pad * 2) / ext.h)));
    setView({
      zoom,
      x: size.width / 2 - (ext.x + ext.w / 2) * zoom,
      y: size.height / 2 - (ext.y + ext.h / 2) * zoom
    });
  }, [doc]);

  useEffect(() => {
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
  }, [fit]);

  const onImport = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseImport(String(reader.result || ""));
      if (res.ok) {
        setDoc(res.doc);
        setSelectedIds([]);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="viewer">
      <header className="viewerBar">
        <h1>{doc.title || "Property Map"}</h1>
        <button onClick={fit}>Fit</button>
        <button onClick={() => setColorMode((m) => (m === "owner" ? "natural" : "owner"))}>
          {colorMode === "owner" ? "By owner" : "Natural"}
        </button>
        <label className="fileBtn">
          Open JSON
          <input type="file" accept=".json,application/json" onChange={onImport} />
        </label>
        <button onClick={() => window.print()}>Print</button>
      </header>
      <div className="viewerStage">
        <Canvas
          doc={doc}
          objects={rendered}
          flagsById={flagsById}
          ownerColors={ownerColors}
          colorMode={colorMode}
          tool="select"
          onToolDone={() => {}}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onCommit={() => {}}
          view={view}
          onViewChange={setView}
          snapEnabled={false}
          gridEnabled={false}
          gridSize={10}
          readOnly
          stageRef={stageRef}
        />
        <Legend doc={doc} colorMode={colorMode} />
        {selected && (
          <aside className="tapCard">
            <h3>{selected.label || selected.type}</h3>
            <p>{owner ? owner.name : "Unassigned"}</p>
            <p>{area == null ? "Not to scale" : formatArea(area)}</p>
          </aside>
        )}
      </div>
    </div>
  );
}

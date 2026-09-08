import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import MapObject from "./MapObject.jsx";
import { MIN_FONT, MIN_SIZE, boundsOf, uid } from "../model/objects.js";
import {
  closestEdge,
  formatFeet,
  insertVertex,
  polygonBounds,
  removeVertex,
  simplify,
  toFeet
} from "../model/geometry.js";
import { useStageSize } from "../hooks/useStageSize.js";

const SNAP_PX = 6;
const GUIDE_COLOR = "#e8437a";
const DRAFT_COLOR = "#1677ff";
const CLOSE_PX = 10;
const ROTATION_SNAPS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];

function clone(o) {
  return { ...o, points: o.points ? [...o.points] : undefined };
}

export default function Canvas({
  doc,
  objects,
  flagsById,
  ownerColors,
  colorMode,
  tool,
  onToolDone,
  selectedIds,
  onSelectionChange,
  onCommit,
  view,
  onViewChange,
  snapEnabled,
  gridEnabled,
  gridSize,
  stageRef
}) {
  const wrapRef = useRef(null);
  const size = useStageSize(wrapRef);
  const layerRef = useRef(null);
  const trRef = useRef(null);
  const nodes = useRef(new Map());
  const dragState = useRef(null);
  const [guides, setGuides] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const marqueeRef = useRef(null);
  const [shiftDown, setShiftDown] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const [readout, setReadout] = useState(null);

  const drawing = tool !== "select";
  const upf = doc.scale.unitsPerFoot;
  const notation = doc.scale.feetNotation;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);

  const registerRef = useCallback((id, node) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  // Konva registers the stage as the drag target on pointerdown, before our own
  // mousedown handler runs, so a marquee cannot cancel the pan after the fact.
  // Tracking modifiers up front lets us switch panning off *before* the gesture.
  useEffect(() => {
    const down = (e) => {
      if (e.key === "Shift") setShiftDown(true);
      if (e.key === "Alt") setAltDown(true);
    };
    const up = (e) => {
      if (e.key === "Shift") setShiftDown(false);
      if (e.key === "Alt") setAltDown(false);
    };
    const clear = () => {
      setShiftDown(false);
      setAltDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // ---- Transformer wiring -------------------------------------------------
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (drawing) {
      tr.nodes([]);
      return;
    }
    const picked = selectedIds
      .map((id) => nodes.current.get(id))
      .filter((n) => {
        const o = n && byId.get(n.id());
        const f = o && flagsById.get(o.id);
        return o && f && !f.locked;
      });
    tr.nodes(picked);
    tr.getLayer() && tr.getLayer().batchDraw();
  }, [selectedIds, objects, byId, flagsById, drawing]);

  const selectedObjects = selectedIds.map((id) => byId.get(id)).filter(Boolean);
  const onlyText = selectedObjects.length > 0 && selectedObjects.every((o) => o.type === "text");
  const anyResizable = selectedObjects.some((o) => o.type !== "text");
  // A single polygon or dimension gets vertex handles rather than relying only
  // on its bounding box.
  const vertexTarget =
    selectedObjects.length === 1 &&
    (selectedObjects[0].type === "polygon" || selectedObjects[0].type === "dimension") &&
    flagsById.get(selectedObjects[0].id) &&
    !flagsById.get(selectedObjects[0].id).locked
      ? selectedObjects[0]
      : null;

  // ---- View ---------------------------------------------------------------
  const clampZoom = (z) => Math.max(0.05, Math.min(4, z));

  const zoomTo = useCallback(
    (nextZoom, pointer) => {
      const zoom = clampZoom(nextZoom);
      const p = pointer || { x: size.width / 2, y: size.height / 2 };
      const world = { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom };
      onViewChange({ zoom, x: p.x - world.x * zoom, y: p.y - world.y * zoom });
    },
    [view, size, onViewChange]
  );

  useEffect(() => {
    if (stageRef) stageRef.current = { ...(stageRef.current || {}), zoomTo, size };
  }, [stageRef, zoomTo, size]);

  const onWheel = (e) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    // Scale the step by the actual delta so a trackpad is not as coarse as a
    // mouse notch; ctrl/cmd+wheel is the pinch gesture and zooms faster.
    const intensity = e.evt.ctrlKey || e.evt.metaKey ? 0.01 : 0.0025;
    zoomTo(view.zoom * Math.exp(-e.evt.deltaY * intensity), pointer);
  };

  const worldPointer = useCallback(
    (stage) => {
      const p = stage && stage.getPointerPosition();
      if (!p) return { x: 0, y: 0 };
      return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom };
    },
    [view]
  );

  const screenOf = useCallback(
    (wx, wy) => ({ x: wx * view.zoom + view.x, y: wy * view.zoom + view.y }),
    [view]
  );

  /** Edge/centre lines plus polygon vertices, from everything not being dragged. */
  const snapTargets = useCallback(
    (excludeIds) => {
      const skip = new Set(excludeIds);
      const boxes = [];
      const points = [];
      for (const o of objects) {
        if (skip.has(o.id)) continue;
        const f = flagsById.get(o.id);
        if (!f || !f.visible) continue;
        boxes.push(boundsOf(o));
        if (o.type === "polygon" && Array.isArray(o.points)) {
          for (let i = 0; i < o.points.length - 1; i += 2) {
            points.push({ x: o.x + o.points[i], y: o.y + o.points[i + 1] });
          }
        }
      }
      return { boxes, points };
    },
    [objects, flagsById]
  );

  // ---- Selection ----------------------------------------------------------
  const selectObject = (id, additive) => {
    if (additive) {
      onSelectionChange(selectedSet.has(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]);
    } else if (!selectedSet.has(id)) {
      onSelectionChange([id]);
    }
  };

  // ---- Drawing tools ------------------------------------------------------
  const setDraftState = (next) => {
    draftRef.current = next;
    setDraft(next);
  };

  const finishPolygon = useCallback(
    (pts) => {
      const flat = pts.flatMap((p) => [p.x, p.y]);
      if (flat.length < 6) {
        setDraftState(null);
        return;
      }
      const b = polygonBounds(flat);
      onToolDone({
        id: uid(),
        type: "polygon",
        x: b.x,
        y: b.y,
        rotation: 0,
        opacity: 1,
        label: "New Section",
        locked: false,
        visible: true,
        owner: null,
        layer: "buildings",
        points: flat.map((v, i) => (i % 2 === 0 ? v - b.x : v - b.y)),
        fill: "#f7ead0",
        stroke: "#1268c4",
        strokeWidth: 4,
        fontSize: 18,
        showLabel: true
      });
      setDraftState(null);
    },
    [onToolDone]
  );

  const finishDimension = useCallback(
    (a, b) => {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 4) {
        setDraftState(null);
        return;
      }
      onToolDone({
        id: uid(),
        type: "dimension",
        x: a.x,
        y: a.y,
        rotation: 0,
        opacity: 1,
        label: "",
        locked: false,
        visible: true,
        owner: null,
        layer: "dimensions",
        points: [0, 0, b.x - a.x, b.y - a.y],
        stroke: "#222222",
        strokeWidth: 2,
        fontSize: 14,
        offset: 14,
        realFt: null,
        anchor: null
      });
      setDraftState(null);
    },
    [onToolDone]
  );

  // Escape / Enter while a draw tool is mid-shape.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e) => {
      const d = draftRef.current;
      if (e.key === "Escape") {
        setDraftState(null);
        return;
      }
      if (e.key === "Enter" && d && d.kind === "polygon") {
        e.preventDefault();
        finishPolygon(d.points);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, finishPolygon]);

  useEffect(() => {
    if (!drawing) setDraftState(null);
  }, [drawing]);

  // ---- Stage pointer ------------------------------------------------------
  const onStageMouseDown = (e) => {
    const stage = e.target.getStage();
    const p = worldPointer(stage);

    if (tool === "polygon") {
      const d = draftRef.current;
      if (!d || d.kind !== "polygon") {
        setDraftState({ kind: "polygon", points: [p], cursor: p });
        return;
      }
      const first = d.points[0];
      // Clicking back on the first point closes the ring.
      if (d.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) * view.zoom < CLOSE_PX) {
        finishPolygon(d.points);
        return;
      }
      setDraftState({ ...d, points: [...d.points, p] });
      return;
    }

    if (tool === "freehand") {
      setDraftState({ kind: "freehand", points: [p] });
      return;
    }

    if (tool === "dimension") {
      setDraftState({ kind: "dimension", a: p, b: p });
      return;
    }

    if (e.target !== stage) return; // a shape handles its own selection
    if (e.evt.shiftKey) {
      stage.stopDrag();
      marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      setMarquee(marqueeRef.current);
      return;
    }
    onSelectionChange([]);
  };

  const onStageMouseMove = (e) => {
    const stage = e.target.getStage();
    const d = draftRef.current;
    if (d) {
      const p = worldPointer(stage);
      if (d.kind === "polygon") setDraftState({ ...d, cursor: p });
      else if (d.kind === "freehand") setDraftState({ ...d, points: [...d.points, p] });
      else if (d.kind === "dimension") setDraftState({ ...d, b: p });
      return;
    }
    if (!marqueeRef.current) return;
    const p = worldPointer(stage);
    marqueeRef.current = { ...marqueeRef.current, x1: p.x, y1: p.y };
    setMarquee(marqueeRef.current);
  };

  const onStageMouseUp = () => {
    const d = draftRef.current;
    if (d && d.kind === "freehand") {
      const flat = d.points.flatMap((p) => [p.x, p.y]);
      // A freehand trace arrives with a point per pointer move; reduce it to
      // something that can actually be edited vertex by vertex.
      const reduced = simplify(flat, 3 / view.zoom);
      const pts = [];
      for (let i = 0; i < reduced.length - 1; i += 2) pts.push({ x: reduced[i], y: reduced[i + 1] });
      finishPolygon(pts);
      return;
    }
    if (d && d.kind === "dimension") {
      finishDimension(d.a, d.b);
      return;
    }

    const m = marqueeRef.current;
    if (!m) return;
    const r = {
      x: Math.min(m.x0, m.x1),
      y: Math.min(m.y0, m.y1),
      w: Math.abs(m.x1 - m.x0),
      h: Math.abs(m.y1 - m.y0)
    };
    marqueeRef.current = null;
    setMarquee(null);
    if (r.w < 3 && r.h < 3) return;
    const hits = objects
      .filter((o) => {
        const f = flagsById.get(o.id);
        return f && f.visible && !f.locked;
      })
      .filter((o) => {
        const b = boundsOf(o);
        return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
      })
      .map((o) => o.id);
    onSelectionChange(hits);
  };

  // ---- Dragging with snapping --------------------------------------------
  const startDrag = (o) => (e) => {
    e.cancelBubble = true;
    const ids = selectedSet.has(o.id) && selectedIds.length > 1 ? selectedIds : [o.id];
    if (!selectedSet.has(o.id)) onSelectionChange([o.id]);
    dragState.current = {
      leadId: o.id,
      ids,
      start: new Map(ids.map((id) => {
        const n = nodes.current.get(id);
        return [id, n ? { x: n.x(), y: n.y() } : { x: 0, y: 0 }];
      })),
      lead: { x: e.target.x(), y: e.target.y() },
      targets: snapTargets(ids)
    };
  };

  const moveDrag = () => (e) => {
    const st = dragState.current;
    if (!st) return;
    const node = e.target;
    const b = node.getClientRect({ relativeTo: node.getLayer() });
    const tol = SNAP_PX / view.zoom;
    const found = [];
    let dx = 0;
    let dy = 0;

    if (snapEnabled) {
      const vEdges = [b.x, b.x + b.width / 2, b.x + b.width];
      const hEdges = [b.y, b.y + b.height / 2, b.y + b.height];
      let bestV = null;
      let bestH = null;
      const tryV = (line) => {
        for (const edge of vEdges) {
          const d = line - edge;
          if (Math.abs(d) <= tol && (!bestV || Math.abs(d) < Math.abs(bestV.d))) bestV = { d, line };
        }
      };
      const tryH = (line) => {
        for (const edge of hEdges) {
          const d = line - edge;
          if (Math.abs(d) <= tol && (!bestH || Math.abs(d) < Math.abs(bestH.d))) bestH = { d, line };
        }
      };
      for (const t of st.targets.boxes) {
        tryV(t.x); tryV(t.x + t.w / 2); tryV(t.x + t.w);
        tryH(t.y); tryH(t.y + t.h / 2); tryH(t.y + t.h);
      }
      // Section corners are snap targets too, so a block can meet a wall face.
      for (const p of st.targets.points) {
        tryV(p.x);
        tryH(p.y);
      }
      if (bestV) { dx = bestV.d; found.push({ orientation: "v", at: bestV.line }); }
      if (bestH) { dy = bestH.d; found.push({ orientation: "h", at: bestH.line }); }
    }

    if (gridEnabled && !dx) dx = Math.round(node.x() / gridSize) * gridSize - node.x();
    if (gridEnabled && !dy) dy = Math.round(node.y() / gridSize) * gridSize - node.y();

    if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
    setGuides(found);

    if (st.ids.length > 1) {
      const moved = { x: node.x() - st.lead.x, y: node.y() - st.lead.y };
      for (const id of st.ids) {
        if (id === st.leadId) continue;
        const n = nodes.current.get(id);
        const s = st.start.get(id);
        if (n && s) n.position({ x: s.x + moved.x, y: s.y + moved.y });
      }
    }

    if (upf) {
      const p = screenOf(node.x(), node.y());
      setReadout({
        x: p.x + 14,
        y: p.y - 26,
        text: `Δ ${formatFeet(toFeet(node.x() - st.lead.x, upf), notation)}, ${formatFeet(toFeet(node.y() - st.lead.y, upf), notation)}`
      });
    }
  };

  const endDrag = () => {
    const st = dragState.current;
    dragState.current = null;
    setGuides([]);
    setReadout(null);
    if (!st) return;
    const lead = nodes.current.get(st.leadId);
    if (!lead) return;
    // Derive every position from the lead's final delta rather than from each
    // node's live position: React re-renders during the drag can reset the
    // followers' imperative positions, which would commit drifted coordinates.
    const delta = { x: lead.x() - st.lead.x, y: lead.y() - st.lead.y };
    if (!delta.x && !delta.y) return;
    const ids = new Set(st.ids);
    onCommit((prev) =>
      prev.map((o) => {
        if (!ids.has(o.id)) return o;
        const from = st.start.get(o.id) || { x: o.x, y: o.y };
        return { ...o, x: from.x + delta.x, y: from.y + delta.y };
      })
    );
  };

  // ---- Transform ----------------------------------------------------------
  const onTransform = () => {
    if (!upf || selectedIds.length !== 1) return;
    const node = nodes.current.get(selectedIds[0]);
    if (!node) return;
    const b = node.getClientRect({ relativeTo: node.getLayer() });
    const p = screenOf(b.x + b.width, b.y + b.height);
    setReadout({
      x: p.x + 12,
      y: p.y + 8,
      text: `${formatFeet(toFeet(b.width, upf), notation)} × ${formatFeet(toFeet(b.height, upf), notation)}`
    });
  };

  const endTransform = () => {
    setReadout(null);
    const patches = new Map();
    for (const id of selectedIds) {
      const node = nodes.current.get(id);
      const o = byId.get(id);
      if (!node || !o) continue;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
      if (o.type === "text") {
        patches.set(id, { ...base, fontSize: Math.max(MIN_FONT, o.fontSize * ((Math.abs(sx) + Math.abs(sy)) / 2)) });
      } else if (Array.isArray(o.points)) {
        patches.set(id, { ...base, points: o.points.map((p, i) => (i % 2 === 0 ? p * sx : p * sy)) });
      } else {
        patches.set(id, {
          ...base,
          w: Math.max(MIN_SIZE, o.w * Math.abs(sx)),
          h: Math.max(MIN_SIZE, o.h * Math.abs(sy))
        });
      }
    }
    if (!patches.size) return;
    onCommit((prev) => prev.map((o) => (patches.has(o.id) ? { ...clone(o), ...patches.get(o.id) } : o)));
  };

  // ---- Vertex editing -----------------------------------------------------
  const moveVertex = (o, index, world, final) => {
    let x = world.x - o.x;
    let y = world.y - o.y;
    if (gridEnabled) {
      x = Math.round((o.x + x) / gridSize) * gridSize - o.x;
      y = Math.round((o.y + y) / gridSize) * gridSize - o.y;
    }
    const points = o.points.slice();
    points[index * 2] = x;
    points[index * 2 + 1] = y;
    // Coalesce the drag into one history entry; the final commit closes it.
    onCommit((prev) => prev.map((p) => (p.id === o.id ? { ...p, points } : p)), {
      coalesceKey: final ? null : "vertex:" + o.id + ":" + index
    });
  };

  const onVertexClick = (o, index) => (e) => {
    e.cancelBubble = true;
    if (!e.evt.altKey || o.type !== "polygon") return;
    onCommit((prev) => prev.map((p) => (p.id === o.id ? { ...p, points: removeVertex(p.points, index) } : p)));
  };

  const onShapeDblClick = (o) => (e) => {
    const flags = flagsById.get(o.id);
    if (flags && flags.locked) return;

    if (o.type === "polygon") {
      // Double-clicking a section's edge inserts a corner there.
      const p = worldPointer(e.target.getStage());
      const local = { x: p.x - o.x, y: p.y - o.y };
      const edge = closestEdge(o.points, local.x, local.y);
      if (edge.index >= 0 && edge.dist * view.zoom < 14) {
        onCommit((prev) =>
          prev.map((q) => (q.id === o.id ? { ...q, points: insertVertex(q.points, edge.index, local.x, local.y) } : q))
        );
        return;
      }
    }

    if (o.type !== "rect" && o.type !== "text" && o.type !== "polygon") return;
    const node = nodes.current.get(o.id);
    if (!node) return;
    const pos = node.getAbsolutePosition();
    const width = o.type === "rect" ? o.w : o.type === "polygon" ? polygonBounds(o.points).w : 160;
    setEditing({
      id: o.id,
      value: o.label,
      left: pos.x,
      top: pos.y,
      width: width * view.zoom,
      fontSize: (o.fontSize || 18) * view.zoom
    });
  };

  const commitEdit = () => {
    if (!editing) return;
    const { id, value } = editing;
    setEditing(null);
    onCommit((prev) => prev.map((o) => (o.id === id ? { ...o, label: value } : o)));
  };

  // ---- Grid ---------------------------------------------------------------
  const gridLines = useMemo(() => {
    if (!gridEnabled || !size.width) return [];
    const step = gridSize;
    const x0 = Math.floor(-view.x / view.zoom / step) * step;
    const y0 = Math.floor(-view.y / view.zoom / step) * step;
    const x1 = x0 + size.width / view.zoom + step;
    const y1 = y0 + size.height / view.zoom + step;
    if ((x1 - x0) / step > 400 || (y1 - y0) / step > 400) return [];
    const out = [];
    for (let x = x0; x <= x1; x += step) out.push([x, y0, x, y1]);
    for (let y = y0; y <= y1; y += step) out.push([x0, y, x1, y]);
    return out;
  }, [gridEnabled, gridSize, view, size]);

  const guideSpan = 100000;
  const render = useMemo(
    () => ({ colorMode, ownerColors, scale: doc.scale }),
    [colorMode, ownerColors, doc.scale]
  );

  const draftPoints = draft
    ? draft.kind === "polygon"
      ? [...draft.points, draft.cursor || draft.points[draft.points.length - 1]].flatMap((p) => [p.x, p.y])
      : draft.kind === "freehand"
        ? draft.points.flatMap((p) => [p.x, p.y])
        : [draft.a.x, draft.a.y, draft.b.x, draft.b.y]
    : null;

  return (
    <div className={"canvasWrap" + (drawing ? " drawing" : "")} ref={wrapRef}>
      {size.width > 0 && (
        <Stage
          ref={(node) => {
            if (stageRef) stageRef.current = { ...(stageRef.current || {}), stage: node };
          }}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.zoom}
          scaleY={view.zoom}
          draggable={!marquee && !shiftDown && !drawing}
          onWheel={onWheel}
          onMouseDown={onStageMouseDown}
          onTouchStart={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onTouchMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onTouchEnd={onStageMouseUp}
          onDragStart={(e) => {
            // Belt and braces: if a marquee began but the stage drag was already
            // queued, cancel the pan the moment Konva actually starts it.
            if (e.target === e.target.getStage() && marqueeRef.current) {
              e.target.stopDrag();
              e.target.position({ x: view.x, y: view.y });
            }
          }}
          onDragMove={(e) => {
            if (e.target !== e.target.getStage() || marqueeRef.current) return;
            onViewChange({ ...view, x: e.target.x(), y: e.target.y() });
          }}
          onDragEnd={(e) => {
            if (e.target !== e.target.getStage() || marqueeRef.current) return;
            onViewChange({ ...view, x: e.target.x(), y: e.target.y() });
          }}
        >
          <Layer ref={layerRef}>
            {gridLines.map((pts, i) => (
              <Line key={"g" + i} points={pts} stroke="#dfe4ea" strokeWidth={1 / view.zoom} listening={false} />
            ))}

            {objects.map((o) => {
              const flags = flagsById.get(o.id) || { visible: o.visible, locked: o.locked };
              return (
                <MapObject
                  key={o.id}
                  o={o}
                  // While a drawing tool is live, existing shapes must not steal
                  // the pointer from the tool.
                  flags={drawing ? { ...flags, locked: true } : flags}
                  render={render}
                  isSelected={selectedSet.has(o.id)}
                  onRef={registerRef}
                  handlers={{
                    onMouseDown: (e) => {
                      e.cancelBubble = true;
                      selectObject(o.id, e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
                    },
                    onTouchStart: (e) => {
                      e.cancelBubble = true;
                      selectObject(o.id, false);
                    },
                    onDblClick: onShapeDblClick(o),
                    onDblTap: onShapeDblClick(o),
                    onDragStart: startDrag(o),
                    onDragMove: moveDrag(o),
                    onDragEnd: endDrag,
                    onTransform,
                    onTransformEnd: endTransform
                  }}
                />
              );
            })}

            <Transformer
              ref={trRef}
              rotateEnabled={!vertexTarget}
              keepRatio={onlyText || shiftDown}
              centeredScaling={altDown}
              rotationSnaps={snapEnabled && !shiftDown ? ROTATION_SNAPS : []}
              rotationSnapTolerance={7}
              resizeEnabled={anyResizable || onlyText}
              enabledAnchors={
                onlyText
                  ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                  : ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]
              }
              anchorSize={9}
              anchorStroke="#1677ff"
              borderStroke="#1677ff"
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < MIN_SIZE || Math.abs(newBox.height) < MIN_SIZE ? oldBox : newBox
              }
            />

            {/* Vertex handles for the selected section or dimension. */}
            {vertexTarget &&
              Array.from({ length: Math.floor(vertexTarget.points.length / 2) }).map((_, i) => (
                <Circle
                  key={"v" + i}
                  x={vertexTarget.x + vertexTarget.points[i * 2]}
                  y={vertexTarget.y + vertexTarget.points[i * 2 + 1]}
                  radius={6 / view.zoom}
                  fill="#ffffff"
                  stroke="#1677ff"
                  strokeWidth={2 / view.zoom}
                  draggable
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onClick={onVertexClick(vertexTarget, i)}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    moveVertex(vertexTarget, i, { x: e.target.x(), y: e.target.y() }, false);
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    moveVertex(vertexTarget, i, { x: e.target.x(), y: e.target.y() }, true);
                  }}
                />
              ))}

            {guides.map((g, i) => (
              <Line
                key={"guide" + i}
                points={g.orientation === "v" ? [g.at, -guideSpan, g.at, guideSpan] : [-guideSpan, g.at, guideSpan, g.at]}
                stroke={GUIDE_COLOR}
                strokeWidth={1 / view.zoom}
                dash={[4 / view.zoom, 4 / view.zoom]}
                listening={false}
              />
            ))}

            {draftPoints && (
              <>
                <Line
                  points={draftPoints}
                  closed={draft.kind !== "dimension"}
                  fill={draft.kind === "dimension" ? undefined : "#1677ff22"}
                  stroke={DRAFT_COLOR}
                  strokeWidth={2 / view.zoom}
                  dash={[6 / view.zoom, 4 / view.zoom]}
                  listening={false}
                />
                {draft.kind === "polygon" &&
                  draft.points.map((p, i) => (
                    <Circle
                      key={"d" + i}
                      x={p.x}
                      y={p.y}
                      radius={(i === 0 ? 6 : 4) / view.zoom}
                      fill={i === 0 ? DRAFT_COLOR : "#ffffff"}
                      stroke={DRAFT_COLOR}
                      strokeWidth={2 / view.zoom}
                      listening={false}
                    />
                  ))}
              </>
            )}

            {marquee && (
              <Rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="#1677ff22"
                stroke="#1677ff"
                strokeWidth={1 / view.zoom}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}

      {readout && (
        <div className="readoutBadge" style={{ left: readout.x, top: readout.y }}>
          {readout.text}
        </div>
      )}

      {editing && (
        <textarea
          className="labelEditor"
          autoFocus
          value={editing.value}
          style={{
            left: editing.left,
            top: editing.top,
            width: Math.max(80, editing.width),
            fontSize: Math.max(10, editing.fontSize)
          }}
          onChange={(e) => setEditing((s) => ({ ...s, value: e.target.value }))}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === "Escape") setEditing(null);
          }}
        />
      )}
    </div>
  );
}

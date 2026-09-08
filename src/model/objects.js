// Single source of truth for the map object model: defaults, validation,
// capability flags and schema migration.

import { polygonArea, polygonBounds } from "./geometry.js";

export const SCHEMA_VERSION = 2;

export const TYPES = ["rect", "text", "line", "tree", "table", "wall", "temple", "polygon", "dimension"];

export const MIN_SIZE = 8;
export const MIN_POLYGON_VERTICES = 3;
export const MIN_FONT = 6;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}

// Types that used to be drawn centred on x/y. v1 data needs a top-left shift.
const LEGACY_CENTERED = new Set(["tree", "table", "wall", "temple"]);

export const TYPE_DEFAULTS = {
  rect:   { w: 180, h: 100, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, fontSize: 18, label: "New Section", showLabel: true },
  text:   { fill: "#17202a", fontSize: 20, label: "New Text" },
  line:   { stroke: "#222222", strokeWidth: 4, dash: true, label: "Marking", points: [0, 0, 200, 0] },
  tree:   { w: 82,  h: 82,  fill: "#5b9a4f", stroke: "#285e2d", strokeWidth: 2, fontSize: 14, label: "Tree" },
  table:  { w: 116, h: 116, fill: "#c49a6c", stroke: "#704b2a", strokeWidth: 3, fontSize: 14, label: "Baithak" },
  wall:   { w: 180, h: 16,  fill: "#9da5ad", stroke: "#4e5963", strokeWidth: 3, fontSize: 14, label: "Boundary Wall" },
  temple: { w: 140, h: 140, fill: "#ead9b8", stroke: "#754a28", strokeWidth: 3, fontSize: 14, label: "Temple" },
  polygon: {
    fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, fontSize: 18, label: "New Section",
    showLabel: true, points: [0, 0, 200, 0, 200, 140, 0, 140]
  },
  dimension: {
    stroke: "#222222", strokeWidth: 2, fontSize: 14, label: "", offset: 14,
    points: [0, 0, 200, 0], realFt: null, anchor: null
  }
};

/** Which layer a type belongs to when nothing says otherwise. */
export const LAYER_FOR_TYPE = {
  rect: "buildings",
  polygon: "buildings",
  text: "labels",
  line: "dimensions",
  dimension: "dimensions",
  tree: "trees",
  table: "buildings",
  wall: "boundary",
  temple: "buildings"
};

// Drives the Inspector so a control is only ever shown for a type that
// actually reads the value it writes.
export const CAPS = {
  rect:   { size: true,  resize: true,  fill: true,  stroke: true,  opacity: true,  label: true,  fontSize: true,  rotate: true },
  text:   { size: false, resize: false, fill: true,  stroke: false, opacity: true,  label: true,  fontSize: true,  rotate: true },
  line:   { size: false, resize: false, fill: false, stroke: true,  opacity: true,  label: false, fontSize: false, rotate: true },
  tree:   { size: true,  resize: true,  fill: true,  stroke: true,  opacity: true,  label: false, fontSize: false, rotate: true },
  table:  { size: true,  resize: true,  fill: true,  stroke: true,  opacity: true,  label: false, fontSize: false, rotate: true },
  wall:   { size: true,  resize: true,  fill: true,  stroke: true,  opacity: true,  label: false, fontSize: false, rotate: true },
  temple: { size: true,  resize: true,  fill: true,  stroke: true,  opacity: true,  label: false, fontSize: false, rotate: true },
  polygon:   { size: false, resize: true,  fill: true,  stroke: true,  opacity: true,  label: true,  fontSize: true,  rotate: true, vertices: true, area: true },
  dimension: { size: false, resize: false, fill: false, stroke: true,  opacity: true,  label: false, fontSize: true,  rotate: false, vertices: true }
};

export const TYPE_LABELS = {
  rect: "Block", text: "Text", line: "Marking",
  tree: "Tree", table: "Table", wall: "Wall", temple: "Temple",
  polygon: "Section", dimension: "Dimension"
};

function num(v, fallback) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v, fallback) {
  return typeof v === "string" ? v : fallback;
}

function color(v, fallback) {
  return typeof v === "string" && v.trim() ? v : fallback;
}

/** Clean a flat point array down to finite pairs, falling back when unusable. */
function cleanPoints(raw, fallback, minPairs) {
  let pts = Array.isArray(raw) ? raw.map((p) => num(p, NaN)) : [];
  pts = pts.filter((p) => Number.isFinite(p));
  if (pts.length % 2 !== 0) pts.pop();
  if (pts.length < minPairs * 2) pts = fallback.slice();
  return pts;
}

/**
 * Coerce one raw object into a fully-populated, renderable object.
 * Returns null for anything the renderer could not draw, so a bad entry is
 * dropped instead of producing NaN geometry or an invisible node.
 */
export function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = str(raw.type, "");
  if (!TYPES.includes(type)) return null;

  const d = TYPE_DEFAULTS[type];
  const o = {
    id: str(raw.id, "") || uid(),
    type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    rotation: num(raw.rotation, 0),
    opacity: Math.min(1, Math.max(0.05, num(raw.opacity, 1))),
    label: str(raw.label, d.label),
    locked: raw.locked === true,
    visible: raw.visible !== false,
    owner: typeof raw.owner === "string" && raw.owner ? raw.owner : null,
    layer: str(raw.layer, "") || LAYER_FOR_TYPE[type] || "buildings"
  };

  if (type === "line") {
    o.points = cleanPoints(raw.points, d.points, 2);
    o.stroke = color(raw.stroke, d.stroke);
    o.strokeWidth = Math.max(1, num(raw.strokeWidth, d.strokeWidth));
    o.dash = raw.dash !== false;
    return o;
  }

  if (type === "polygon") {
    o.points = cleanPoints(raw.points, d.points, MIN_POLYGON_VERTICES);
    o.fill = color(raw.fill, d.fill);
    o.stroke = color(raw.stroke, d.stroke);
    o.strokeWidth = Math.max(0, num(raw.strokeWidth, d.strokeWidth));
    o.fontSize = Math.max(MIN_FONT, num(raw.fontSize, d.fontSize));
    o.showLabel = raw.showLabel !== false;
    return o;
  }

  if (type === "dimension") {
    // Exactly two ends; anything longer is a mis-shaped import.
    const pts = cleanPoints(raw.points, d.points, 2);
    o.points = pts.slice(0, 4);
    o.stroke = color(raw.stroke, d.stroke);
    o.strokeWidth = Math.max(1, num(raw.strokeWidth, d.strokeWidth));
    o.fontSize = Math.max(MIN_FONT, num(raw.fontSize, d.fontSize));
    o.offset = num(raw.offset, d.offset);
    // The measured truth from the survey, when known. Kept separate from the
    // drawn length so the two can be compared instead of silently agreeing.
    o.realFt = Number.isFinite(+raw.realFt) && +raw.realFt > 0 ? +raw.realFt : null;
    o.anchor =
      raw.anchor && typeof raw.anchor === "object" && typeof raw.anchor.objectId === "string"
        ? { objectId: raw.anchor.objectId, edge: str(raw.anchor.edge, "bottom") }
        : null;
    return o;
  }

  if (type === "text") {
    o.fill = color(raw.fill, d.fill);
    o.fontSize = Math.max(MIN_FONT, num(raw.fontSize, d.fontSize));
    return o;
  }

  o.w = Math.max(MIN_SIZE, num(raw.w, d.w));
  o.h = Math.max(MIN_SIZE, num(raw.h, d.h));
  o.fill = color(raw.fill, d.fill);
  o.stroke = color(raw.stroke, d.stroke);
  o.strokeWidth = Math.max(0, num(raw.strokeWidth, d.strokeWidth));
  if (type === "rect") {
    o.fontSize = Math.max(MIN_FONT, num(raw.fontSize, d.fontSize));
    o.showLabel = raw.showLabel !== false;
  }
  return o;
}

/** Normalize a list and guarantee unique ids (a merged export can repeat them). */
export function normalizeAll(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const o = normalize(raw);
    if (!o) continue;
    if (seen.has(o.id)) o.id = uid();
    seen.add(o.id);
    out.push(o);
  }
  return out;
}

/**
 * v1 -> v2: lines stored absolute points and ignored x/y (so drags were lost on
 * reload); tree/table/wall/temple were drawn centred on x/y.
 */
function migrateV1Object(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...raw };

  if (o.type === "line" && Array.isArray(o.points) && o.points.length >= 4) {
    const [px, py] = o.points;
    if (Number.isFinite(px) && Number.isFinite(py)) {
      o.x = px;
      o.y = py;
      o.points = o.points.map((p, i) => (i % 2 === 0 ? p - px : p - py));
    }
  }

  if (LEGACY_CENTERED.has(o.type)) {
    const d = TYPE_DEFAULTS[o.type];
    const w = Number.isFinite(+o.w) ? +o.w : d.w;
    const h = Number.isFinite(+o.h) ? +o.h : d.h;
    o.w = w;
    o.h = h;
    o.x = (Number.isFinite(+o.x) ? +o.x : 0) - w / 2;
    o.y = (Number.isFinite(+o.y) ? +o.y : 0) - h / 2;
  }

  return o;
}

/**
 * Accepts either the v1 payload (a bare array) or the v2 payload
 * ({ version, objects }) and returns normalized objects.
 */
export function migrate(payload) {
  if (Array.isArray(payload)) {
    // v1: no version marker, and no background objects in the data.
    return [...backgroundObjects(), ...normalizeAll(payload.map(migrateV1Object))];
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.objects)) {
    const version = Number.isFinite(+payload.version) ? +payload.version : 1;
    const list = version < 2 ? payload.objects.map(migrateV1Object) : payload.objects;
    const objects = normalizeAll(list);
    return objects.length && version < 2 ? [...backgroundObjects(), ...objects] : objects;
  }
  return null;
}

/** The sheet + plot boundary, now real (locked) objects rather than hardcoded rects. */
export function backgroundObjects() {
  return normalizeAll([
    { id: "bg-sheet", type: "rect", x: 0, y: 0, w: 1500, h: 950, fill: "#ffffff", stroke: "#c5cbd1", strokeWidth: 2, label: "Sheet", showLabel: false, locked: true },
    { id: "bg-plot", type: "rect", x: 70, y: 70, w: 900, h: 760, fill: "#b9d99b", stroke: "#1268c4", strokeWidth: 8, label: "Plot Boundary", showLabel: false, locked: true }
  ]);
}

const BASE_OBJECTS = [
  { id: "anurag", type: "rect", x: 90, y: 90, w: 240, h: 650, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Anurag Chacha ka Ghar (Complete)", fontSize: 20 },
  { id: "garden-top", type: "rect", x: 330, y: 70, w: 640, h: 220, fill: "#b9d99b", stroke: "#1268c4", strokeWidth: 4, label: "Garden / Open Area — Trees only", fontSize: 20 },
  { id: "gate", type: "rect", x: 330, y: 290, w: 145, h: 95, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Gate", fontSize: 20 },
  { id: "mum", type: "rect", x: 475, y: 290, w: 220, h: 95, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Mum", fontSize: 20 },
  { id: "parlour", type: "rect", x: 695, y: 290, w: 275, h: 95, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Parlour", fontSize: 20 },
  { id: "angan", type: "rect", x: 330, y: 385, w: 490, h: 70, fill: "#ead9b8", stroke: "#1268c4", strokeWidth: 4, label: "Angan", fontSize: 20 },
  { id: "open", type: "rect", x: 330, y: 455, w: 325, h: 285, fill: "#b9d99b", stroke: "#1268c4", strokeWidth: 4, label: "Open / Garden", fontSize: 20 },
  { id: "ratnesh", type: "rect", x: 655, y: 455, w: 165, h: 120, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Ratnesh Chacha ka Room", fontSize: 18 },
  { id: "room", type: "rect", x: 655, y: 575, w: 165, h: 165, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Room", fontSize: 20 },
  { id: "room2", type: "rect", x: 820, y: 385, w: 150, h: 85, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Room", fontSize: 18 },
  { id: "kitchen", type: "rect", x: 820, y: 470, w: 150, h: 85, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Kitchen", fontSize: 18 },
  { id: "store", type: "rect", x: 820, y: 555, w: 150, h: 85, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Store", fontSize: 18 },
  { id: "wash", type: "rect", x: 820, y: 640, w: 150, h: 100, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Washroom", fontSize: 18 },
  { id: "naal", type: "rect", x: 720, y: 740, w: 100, h: 90, fill: "#f7ead0", stroke: "#1268c4", strokeWidth: 4, label: "Naal", fontSize: 18 },
  { id: "road", type: "rect", x: 970, y: 260, w: 105, h: 570, fill: "#d7dadd", stroke: "#1268c4", strokeWidth: 4, label: "8.5 ft Road", fontSize: 18 },
  { id: "lower-open", type: "rect", x: 70, y: 830, w: 600, h: 90, fill: "#cfe5ad", stroke: "#1268c4", strokeWidth: 4, label: "Open Area — Trees & Baithak", fontSize: 18 },
  { id: "lower-road", type: "rect", x: 670, y: 830, w: 100, h: 90, fill: "#d7dadd", stroke: "#1268c4", strokeWidth: 4, label: "8 ft Road", fontSize: 16 },
  { id: "right-garden", type: "rect", x: 1075, y: 70, w: 340, h: 230, fill: "#b9d99b", stroke: "#1268c4", strokeWidth: 4, label: "Garden Area — Only Trees", fontSize: 20 },
  { id: "right-open", type: "rect", x: 1075, y: 300, w: 340, h: 620, fill: "#eee5d5", stroke: "#1268c4", strokeWidth: 4, label: "Open / Plot Area", fontSize: 20 },
  { id: "mandir", type: "rect", x: 970, y: 70, w: 105, h: 190, fill: "#eee5d5", stroke: "#1268c4", strokeWidth: 4, label: "Shiv Ji Mandir", fontSize: 17 },
  { id: "back", type: "text", x: 520, y: 48, label: "Back Gate", fontSize: 20 },
  { id: "main", type: "text", x: 28, y: 800, label: "Main Gate", fontSize: 20, rotation: -90 },
  { id: "north", type: "text", x: 1430, y: 45, label: "N", fontSize: 24 },
  // Dimension lines: x/y anchored with relative points, so dragging them sticks.
  { id: "dim30", type: "line", x: 345, y: 85, points: [0, 0, 605, 0], stroke: "#222222", strokeWidth: 2, label: "30 ft" },
  { id: "dim39", type: "line", x: 345, y: 95, points: [0, 0, 0, 185], stroke: "#222222", strokeWidth: 2, label: "39 ft" },
  { id: "dim2910", type: "line", x: 345, y: 395, points: [0, 0, 460, 0], stroke: "#222222", strokeWidth: 2, label: "29.10 ft" },
  { id: "dim4210", type: "line", x: 345, y: 470, points: [0, 0, 0, 255], stroke: "#222222", strokeWidth: 2, label: "42.10 ft" }
];

export function defaultObjects() {
  return [...backgroundObjects(), ...normalizeAll(BASE_OBJECTS)];
}

/**
 * Footprint of an object in square canvas units. Only closed shapes have one;
 * lines, dimensions and text return 0 so they never pollute area totals.
 */
export function areaOf(o) {
  if (!o) return 0;
  if (o.type === "polygon") return polygonArea(o.points);
  if (o.type === "rect" || o.type === "wall" || o.type === "temple" || o.type === "table") {
    return Math.abs(o.w * o.h);
  }
  return 0;
}

/** Drawn length of a dimension in canvas units. */
export function dimensionLength(o) {
  if (!o || o.type !== "dimension" || o.points.length < 4) return 0;
  return Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
}

/** Build a new object of `type` centred on the given world point. */
export function makeObject(type, center) {
  const d = TYPE_DEFAULTS[type];
  const base = { id: uid(), type, ...JSON.parse(JSON.stringify(d)) };
  if (type === "line" || type === "dimension") {
    base.x = center.x - 100;
    base.y = center.y;
  } else if (type === "polygon") {
    const b = polygonBounds(d.points);
    base.x = center.x - b.w / 2;
    base.y = center.y - b.h / 2;
  } else if (type === "text") {
    base.x = center.x;
    base.y = center.y;
  } else {
    base.x = center.x - d.w / 2;
    base.y = center.y - d.h / 2;
  }
  return normalize(base);
}

/** Axis-aligned world bounds, used for Fit-to-view and duplicate-offsets. */
export function boundsOf(o) {
  if (o.type === "polygon" || o.type === "dimension") {
    const b = polygonBounds(o.points);
    return { x: o.x + b.x, y: o.y + b.y, w: b.w, h: b.h };
  }
  if (o.type === "line") {
    const xs = o.points.filter((_, i) => i % 2 === 0);
    const ys = o.points.filter((_, i) => i % 2 === 1);
    return { x: o.x + Math.min(...xs), y: o.y + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (o.type === "text") {
    return { x: o.x, y: o.y, w: (o.label.length || 1) * o.fontSize * 0.55, h: o.fontSize * 1.2 };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

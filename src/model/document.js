// The v3 document: objects plus the things that make them mean something —
// a real-world scale, named owners, and layers.

import {
  LAYER_FOR_TYPE,
  TYPE_DEFAULTS,
  areaOf,
  defaultObjects,
  dimensionLength,
  migrate as migrateObjects,
  normalizeAll,
  uid
} from "./objects.js";
import { parseFeet, toSquareFeet } from "./geometry.js";

export const DOC_VERSION = 3;

export const DEFAULT_LAYERS = [
  { id: "boundary", name: "Boundary", visible: true, locked: true },
  { id: "roads", name: "Roads", visible: true, locked: false },
  { id: "buildings", name: "Buildings", visible: true, locked: false },
  { id: "trees", name: "Trees & Garden", visible: true, locked: false },
  { id: "dimensions", name: "Dimensions", visible: true, locked: false },
  { id: "labels", name: "Labels", visible: true, locked: false }
];

export const DEFAULT_OWNERS = [
  { id: "anurag", name: "Anurag", color: "#e8a33d" },
  { id: "ratnesh", name: "Ratnesh", color: "#4f8fd6" },
  { id: "common", name: "Common", color: "#7bb26a" },
  { id: "road", name: "Road", color: "#9aa3ab" },
  { id: "garden", name: "Garden", color: "#5b9a4f" }
];

export const DEFAULT_SCALE = {
  unitsPerFoot: null,      // null until calibrated: areas stay honest, not invented
  calibratedFrom: null,    // id of the dimension it was derived from
  squashCorrected: false,  // has the one-time vertical correction been applied
  feetNotation: "decimal"  // "decimal" (29.1 ft) or "ftin" (29' 10")
};

function str(v, fallback) {
  return typeof v === "string" ? v : fallback;
}

export function defaultDocument() {
  // Built through normalizeDocument so a fresh map and a migrated one are
  // byte-identical in shape (a converted line must not keep its `dash` field).
  return normalizeDocument({
    version: DOC_VERSION,
    title: "Property Map",
    scale: { ...DEFAULT_SCALE },
    owners: DEFAULT_OWNERS.map((o) => ({ ...o })),
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    objects: assignLayers(defaultObjects()).map((o) => lineToDimension(o, false))
  });
}

/** Layer heuristic for objects that predate layers. */
export function assignLayers(objects) {
  return objects.map((o) => {
    if (o.layer && o.layer !== LAYER_FOR_TYPE[o.type]) return o;
    let layer = LAYER_FOR_TYPE[o.type] || "buildings";
    if (o.id === "bg-sheet" || o.id === "bg-plot" || o.type === "wall") layer = "boundary";
    else if (/road/i.test(o.label || "")) layer = "roads";
    else if (/garden|open area|trees/i.test(o.label || "") && o.type === "rect") layer = "trees";
    return { ...o, layer };
  });
}

/**
 * v2 -> v3: a `line` whose label reads as a length becomes a real `dimension`,
 * carrying the surveyed value in `realFt` while keeping the original text so a
 * later change of notation (29.10 ft vs 29' 10") can re-derive it.
 */
function lineToDimension(o, dottedAsInches) {
  if (o.type !== "line") return o;
  const ft = parseFeet(o.label, dottedAsInches);
  if (ft === null || ft <= 0) return o;
  return {
    ...o,
    type: "dimension",
    realFt: ft,
    offset: TYPE_DEFAULTS.dimension.offset,
    fontSize: TYPE_DEFAULTS.dimension.fontSize,
    anchor: null
  };
}

function normalizeLayers(raw) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(raw)) {
    for (const l of raw) {
      if (!l || typeof l !== "object") continue;
      const id = str(l.id, "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: str(l.name, id),
        visible: l.visible !== false,
        locked: l.locked === true
      });
    }
  }
  // Guarantee every default layer exists so an object can never point at a
  // layer that is not in the list.
  for (const d of DEFAULT_LAYERS) {
    if (!seen.has(d.id)) out.push({ ...d });
  }
  return out;
}

function normalizeOwners(raw) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(raw)) {
    for (const o of raw) {
      if (!o || typeof o !== "object") continue;
      const id = str(o.id, "") || uid();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: str(o.name, id), color: str(o.color, "#9aa3ab") });
    }
  }
  return out;
}

function normalizeScale(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const upf = Number.isFinite(+s.unitsPerFoot) && +s.unitsPerFoot > 0 ? +s.unitsPerFoot : null;
  return {
    unitsPerFoot: upf,
    calibratedFrom: str(s.calibratedFrom, null) || null,
    squashCorrected: s.squashCorrected === true,
    feetNotation: s.feetNotation === "ftin" ? "ftin" : "decimal"
  };
}

export function normalizeDocument(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const layers = normalizeLayers(d.layers);
  const layerIds = new Set(layers.map((l) => l.id));
  const objects = normalizeAll(d.objects).map((o) =>
    layerIds.has(o.layer) ? o : { ...o, layer: LAYER_FOR_TYPE[o.type] || "buildings" }
  );
  const owners = normalizeOwners(d.owners);
  const ownerIds = new Set(owners.map((o) => o.id));
  return {
    version: DOC_VERSION,
    title: str(d.title, "Property Map"),
    scale: normalizeScale(d.scale),
    owners,
    layers,
    // Drop references to owners that no longer exist rather than rendering a
    // colour lookup miss.
    objects: objects.map((o) => (o.owner && !ownerIds.has(o.owner) ? { ...o, owner: null } : o))
  };
}

/**
 * Accepts any payload this app has ever written — a v1 bare array, a v2
 * { version, objects }, or a v3 document — and returns a v3 document.
 */
export function migrateDocument(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && +payload.version >= 3) {
    return normalizeDocument(payload);
  }

  // v1 / v2 both resolve to a flat object list through the existing chain.
  const objects = migrateObjects(payload);
  if (!objects) return null;

  const dottedAsInches = false; // calibration asks; decimal is the safer default
  const upgraded = assignLayers(objects).map((o) => lineToDimension(o, dottedAsInches));

  return normalizeDocument({
    version: DOC_VERSION,
    title: "Property Map",
    scale: { ...DEFAULT_SCALE },
    owners: DEFAULT_OWNERS.map((o) => ({ ...o })),
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    objects: upgraded
  });
}

// ---- Derived reads ---------------------------------------------------------

export function layerById(doc, id) {
  return doc.layers.find((l) => l.id === id) || null;
}

export function ownerById(doc, id) {
  return doc.owners.find((o) => o.id === id) || null;
}

/** Objects in render order: layer order first, then their order within it. */
export function orderedObjects(doc) {
  const rank = new Map(doc.layers.map((l, i) => [l.id, i]));
  return doc.objects
    .map((o, i) => ({ o, i, r: rank.has(o.layer) ? rank.get(o.layer) : 999 }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((e) => e.o);
}

/** A layer's flags fold into the object's own — hidden layer, hidden object. */
export function effectiveFlags(doc, o) {
  const layer = layerById(doc, o.layer);
  return {
    visible: o.visible && (!layer || layer.visible),
    locked: o.locked || (layer ? layer.locked : false)
  };
}

export function areaSqFt(doc, o) {
  const upf = doc.scale.unitsPerFoot;
  if (!upf) return null;
  return toSquareFeet(areaOf(o), upf);
}

/** Square feet per owner, plus what is still unassigned. */
export function areaByOwner(doc) {
  const upf = doc.scale.unitsPerFoot;
  const totals = new Map();
  let unassigned = 0;
  for (const o of doc.objects) {
    if (o.id === "bg-sheet" || o.id === "bg-plot") continue;
    const area = areaOf(o);
    if (!area) continue;
    const sqft = upf ? toSquareFeet(area, upf) : null;
    if (!o.owner) unassigned += sqft || 0;
    else totals.set(o.owner, (totals.get(o.owner) || 0) + (sqft || 0));
  }
  return { totals, unassigned, calibrated: !!upf };
}

/**
 * Scale implied by each dimension that carries a surveyed length, split by
 * axis. This is what exposes the map being squashed vertically.
 */
export function impliedScales(doc) {
  const horizontal = [];
  const vertical = [];
  for (const o of doc.objects) {
    if (o.type !== "dimension" || !o.realFt) continue;
    const len = dimensionLength(o);
    if (!len) continue;
    const dx = Math.abs(o.points[2] - o.points[0]);
    const dy = Math.abs(o.points[3] - o.points[1]);
    const entry = { id: o.id, label: o.label, units: len, realFt: o.realFt, unitsPerFoot: len / o.realFt };
    (dx >= dy ? horizontal : vertical).push(entry);
  }
  const mean = (list) => (list.length ? list.reduce((a, b) => a + b.unitsPerFoot, 0) / list.length : null);
  const h = mean(horizontal);
  const v = mean(vertical);
  return {
    horizontal,
    vertical,
    horizontalMean: h,
    verticalMean: v,
    // How much the drawing is squashed vertically relative to horizontally.
    squashFactor: h && v ? h / v : null
  };
}

/** Re-read every dimension's original label under the chosen 29.10 convention. */
export function applyFeetNotation(doc, feetNotation) {
  const dotted = feetNotation === "ftin";
  return normalizeDocument({
    ...doc,
    scale: { ...doc.scale, feetNotation },
    objects: doc.objects.map((o) => {
      if (o.type !== "dimension" || !o.label) return o;
      const ft = parseFeet(o.label, dotted);
      return ft && ft > 0 ? { ...o, realFt: ft } : o;
    })
  });
}

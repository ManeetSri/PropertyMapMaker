// Bulk geometry transforms. Pure functions over a document so they can be
// previewed, tested, and applied as a single undoable commit.

import { impliedScales, normalizeDocument } from "./document.js";
import { areaOf, boundsOf, dimensionLength } from "./objects.js";
import { polygonBounds, round, toSquareFeet } from "./geometry.js";

const POINT_TYPES = new Set(["line", "polygon", "dimension"]);
const SIZED_TYPES = new Set(["rect", "tree", "table", "wall", "temple"]);

/**
 * Scale every object about `origin`. sx/sy may differ — that is exactly what
 * the un-squash needs, since the drawing is compressed on one axis only.
 */
export function scaleDocument(doc, { sx = 1, sy = 1, origin = { x: 0, y: 0 } } = {}) {
  if (sx === 1 && sy === 1) return doc;
  const objects = doc.objects.map((o) => {
    const next = {
      ...o,
      x: origin.x + (o.x - origin.x) * sx,
      y: origin.y + (o.y - origin.y) * sy
    };
    if (SIZED_TYPES.has(o.type)) {
      next.w = Math.max(1, o.w * sx);
      next.h = Math.max(1, o.h * sy);
    }
    if (POINT_TYPES.has(o.type) && Array.isArray(o.points)) {
      next.points = o.points.map((p, i) => (i % 2 === 0 ? p * sx : p * sy));
    }
    if (o.type === "dimension" && Number.isFinite(o.offset)) {
      next.offset = o.offset * ((Math.abs(sx) + Math.abs(sy)) / 2);
    }
    return next;
  });
  return { ...doc, objects };
}

/**
 * The one-time vertical correction. Returns the new document plus the numbers
 * behind it, so the UI can show what it is about to do before doing it.
 */
export function planUnsquash(doc) {
  const implied = impliedScales(doc);
  const { horizontalMean, verticalMean, squashFactor } = implied;
  if (!horizontalMean || !verticalMean) {
    return {
      ok: false,
      reason:
        "Need at least one horizontal and one vertical dimension with a real length before the squash can be measured.",
      implied
    };
  }
  const before = documentExtent(doc);
  const next = scaleDocument(doc, { sy: squashFactor });
  const corrected = {
    ...next,
    scale: {
      ...next.scale,
      // Both axes now agree, so a single scale is meaningful for the first time.
      unitsPerFoot: round(horizontalMean, 4),
      squashCorrected: true
    }
  };
  return {
    ok: true,
    implied,
    factor: squashFactor,
    before,
    after: documentExtent(corrected),
    unitsPerFoot: round(horizontalMean, 4),
    residual: residualError(corrected),
    document: normalizeDocument(corrected)
  };
}

/**
 * Rescale the whole drawing so one canvas unit maps to a round scale, without
 * changing any real-world size. Used to land on a clean 20 u/ft after
 * calibration.
 */
export function normalizeScaleTo(doc, targetUnitsPerFoot) {
  const current = doc.scale.unitsPerFoot;
  if (!current || !targetUnitsPerFoot || targetUnitsPerFoot <= 0) return doc;
  const k = targetUnitsPerFoot / current;
  const scaled = scaleDocument(doc, { sx: k, sy: k });
  return normalizeDocument({
    ...scaled,
    scale: { ...scaled.scale, unitsPerFoot: targetUnitsPerFoot }
  });
}

/** Calibrate from one dimension: its drawn length becomes its real length. */
export function calibrateFrom(doc, dimensionId, realFt) {
  const dim = doc.objects.find((o) => o.id === dimensionId && o.type === "dimension");
  if (!dim || !realFt || realFt <= 0) return doc;
  const len = dimensionLength(dim);
  if (!len) return doc;
  return normalizeDocument({
    ...doc,
    objects: doc.objects.map((o) => (o.id === dimensionId ? { ...o, realFt } : o)),
    scale: {
      ...doc.scale,
      unitsPerFoot: round(len / realFt, 4),
      calibratedFrom: dimensionId
    }
  });
}

/** How far each dimension still disagrees with the document scale, worst first. */
export function residualError(doc) {
  const upf = doc.scale.unitsPerFoot;
  if (!upf) return [];
  return doc.objects
    .filter((o) => o.type === "dimension" && o.realFt)
    .map((o) => {
      const drawnFt = dimensionLength(o) / upf;
      return {
        id: o.id,
        label: o.label,
        realFt: o.realFt,
        drawnFt: round(drawnFt, 2),
        errorPct: round(((drawnFt - o.realFt) / o.realFt) * 100, 1)
      };
    })
    .sort((a, b) => Math.abs(b.errorPct) - Math.abs(a.errorPct));
}

/**
 * Place a dimension along one edge of `target`. The dimension then follows
 * that object through later moves and resizes via applyAnchors().
 */
export function placeDimensionOnEdge(dim, target, edge) {
  const b = boundsOf(target);
  let x1;
  let y1;
  let x2;
  let y2;
  if (edge === "top") {
    x1 = b.x; y1 = b.y; x2 = b.x + b.w; y2 = b.y;
  } else if (edge === "left") {
    x1 = b.x; y1 = b.y; x2 = b.x; y2 = b.y + b.h;
  } else if (edge === "right") {
    x1 = b.x + b.w; y1 = b.y; x2 = b.x + b.w; y2 = b.y + b.h;
  } else {
    x1 = b.x; y1 = b.y + b.h; x2 = b.x + b.w; y2 = b.y + b.h;
  }
  return {
    ...dim,
    x: x1,
    y: y1,
    points: [0, 0, x2 - x1, y2 - y1],
    anchor: { objectId: target.id, edge }
  };
}

/** Recompute every anchored dimension from its target's current bounds. */
export function applyAnchors(objects, skipIds) {
  const skip = skipIds instanceof Set ? skipIds : new Set(skipIds || []);
  const byId = new Map(objects.map((o) => [o.id, o]));
  return objects.map((o) => {
    if (o.type !== "dimension" || !o.anchor || skip.has(o.id)) return o;
    const target = byId.get(o.anchor.objectId);
    if (!target) return { ...o, anchor: null };
    return placeDimensionOnEdge(o, target, o.anchor.edge);
  });
}

/** Scale Check worklist: drawn size vs the survey size typed on each block. */
export function blockResiduals(doc) {
  const upf = doc.scale.unitsPerFoot;
  if (!upf) return [];
  const rows = [];
  for (const o of doc.objects) {
    if (o.id === "bg-sheet" || o.id === "bg-plot") continue;
    const area = areaOf(o);
    if (!area) continue;
    if (o.type === "polygon") {
      const drawnArea = toSquareFeet(area, upf);
      const hasSurvey = o.surveyArea > 0;
      rows.push({
        id: o.id,
        label: o.label,
        kind: "area",
        drawnArea: round(drawnArea, 1),
        surveyArea: o.surveyArea,
        errorPct: hasSurvey ? round(((drawnArea - o.surveyArea) / o.surveyArea) * 100, 1) : 0,
        hasSurvey
      });
      continue;
    }
    if (!o.w || !o.h) continue;
    const drawnW = o.w / upf;
    const drawnH = o.h / upf;
    const hasSurvey = o.surveyW > 0 || o.surveyH > 0;
    let errorPct = 0;
    if (o.surveyW > 0) errorPct = Math.max(errorPct, Math.abs((drawnW - o.surveyW) / o.surveyW) * 100);
    if (o.surveyH > 0) errorPct = Math.max(errorPct, Math.abs((drawnH - o.surveyH) / o.surveyH) * 100);
    rows.push({
      id: o.id,
      label: o.label,
      kind: "size",
      drawnW: round(drawnW, 2),
      drawnH: round(drawnH, 2),
      surveyW: o.surveyW,
      surveyH: o.surveyH,
      errorPct: round(errorPct, 1),
      hasSurvey
    });
  }
  return rows.sort((a, b) => {
    if (a.hasSurvey !== b.hasSurvey) return a.hasSurvey ? -1 : 1;
    return Math.abs(b.errorPct) - Math.abs(a.errorPct);
  });
}

/** Grow/shrink a polygon about its centre so its area matches surveyArea. */
export function scalePolygonToArea(o, unitsPerFoot, surveyArea) {
  const current = toSquareFeet(areaOf(o), unitsPerFoot);
  if (!current || !surveyArea || surveyArea <= 0) return o;
  const k = Math.sqrt(surveyArea / current);
  const b = polygonBounds(o.points);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return {
    ...o,
    points: o.points.map((p, i) => (i % 2 === 0 ? cx + (p - cx) * k : cy + (p - cy) * k))
  };
}

/** Assign owners from labels so colour-by-owner is useful without a manual pass. */
export function guessOwners(objects) {
  return objects.map((o) => {
    if (o.id === "bg-sheet" || o.id === "bg-plot") return o;
    const l = o.label || "";
    if (/anurag/i.test(l)) return { ...o, owner: "anurag" };
    if (/ratnesh/i.test(l)) return { ...o, owner: "ratnesh" };
    if (/\broad\b/i.test(l)) return { ...o, owner: "road" };
    if (/garden|open area|trees|open \/ plot/i.test(l)) return { ...o, owner: "garden" };
    if (/angan|gate|naal|wash|kitchen|store|parlour|mum|\broom\b|mandir|temple|baithak/i.test(l)) {
      return { ...o, owner: "common" };
    }
    return o;
  });
}

/** Resize one object to a real-world size, keeping its top-left anchored. */
export function fitObjectToReal(o, unitsPerFoot, wFt, hFt) {
  if (!unitsPerFoot) return o;
  const next = { ...o };
  if (Number.isFinite(wFt) && wFt > 0) next.w = wFt * unitsPerFoot;
  if (Number.isFinite(hFt) && hFt > 0) next.h = hFt * unitsPerFoot;
  return next;
}

export function documentExtent(doc) {
  const boxes = doc.objects.filter((o) => o.visible).map(boundsOf);
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

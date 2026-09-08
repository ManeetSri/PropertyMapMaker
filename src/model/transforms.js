// Bulk geometry transforms. Pure functions over a document so they can be
// previewed, tested, and applied as a single undoable commit.

import { impliedScales, normalizeDocument } from "./document.js";
import { boundsOf, dimensionLength } from "./objects.js";
import { round } from "./geometry.js";

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

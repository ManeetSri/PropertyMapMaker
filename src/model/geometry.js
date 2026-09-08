// Pure geometry and unit helpers. No React, no Konva — so this stays testable
// from Node and reusable by the editor, the exporters and the viewer.

/** Shoelace area of a flat [x0,y0,x1,y1,...] ring, in square canvas units. */
export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 6) return 0;
  const n = Math.floor(points.length / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
  }
  return Math.abs(sum) / 2;
}

export function polygonBounds(points) {
  if (!Array.isArray(points) || points.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length - 1; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Perpendicular distance from (px,py) to the segment (x1,y1)-(x2,y2). */
function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(px, py, x1 + t * dx, y1 + t * dy);
}

/**
 * Ramer-Douglas-Peucker on a flat point array. Freehand strokes arrive with a
 * point per pointer move; this reduces them to an editable number of vertices.
 */
export function simplify(points, tolerance = 2) {
  const n = Math.floor(points.length / 2);
  if (n < 3) return points.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(
        points[i * 2], points[i * 2 + 1],
        points[first * 2], points[first * 2 + 1],
        points[last * 2], points[last * 2 + 1]
      );
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  }
  return out;
}

/** Insert a vertex at `index` (0-based vertex position) in a flat array. */
export function insertVertex(points, index, x, y) {
  const out = points.slice();
  out.splice(index * 2, 0, x, y);
  return out;
}

export function removeVertex(points, index) {
  if (points.length <= 6) return points.slice(); // never below a triangle
  const out = points.slice();
  out.splice(index * 2, 2);
  return out;
}

/** Vertex index of the closest edge midpoint-insertion slot for a point. */
export function closestEdge(points, x, y) {
  const n = Math.floor(points.length / 2);
  let best = { index: -1, dist: Infinity };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = pointSegmentDistance(
      x, y,
      points[i * 2], points[i * 2 + 1],
      points[j * 2], points[j * 2 + 1]
    );
    if (d < best.dist) best = { index: j, dist: d };
  }
  return best;
}

// ---- Units -----------------------------------------------------------------

/**
 * Parse a length written the way property papers write it.
 * Accepts 30, "30", "30 ft", "29' 10\"", "29ft 10in", "29-10".
 * `dottedAsInches` decides what a bare "29.10" means: with it, 29 ft 10 in;
 * without, 29.1 ft. Property documents in India commonly mean the former, so
 * the calibration UI asks rather than guessing silently.
 */
export function parseFeet(input, dottedAsInches = false) {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // 29' 10"  /  29 ft 10 in  /  29-10
  const compound = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|-)\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?$/);
  if (compound) {
    const ft = parseFloat(compound[1]);
    const inches = parseFloat(compound[2]);
    if (Number.isFinite(ft) && Number.isFinite(inches)) return ft + inches / 12;
  }

  const plain = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)?$/);
  if (plain) {
    const v = parseFloat(plain[1]);
    if (!Number.isFinite(v)) return null;
    if (dottedAsInches && plain[1].includes(".")) {
      const [whole, frac] = plain[1].split(".");
      const inches = parseFloat(frac.padEnd(2, "0").slice(0, 2));
      if (Number.isFinite(inches) && inches < 12) return parseFloat(whole) + inches / 12;
    }
    return v;
  }
  return null;
}

export function formatFeet(ft, notation = "decimal") {
  if (!Number.isFinite(ft)) return "—";
  if (notation === "ftin") {
    const whole = Math.floor(ft);
    const inches = Math.round((ft - whole) * 12);
    if (inches === 12) return `${whole + 1}' 0"`;
    return `${whole}' ${inches}"`;
  }
  return `${round(ft, 2)} ft`;
}

export function formatArea(sqft) {
  if (!Number.isFinite(sqft)) return "—";
  if (sqft >= 10000) return `${round(sqft / 43560, 3)} acre`;
  return `${Math.round(sqft)} sq ft`;
}

export function round(v, places = 2) {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
}

/** Canvas units -> feet, and area in square units -> square feet. */
export function toFeet(units, unitsPerFoot) {
  return unitsPerFoot > 0 ? units / unitsPerFoot : 0;
}

export function toSquareFeet(squareUnits, unitsPerFoot) {
  return unitsPerFoot > 0 ? squareUnits / (unitsPerFoot * unitsPerFoot) : 0;
}

// Snap targets and the move-time solver. Kept out of Canvas so the same
// numbers drive object drags, vertex drags, and equal-spacing hints.

import { boundsOf } from "./objects.js";

const NEARLY_AXIS = 0.15; // |minor|/|major| below this → treat the edge as H or V

function overlaps(a1, a2, b1, b2) {
  return a1 < b2 && b1 < a2;
}

function gapAlong(a, b, axis) {
  if (axis === "x") {
    if (a.x + a.w <= b.x) return b.x - (a.x + a.w);
    if (b.x + b.w <= a.x) return a.x - (b.x + b.w);
    return -1;
  }
  if (a.y + a.h <= b.y) return b.y - (a.y + a.h);
  if (b.y + b.h <= a.y) return a.y - (b.y + b.h);
  return -1;
}

/** Everything a dragged object or vertex can snap to, excluding itself. */
export function collectSnapTargets(objects, flagsById, excludeIds) {
  const skip = new Set(excludeIds);
  const vLines = [];
  const hLines = [];
  const points = [];
  const boxes = [];

  const addPoint = (x, y) => {
    points.push({ x, y });
    vLines.push(x);
    hLines.push(y);
  };

  for (const o of objects) {
    if (skip.has(o.id)) continue;
    const f = flagsById.get(o.id);
    if (!f || !f.visible) continue;
    const b = boundsOf(o);
    if (!Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
    boxes.push({ ...b, id: o.id });
    vLines.push(b.x, b.x + b.w / 2, b.x + b.w);
    hLines.push(b.y, b.y + b.h / 2, b.y + b.h);

    if ((o.type === "polygon" || o.type === "line" || o.type === "dimension") && Array.isArray(o.points)) {
      const n = Math.floor(o.points.length / 2);
      for (let i = 0; i < n; i++) {
        const x = o.x + o.points[i * 2];
        const y = o.y + o.points[i * 2 + 1];
        addPoint(x, y);
        if (o.type !== "polygon") continue;
        const j = (i + 1) % n;
        const x2 = o.x + o.points[j * 2];
        const y2 = o.y + o.points[j * 2 + 1];
        const dx = x2 - x;
        const dy = y2 - y;
        if (Math.abs(dx) <= Math.abs(dy) * NEARLY_AXIS) vLines.push((x + x2) / 2);
        if (Math.abs(dy) <= Math.abs(dx) * NEARLY_AXIS) hLines.push((y + y2) / 2);
      }
    }
  }

  return { vLines, hLines, points, boxes };
}

function nearestLine(value, lines, tol) {
  let best = null;
  for (const line of lines) {
    const d = line - value;
    if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
  }
  return best;
}

/**
 * Snap a world point (vertex handle) to other vertices and H/V faces.
 */
export function snapPoint(x, y, targets, tol) {
  let best = null;
  for (const p of targets.points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= tol && (!best || d < best.d)) best = { d, x: p.x, y: p.y };
  }
  if (best) {
    return {
      x: best.x,
      y: best.y,
      guides: [
        { orientation: "v", at: best.x },
        { orientation: "h", at: best.y }
      ]
    };
  }
  const v = nearestLine(x, targets.vLines, tol);
  const h = nearestLine(y, targets.hLines, tol);
  const guides = [];
  if (v) {
    x = v.line;
    guides.push({ orientation: "v", at: v.line });
  }
  if (h) {
    y = h.line;
    guides.push({ orientation: "h", at: h.line });
  }
  return { x, y, guides };
}

/**
 * Snap a moving axis-aligned box. Returns the delta to apply to the node,
 * alignment guides, and equal-spacing markers.
 */
export function snapBox(box, targets, tol) {
  const guides = [];
  const spacing = [];
  let dx = 0;
  let dy = 0;

  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h }
  ];
  let bestPt = null;
  for (const p of targets.points) {
    for (const c of corners) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= tol && (!bestPt || d < bestPt.d)) bestPt = { d, dx: p.x - c.x, dy: p.y - c.y, p };
    }
  }
  if (bestPt) {
    dx = bestPt.dx;
    dy = bestPt.dy;
    guides.push({ orientation: "v", at: bestPt.p.x }, { orientation: "h", at: bestPt.p.y });
  } else {
    const vEdges = [box.x, box.x + box.w / 2, box.x + box.w];
    const hEdges = [box.y, box.y + box.h / 2, box.y + box.h];
    let bestV = null;
    let bestH = null;
    for (const line of targets.vLines) {
      for (const edge of vEdges) {
        const d = line - edge;
        if (Math.abs(d) <= tol && (!bestV || Math.abs(d) < Math.abs(bestV.d))) bestV = { d, line };
      }
    }
    for (const line of targets.hLines) {
      for (const edge of hEdges) {
        const d = line - edge;
        if (Math.abs(d) <= tol && (!bestH || Math.abs(d) < Math.abs(bestH.d))) bestH = { d, line };
      }
    }
    if (bestV) {
      dx = bestV.d;
      guides.push({ orientation: "v", at: bestV.line });
    }
    if (bestH) {
      dy = bestH.d;
      guides.push({ orientation: "h", at: bestH.line });
    }
  }

  const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
  equalize(moved, targets.boxes, "x", tol, spacing, (delta) => {
    dx += delta;
    moved.x += delta;
  });
  equalize(moved, targets.boxes, "y", tol, spacing, (delta) => {
    dy += delta;
    moved.y += delta;
  });

  return { dx, dy, guides, spacing };
}

/**
 * Snap so the gap to the nearest neighbour equals another gap on the same
 * row/column, or so the object sits equally between two neighbours.
 */
function equalize(box, boxes, axis, tol, spacing, apply) {
  const vertical = axis === "x";
  const neighbours = boxes.filter((t) =>
    vertical
      ? overlaps(box.y, box.y + box.h, t.y, t.y + t.h)
      : overlaps(box.x, box.x + box.w, t.x, t.x + t.w)
  );
  if (neighbours.length < 1) return;

  const otherGaps = [];
  for (let i = 0; i < neighbours.length; i++) {
    for (let j = i + 1; j < neighbours.length; j++) {
      const g = gapAlong(neighbours[i], neighbours[j], axis);
      if (g > 1) otherGaps.push(g);
    }
  }

  const before = neighbours.filter((t) => (vertical ? t.x + t.w <= box.x + 0.5 : t.y + t.h <= box.y + 0.5));
  const after = neighbours.filter((t) => (vertical ? t.x >= box.x + box.w - 0.5 : t.y >= box.y + box.h - 0.5));
  const nearest = (list, towardStart) => {
    if (!list.length) return null;
    return list.reduce((best, t) => {
      const pos = vertical
        ? towardStart ? t.x + t.w : t.x
        : towardStart ? t.y + t.h : t.y;
      const boxPos = vertical
        ? towardStart ? box.x : box.x + box.w
        : towardStart ? box.y : box.y + box.h;
      const d = Math.abs(boxPos - pos);
      if (!best || d < best.d) return { t, d, pos };
      return best;
    }, null);
  };

  const left = nearest(before, true);
  const right = nearest(after, false);

  // Centre between two neighbours.
  if (left && right) {
    const span = right.pos - left.pos;
    const centred = left.pos + (span - (vertical ? box.w : box.h)) / 2;
    const current = vertical ? box.x : box.y;
    const delta = centred - current;
    if (Math.abs(delta) <= tol) {
      apply(delta);
      pushSpace(spacing, box, left.t, axis);
      pushSpace(spacing, { ...box, [vertical ? "x" : "y"]: centred }, right.t, axis);
      return;
    }
  }

  // Match this object's gap to an existing gap between other objects.
  const tryMatch = (side) => {
    if (!side) return false;
    const currentGap = vertical
      ? side === left
        ? box.x - left.pos
        : right.pos - (box.x + box.w)
      : side === left
        ? box.y - left.pos
        : right.pos - (box.y + box.h);
    if (currentGap < 0) return false;
    let best = null;
    for (const g of otherGaps) {
      const d = g - currentGap;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, g };
    }
    if (!best) return false;
    const sign = side === left ? 1 : -1;
    apply(best.d * sign);
    pushSpace(spacing, box, side.t, axis);
    return true;
  };

  if (!tryMatch(left)) tryMatch(right);
}

function pushSpace(spacing, box, other, axis) {
  if (axis === "x") {
    const x1 = Math.min(box.x + box.w, other.x + other.w);
    const x2 = Math.max(box.x, other.x);
    const y = Math.max(box.y, other.y);
    const h = Math.min(box.y + box.h, other.y + other.h) - y;
    if (x2 > x1 && h > 0) spacing.push({ x: x1, y, w: x2 - x1, h: Math.max(4, h * 0.15) });
  } else {
    const y1 = Math.min(box.y + box.h, other.y + other.h);
    const y2 = Math.max(box.y, other.y);
    const x = Math.max(box.x, other.x);
    const w = Math.min(box.x + box.w, other.x + other.w) - x;
    if (y2 > y1 && w > 0) spacing.push({ x, y: y1, w: Math.max(4, w * 0.15), h: y2 - y1 });
  }
}

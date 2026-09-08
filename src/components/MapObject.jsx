import React from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import { formatFeet } from "../model/geometry.js";
import { polygonBounds } from "../model/geometry.js";

const SELECT_STROKE = "#1677ff";

/** Slightly darker companion for a fill, used for shading without a second field. */
function shade(hex, amount) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * amount);
  const g = clamp(((n >> 8) & 255) * amount);
  const b = clamp((n & 255) * amount);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function RectBody({ o }) {
  return (
    <>
      <Rect
        width={o.w}
        height={o.h}
        fill={o.fill}
        stroke={o.stroke}
        strokeWidth={o.strokeWidth}
      />
      {o.showLabel && o.label ? (
        <Text
          text={o.label}
          x={6}
          y={0}
          width={Math.max(1, o.w - 12)}
          height={o.h}
          align="center"
          verticalAlign="middle"
          wrap="word"
          ellipsis
          listening={false}
          fontSize={o.fontSize}
          fill="#17202a"
        />
      ) : null}
    </>
  );
}

function TreeBody({ o }) {
  const { w, h } = o;
  const trunkW = Math.max(2, w * 0.11);
  const r = Math.min(w, h) * 0.3;
  return (
    <>
      <Rect x={w / 2 - trunkW / 2} y={h * 0.58} width={trunkW} height={h * 0.42} fill="#7b5536" />
      <Circle x={w * 0.29} y={h * 0.5} radius={Math.min(w, h) * 0.2} fill={shade(o.fill, 0.88)} />
      <Circle x={w * 0.71} y={h * 0.5} radius={Math.min(w, h) * 0.2} fill={shade(o.fill, 0.88)} />
      <Circle x={w / 2} y={h * 0.36} radius={r} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} />
    </>
  );
}

function TableBody({ o }) {
  const { w, h } = o;
  const r = Math.min(w, h) * 0.29;
  const cw = Math.max(6, w * 0.17);
  const ch = Math.max(5, h * 0.14);
  const seats = [
    [w / 2 - cw / 2, 0],
    [w / 2 - cw / 2, h - ch],
    [0, h / 2 - ch / 2],
    [w - cw, h / 2 - ch / 2]
  ];
  return (
    <>
      {seats.map((p, i) => (
        <Rect key={i} x={p[0]} y={p[1]} width={cw} height={ch} cornerRadius={3} fill={shade(o.fill, 0.72)} stroke={o.stroke} strokeWidth={2} />
      ))}
      <Circle x={w / 2} y={h / 2} radius={r} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} />
    </>
  );
}

function WallBody({ o }) {
  const { w, h } = o;
  const step = Math.max(12, h * 1.25);
  const count = Math.max(0, Math.floor(w / step) - 1);
  return (
    <>
      <Rect width={w} height={h} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} />
      {Array.from({ length: count }).map((_, i) => (
        <Line key={i} points={[step * (i + 1), 0, step * (i + 1), h]} stroke="#e5e8eb" strokeWidth={2} listening={false} />
      ))}
    </>
  );
}

function TempleBody({ o }) {
  const { w, h } = o;
  return (
    <>
      <Rect x={w * 0.08} y={h * 0.45} width={w * 0.84} height={h * 0.55} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} />
      <Line
        points={[w / 2, h * 0.08, w * 0.02, h * 0.5, w * 0.98, h * 0.5]}
        closed
        fill={shade(o.fill, 0.82)}
        stroke={o.stroke}
        strokeWidth={o.strokeWidth}
      />
      <Rect x={w / 2 - w * 0.1} y={h * 0.62} width={w * 0.2} height={h * 0.38} fill={shade(o.fill, 0.78)} stroke={o.stroke} strokeWidth={2} />
      <Circle x={w / 2} y={h * 0.04} radius={Math.max(2, w * 0.045)} fill="#d9aa35" />
    </>
  );
}

function PolygonBody({ o, fill }) {
  const b = polygonBounds(o.points);
  return (
    <>
      <Line points={o.points} closed fill={fill} stroke={o.stroke} strokeWidth={o.strokeWidth} />
      {o.showLabel && o.label ? (
        <Text
          text={o.label}
          x={b.x + 6}
          y={b.y}
          width={Math.max(1, b.w - 12)}
          height={b.h}
          align="center"
          verticalAlign="middle"
          wrap="word"
          ellipsis
          listening={false}
          fontSize={o.fontSize}
          fill="#17202a"
        />
      ) : null}
    </>
  );
}

/**
 * A dimension draws its own measurement: extension lines out to an offset
 * measure line, arrowheads, and a label computed from the document scale — so
 * the number changes when the geometry does, which static text never did.
 */
function DimensionBody({ o, scale }) {
  const [x1, y1, x2, y2] = o.points;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = o.offset || 0;
  const a = { x: x1 + nx * off, y: y1 + ny * off };
  const b = { x: x2 + nx * off, y: y2 + ny * off };
  const head = Math.max(6, o.strokeWidth * 3);
  const ux = dx / len;
  const uy = dy / len;

  const arrow = (p, sign) => [
    p.x + ux * head * sign + nx * head * 0.35,
    p.y + uy * head * sign + ny * head * 0.35,
    p.x,
    p.y,
    p.x + ux * head * sign - nx * head * 0.35,
    p.y + uy * head * sign - ny * head * 0.35
  ];

  const upf = scale && scale.unitsPerFoot;
  const notation = (scale && scale.feetNotation) || "decimal";
  const drawnFt = upf ? len / upf : null;
  let text = o.label || "";
  if (drawnFt !== null) {
    text = formatFeet(drawnFt, notation);
    // Surface disagreement rather than hiding it behind the surveyed number.
    if (o.realFt && Math.abs(drawnFt - o.realFt) / o.realFt > 0.02) {
      text = `${formatFeet(o.realFt, notation)} · drawn ${formatFeet(drawnFt, notation)}`;
    }
  } else if (o.realFt) {
    text = formatFeet(o.realFt, notation);
  }

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180; // keep the label upright
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const textW = Math.max(60, text.length * o.fontSize * 0.6);

  return (
    <>
      <Line points={[x1, y1, a.x, a.y]} stroke={o.stroke} strokeWidth={1} dash={[3, 3]} listening={false} />
      <Line points={[x2, y2, b.x, b.y]} stroke={o.stroke} strokeWidth={1} dash={[3, 3]} listening={false} />
      <Line points={[a.x, a.y, b.x, b.y]} stroke={o.stroke} strokeWidth={o.strokeWidth} hitStrokeWidth={16} />
      <Line points={arrow(a, 1)} stroke={o.stroke} strokeWidth={o.strokeWidth} listening={false} />
      <Line points={arrow(b, -1)} stroke={o.stroke} strokeWidth={o.strokeWidth} listening={false} />
      <Text
        text={text}
        x={mid.x - textW / 2}
        y={mid.y - o.fontSize - 3}
        width={textW}
        align="center"
        rotation={angle}
        offsetX={0}
        listening={false}
        fontSize={o.fontSize}
        fill={o.stroke}
      />
    </>
  );
}

const BODIES = { rect: RectBody, tree: TreeBody, table: TableBody, wall: WallBody, temple: TempleBody };

/**
 * One map object. Every type is drawn top-left anchored inside its own
 * w x h box so a single Transformer can resize all of them uniformly.
 */
/**
 * Which fill to paint: the object's own colour, or its owner's when the map is
 * being read as a partition rather than a picture.
 */
export function resolveFill(o, render) {
  if (!render || render.colorMode !== "owner") return o.fill;
  if (!o.owner) return "#e9edf1";
  const c = render.ownerColors && render.ownerColors.get(o.owner);
  return c || o.fill;
}

export default function MapObject({ o, isSelected, onRef, handlers, flags, render }) {
  const visible = flags ? flags.visible : o.visible;
  const locked = flags ? flags.locked : o.locked;
  if (!visible) return null;

  const interactive = !locked;
  const shared = {
    id: o.id,
    name: "map-object",
    x: o.x,
    y: o.y,
    rotation: o.rotation,
    opacity: o.opacity,
    draggable: interactive,
    listening: interactive,
    ref: (node) => onRef(o.id, node),
    ...handlers
  };

  if (o.type === "text") {
    return (
      <Text
        {...shared}
        text={o.label || " "}
        fontSize={o.fontSize}
        fill={o.fill}
        stroke={isSelected ? SELECT_STROKE : undefined}
        strokeWidth={isSelected ? 0.6 : 0}
      />
    );
  }

  if (o.type === "line") {
    return (
      <Line
        {...shared}
        points={o.points}
        stroke={isSelected ? SELECT_STROKE : o.stroke}
        strokeWidth={o.strokeWidth}
        dash={o.dash ? [10, 7] : undefined}
        lineCap="round"
        hitStrokeWidth={Math.max(14, o.strokeWidth + 12)}
      />
    );
  }

  if (o.type === "polygon") {
    const b = polygonBounds(o.points);
    return (
      <Group {...shared}>
        <PolygonBody o={o} fill={resolveFill(o, render)} />
        {isSelected ? (
          <Line
            points={o.points}
            closed
            stroke={SELECT_STROKE}
            strokeWidth={2}
            dash={[6, 4]}
            listening={false}
            x={0}
            y={0}
          />
        ) : null}
        {isSelected && b.w === 0 ? null : null}
      </Group>
    );
  }

  if (o.type === "dimension") {
    return (
      <Group {...shared}>
        <DimensionBody o={isSelected ? { ...o, stroke: SELECT_STROKE } : o} scale={render && render.scale} />
      </Group>
    );
  }

  const Body = BODIES[o.type];
  if (!Body) return null;

  return (
    <Group {...shared}>
      <Body o={{ ...o, fill: resolveFill(o, render) }} />
      {isSelected ? (
        <Rect
          x={-2}
          y={-2}
          width={o.w + 4}
          height={o.h + 4}
          stroke={SELECT_STROKE}
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
        />
      ) : null}
    </Group>
  );
}

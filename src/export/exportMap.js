// Export composition. Renders the document onto a detached Konva stage sized to
// the map's own bounds, adds a title block, and writes out PNG or PDF. Kept
// away from the editor's stage so exports never depend on the current zoom,
// pan, selection or which layers happen to be hidden on screen.

import Konva from "konva";
import { orderedObjects, effectiveFlags, areaByOwner } from "../model/document.js";
import { boundsOf } from "../model/objects.js";
import { formatArea, formatFeet, toFeet } from "../model/geometry.js";
import { documentExtent } from "../model/transforms.js";

const MARGIN = 40;
const TITLE_H = 96;

function ownerFill(o, doc, colorMode) {
  if (colorMode !== "owner") return o.fill;
  if (!o.owner) return "#e9edf1";
  const owner = doc.owners.find((w) => w.id === o.owner);
  return owner ? owner.color : o.fill;
}

/**
 * Rebuild the map with plain Konva rather than reusing the React components:
 * the export needs no interactivity, and this keeps it independent of the
 * editor's render tree.
 */
function drawObjects(layer, doc, colorMode) {
  for (const o of orderedObjects(doc)) {
    const flags = effectiveFlags(doc, o);
    if (!flags.visible) continue;
    const group = new Konva.Group({ x: o.x, y: o.y, rotation: o.rotation, opacity: o.opacity });

    if (o.type === "text") {
      group.add(new Konva.Text({ text: o.label || "", fontSize: o.fontSize, fill: o.fill }));
    } else if (o.type === "line") {
      group.add(new Konva.Line({
        points: o.points, stroke: o.stroke, strokeWidth: o.strokeWidth,
        dash: o.dash ? [10, 7] : undefined, lineCap: "round"
      }));
    } else if (o.type === "polygon") {
      group.add(new Konva.Line({
        points: o.points, closed: true, fill: ownerFill(o, doc, colorMode),
        stroke: o.stroke, strokeWidth: o.strokeWidth
      }));
      if (o.showLabel && o.label) {
        const b = boundsOf(o);
        group.add(new Konva.Text({
          text: o.label, x: b.x - o.x + 6, y: b.y - o.y, width: Math.max(1, b.w - 12), height: b.h,
          align: "center", verticalAlign: "middle", wrap: "word", ellipsis: true,
          fontSize: o.fontSize, fill: "#17202a"
        }));
      }
    } else if (o.type === "dimension") {
      drawDimension(group, o, doc.scale);
    } else {
      group.add(new Konva.Rect({
        width: o.w, height: o.h, fill: ownerFill(o, doc, colorMode),
        stroke: o.stroke, strokeWidth: o.strokeWidth
      }));
      if (o.type === "rect" && o.showLabel && o.label) {
        group.add(new Konva.Text({
          text: o.label, x: 6, y: 0, width: Math.max(1, o.w - 12), height: o.h,
          align: "center", verticalAlign: "middle", wrap: "word", ellipsis: true,
          fontSize: o.fontSize, fill: "#17202a"
        }));
      }
    }
    layer.add(group);
  }
}

function drawDimension(group, o, scale) {
  const [x1, y1, x2, y2] = o.points;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = o.offset || 0;
  const a = { x: x1 + nx * off, y: y1 + ny * off };
  const b = { x: x2 + nx * off, y: y2 + ny * off };
  group.add(new Konva.Line({ points: [x1, y1, a.x, a.y], stroke: o.stroke, strokeWidth: 1, dash: [3, 3] }));
  group.add(new Konva.Line({ points: [x2, y2, b.x, b.y], stroke: o.stroke, strokeWidth: 1, dash: [3, 3] }));
  group.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: o.stroke, strokeWidth: o.strokeWidth }));

  const upf = scale && scale.unitsPerFoot;
  const text = upf ? formatFeet(len / upf, scale.feetNotation) : o.label || "";
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const w = Math.max(60, text.length * o.fontSize * 0.6);
  group.add(new Konva.Text({
    text, x: (a.x + b.x) / 2 - w / 2, y: (a.y + b.y) / 2 - o.fontSize - 3,
    width: w, align: "center", rotation: angle, fontSize: o.fontSize, fill: o.stroke
  }));
}

/** Title, date, scale bar, north arrow and owner legend along the top. */
function drawTitleBlock(layer, doc, width, colorMode) {
  layer.add(new Konva.Rect({ x: 0, y: 0, width, height: TITLE_H, fill: "#ffffff" }));
  layer.add(new Konva.Line({ points: [0, TITLE_H, width, TITLE_H], stroke: "#c5cbd1", strokeWidth: 1 }));
  layer.add(new Konva.Text({ text: doc.title || "Property Map", x: MARGIN, y: 18, fontSize: 24, fontStyle: "bold", fill: "#17202a" }));
  layer.add(new Konva.Text({
    text: new Date().toLocaleDateString(),
    x: MARGIN, y: 50, fontSize: 13, fill: "#697580"
  }));

  const upf = doc.scale.unitsPerFoot;
  if (upf) {
    // A 10 ft bar drawn at true scale, so a print can be measured with a ruler.
    const barFt = 10;
    const barW = barFt * upf;
    const bx = MARGIN + 150;
    layer.add(new Konva.Rect({ x: bx, y: 54, width: barW, height: 8, fill: "#17202a" }));
    layer.add(new Konva.Rect({ x: bx, y: 54, width: barW / 2, height: 8, fill: "#ffffff", stroke: "#17202a", strokeWidth: 1 }));
    layer.add(new Konva.Text({ text: `0`, x: bx - 4, y: 66, fontSize: 11, fill: "#17202a" }));
    layer.add(new Konva.Text({ text: `${barFt} ft`, x: bx + barW - 10, y: 66, fontSize: 11, fill: "#17202a" }));
    layer.add(new Konva.Text({ text: `Scale 1 ft = ${Math.round(upf)} units`, x: bx, y: 34, fontSize: 12, fill: "#697580" }));
  } else {
    layer.add(new Konva.Text({ text: "Not to scale", x: MARGIN + 150, y: 50, fontSize: 13, fill: "#a11" }));
  }

  // North arrow
  const nx = width - MARGIN - 20;
  layer.add(new Konva.Line({ points: [nx, 62, nx, 22], stroke: "#17202a", strokeWidth: 2 }));
  layer.add(new Konva.Line({ points: [nx - 6, 32, nx, 22, nx + 6, 32], stroke: "#17202a", strokeWidth: 2 }));
  layer.add(new Konva.Text({ text: "N", x: nx - 4, y: 64, fontSize: 13, fontStyle: "bold", fill: "#17202a" }));

  // Legend
  const { totals, calibrated } = areaByOwner(doc);
  let lx = MARGIN + 150 + 260;
  for (const owner of doc.owners) {
    const sqft = totals.get(owner.id) || 0;
    if (!sqft && colorMode !== "owner") continue;
    layer.add(new Konva.Rect({ x: lx, y: 26, width: 14, height: 14, fill: owner.color, stroke: "#8a929a", strokeWidth: 1 }));
    layer.add(new Konva.Text({ text: owner.name, x: lx + 20, y: 27, fontSize: 12, fill: "#17202a" }));
    layer.add(new Konva.Text({
      text: calibrated ? formatArea(sqft) : "",
      x: lx + 20, y: 42, fontSize: 11, fill: "#697580"
    }));
    lx += 130;
    if (lx > width - MARGIN - 60) break;
  }
}

/** Build a detached stage holding the finished sheet. */
function composeStage(doc, colorMode) {
  const ext = documentExtent(doc);
  const width = Math.max(400, Math.ceil(ext.w) + MARGIN * 2);
  const height = Math.max(300, Math.ceil(ext.h) + MARGIN * 2 + TITLE_H);

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-100000px";
  document.body.appendChild(container);

  const stage = new Konva.Stage({ container, width, height });
  const bg = new Konva.Layer();
  bg.add(new Konva.Rect({ x: 0, y: 0, width, height, fill: "#ffffff" }));
  stage.add(bg);

  const mapLayer = new Konva.Layer({ x: MARGIN - ext.x, y: MARGIN + TITLE_H - ext.y });
  drawObjects(mapLayer, doc, colorMode);
  stage.add(mapLayer);

  const chrome = new Konva.Layer();
  drawTitleBlock(chrome, doc, width, colorMode);
  stage.add(chrome);
  stage.draw();

  return { stage, container, width, height, extent: ext };
}

function destroy(stage, container) {
  stage.destroy();
  container.remove();
}

function download(dataURL, filename) {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportPNG(doc, { pixelRatio = 2, colorMode = "natural" } = {}) {
  const { stage, container } = composeStage(doc, colorMode);
  try {
    download(stage.toDataURL({ pixelRatio }), `${(doc.title || "property-map").replace(/\s+/g, "-").toLowerCase()}.png`);
  } finally {
    destroy(stage, container);
  }
}

/**
 * PDF at true scale where it fits: the sheet is placed so that one drawn foot
 * measures one real foot at the chosen output scale, falling back to
 * fit-to-page when the map is larger than the sheet.
 */
export async function exportPDF(doc, { colorMode = "natural", format = "a3" } = {}) {
  const { jsPDF } = await import("jspdf");
  const { stage, container, width, height } = composeStage(doc, colorMode);
  try {
    const orientation = width >= height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "pt", format });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const fit = Math.min(pageW / width, pageH / height);
    const w = width * fit;
    const h = height * fit;
    const data = stage.toDataURL({ pixelRatio: Math.min(3, Math.max(2, 1 / fit)) });
    pdf.addImage(data, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);

    const upf = doc.scale.unitsPerFoot;
    if (upf) {
      // Record the achieved paper scale so a printed copy can be checked.
      const ftPerPt = 1 / (upf * fit);
      pdf.setFontSize(8);
      pdf.text(`1 pt = ${ftPerPt.toFixed(3)} ft · printed at ${(fit * 100).toFixed(1)}% of composition`, 20, pageH - 12);
    }
    pdf.save(`${(doc.title || "property-map").replace(/\s+/g, "-").toLowerCase()}.pdf`);
  } finally {
    destroy(stage, container);
  }
}

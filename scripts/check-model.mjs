// Node-side checks for the document model. Covers the v1 edge cases plus the
// v3 types (polygon, dimension) and the v1 → v2 → v3 migration chain.

import { applyFeetNotation, defaultDocument, migrateDocument, normalizeDocument } from "../src/model/document.js";
import { areaOf, dimensionLength, normalize, normalizeAll } from "../src/model/objects.js";
import { formatFeet, parseFeet, pointInPolygon, polygonArea, simplify, toSquareFeet } from "../src/model/geometry.js";
import { blockResiduals, calibrateFrom, planUnsquash } from "../src/model/transforms.js";

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log("  ok  " + name);
  else {
    failed++;
    console.error("  FAIL  " + name + (extra ? " — " + extra : ""));
  }
}

console.log("garbage payloads");
check("null", migrateDocument(null) === null);
check("string", migrateDocument("nope") === null);
check("empty object", migrateDocument({}) === null);
check("empty array", migrateDocument([]) === null || migrateDocument([]).objects.length >= 2);
check("NaN geometry dropped to defaults", (() => {
  const o = normalize({ type: "rect", x: NaN, w: "no", h: Infinity, fill: 3 });
  return o && Number.isFinite(o.x) && o.w >= 8 && o.h >= 8 && typeof o.fill === "string";
})());
check("unknown type dropped", normalize({ type: "spaceship" }) === null);
check("duplicate ids rewritten", (() => {
  const list = normalizeAll([
    { id: "a", type: "rect", w: 20, h: 20 },
    { id: "a", type: "rect", w: 20, h: 20 }
  ]);
  return list.length === 2 && list[0].id !== list[1].id;
})());

console.log("polygon + dimension + freehand simplify");
check("shoelace 20×20 square", polygonArea([0, 0, 20, 0, 20, 20, 0, 20]) === 400);
check("point in polygon", pointInPolygon([0, 0, 20, 0, 20, 20, 0, 20], 10, 10));
check("point outside polygon", !pointInPolygon([0, 0, 20, 0, 20, 20, 0, 20], 30, 10));
check("normalize polygon", (() => {
  const o = normalize({ type: "polygon", points: [0, 0, 10, 0, 10, 10] });
  return o && o.points.length === 6 && o.layer === "buildings";
})());
check("normalize dimension", (() => {
  const o = normalize({ type: "dimension", points: [0, 0, 100, 0], realFt: 10 });
  return o && o.type === "dimension" && o.realFt === 10 && o.points.length === 4;
})());
check("areaOf polygon", areaOf({ type: "polygon", points: [0, 0, 40, 0, 40, 20, 0, 20] }) === 800);
check("areaOf dimension is 0", areaOf({ type: "dimension", points: [0, 0, 100, 0] }) === 0);
check("RDP reduces a dense line", simplify([0, 0, 1, 0.01, 2, -0.01, 3, 0.02, 10, 0], 0.5).length < 10);
check("garbage polygon falls back", normalize({ type: "polygon", points: [1] }).points.length >= 6);

console.log("units");
check("30 ft", parseFeet("30 ft") === 30);
check("29.10 decimal", parseFeet("29.10") === 29.1);
check("29.10 as ft-in", Math.abs(parseFeet("29.10", true) - (29 + 10 / 12)) < 1e-9);
check("29' 10\"", Math.abs(parseFeet("29' 10\"") - (29 + 10 / 12)) < 1e-9);
check("format ft-in", formatFeet(29 + 10 / 12, "ftin") === "29' 10\"");
check("400 sq ft from 20 u/ft", toSquareFeet(20 * 20 * 20 * 20, 20) === 400);

console.log("migration v1 → v3");
const v1 = migrateDocument([
  { id: "room", type: "rect", x: 10, y: 10, w: 40, h: 40, label: "Room" },
  { id: "dim30", type: "line", x: 0, y: 0, points: [0, 0, 605, 0], label: "30 ft" }
]);
check("version 3", v1 && v1.version === 3);
check("layers present", v1 && v1.layers.length >= 6);
check("owners roster present, objects unassigned", v1 && v1.owners.length >= 1 && v1.objects.every((o) => o.owner == null));
check("line became dimension", v1 && v1.objects.some((o) => o.id === "dim30" && o.type === "dimension" && o.realFt === 30));
check("v1 objects still there", v1 && v1.objects.some((o) => o.id === "room"));

console.log("migration v2 → v3");
const v2 = migrateDocument({
  version: 2,
  objects: [
    { id: "bg-sheet", type: "rect", x: 0, y: 0, w: 100, h: 100, label: "Sheet" },
    { id: "dim39", type: "line", x: 0, y: 0, points: [0, 0, 0, 185], label: "39 ft" },
    { id: "road1", type: "rect", x: 0, y: 0, w: 10, h: 80, label: "8.5 ft Road" }
  ]
});
check("v2 version 3", v2 && v2.version === 3);
check("v2 dim converted", v2 && v2.objects.some((o) => o.id === "dim39" && o.type === "dimension" && o.realFt === 39));
check("road layer heuristic", v2 && v2.objects.find((o) => o.id === "road1").layer === "roads");

console.log("already-v3 roundtrip");
const fresh = defaultDocument();
const again = migrateDocument(JSON.parse(JSON.stringify(fresh)));
check("default is v3", fresh.version === 3);
check("roundtrip object count", again.objects.length === fresh.objects.length);
check("four survey dimensions", fresh.objects.filter((o) => o.type === "dimension").length >= 4);

console.log("scale + unsquash");
const seeded = normalizeDocument({
  ...fresh,
  objects: fresh.objects.map((o) => {
    if (o.id === "dim30") return { ...o, realFt: 30 };
    if (o.id === "dim39") return { ...o, realFt: 39 };
    if (o.id === "dim2910") return { ...o, realFt: 29.1 };
    if (o.id === "dim4210") return { ...o, realFt: 42.1 };
    return o;
  })
});
const plan = planUnsquash(seeded);
check("unsquash is possible", plan.ok === true);
check("squash factor around 3×", plan.ok && plan.factor > 2 && plan.factor < 5);
const calibrated = calibrateFrom(seeded, "dim30", 30);
check("calibrate sets unitsPerFoot", calibrated.scale.unitsPerFoot > 0);
check("dim30 length / 30 matches scale", Math.abs(dimensionLength(calibrated.objects.find((o) => o.id === "dim30")) / 30 - calibrated.scale.unitsPerFoot) < 1e-3);
const withScale = { ...calibrated, objects: calibrated.objects.map((o) => (o.id === "room" || o.label === "Room" ? o : o)) };
check("block residuals is an array", Array.isArray(blockResiduals(calibrated)));
check("notation reparse 29.10 as inches", (() => {
  const next = applyFeetNotation(seeded, "ftin");
  const dim = next.objects.find((o) => o.id === "dim2910");
  return dim && Math.abs(dim.realFt - (29 + 10 / 12)) < 1e-6;
})());

if (failed) {
  console.error("\n" + failed + " check(s) failed");
  process.exit(1);
}
console.log("\nall checks passed");

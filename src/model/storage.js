import { DOC_VERSION, migrateDocument, normalizeDocument } from "./document.js";

export const STORAGE_KEY = "property-map-react";

/** Returns a migrated v3 document, or null when there is nothing usable stored. */
export function loadDocument() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const doc = migrateDocument(JSON.parse(raw));
    return doc && doc.objects.length ? doc : null;
  } catch (err) {
    // Never let corrupt storage brick the editor: fall back to defaults and
    // leave the bad payload aside so it can be inspected.
    console.warn("Could not read saved map, falling back to defaults.", err);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY + ":corrupt", raw);
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return null;
  }
}

export function saveDocument(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err && err.name === "QuotaExceededError"
          ? "Browser storage is full."
          : "Could not save to this browser."
    };
  }
}

export function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Validate imported text before it is allowed anywhere near the renderer. */
export function parseImport(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const source = Array.isArray(payload) ? payload : payload && payload.objects;
  if (!Array.isArray(source) || !source.length) {
    return { ok: false, error: "Expected a map file: an array of objects, or { version, objects }." };
  }
  const doc = migrateDocument(payload);
  if (!doc) return { ok: false, error: "Expected a map file: an array of objects, or { version, objects }." };
  if (!doc.objects.length) return { ok: false, error: "That file contains no objects this editor can draw." };
  return { ok: true, doc };
}

export function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDocument(doc, filename = "property-map.json") {
  downloadJSON(normalizeDocument({ ...doc, version: DOC_VERSION }), filename);
}

/** Timestamped safety copy, written before any bulk transform of the map. */
export function backupDocument(doc, reason = "backup") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadJSON(doc, `property-map-${reason}-${stamp}.json`);
}

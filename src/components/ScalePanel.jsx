import React, { useState } from "react";
import { impliedScales } from "../model/document.js";
import { formatFeet, parseFeet, round } from "../model/geometry.js";
import { calibrateFrom, normalizeScaleTo, residualError } from "../model/transforms.js";
import { dimensionLength } from "../model/objects.js";

/**
 * Everything about turning the drawing into a measurable plan: what scale the
 * dimensions imply, whether the drawing is squashed, and which parts still
 * disagree with the survey.
 */
export default function ScalePanel({ doc, onCommit, onUnsquash, onSelect, onFlash }) {
  const [draft, setDraft] = useState("");
  const [pick, setPick] = useState("");
  const scale = doc.scale;
  const implied = impliedScales(doc);
  const residual = residualError(doc);
  const dims = doc.objects.filter((o) => o.type === "dimension");
  const dotted = scale.feetNotation === "ftin";

  const applyCalibration = () => {
    const ft = parseFeet(draft, dotted);
    if (!pick || ft === null || ft <= 0) {
      onFlash("Pick a dimension and enter its real length (e.g. 30, or 29' 10\").", 4000);
      return;
    }
    onCommit((d) => calibrateFrom(d, pick, ft));
    onFlash(`Scale set from ${pick}`, 2500);
  };

  return (
    <section className="panelSection">
      <div className="panelHead">
        <h3>Scale</h3>
      </div>

      <div className="totalRow strong">
        <span>Units per foot</span>
        <span>{scale.unitsPerFoot ? round(scale.unitsPerFoot, 3) : "not set"}</span>
      </div>

      <label className="field">
        <span>How "29.10" should be read</span>
        <select
          value={scale.feetNotation}
          onChange={(e) =>
            onCommit((d) => ({ ...d, scale: { ...d.scale, feetNotation: e.target.value } }))
          }
        >
          <option value="decimal">29.10 = 29.1 feet (decimal)</option>
          <option value="ftin">29.10 = 29 feet 10 inches</option>
        </select>
      </label>

      <h4>1 · Calibrate</h4>
      <p className="muted">Pick a dimension you trust and type its real length.</p>
      <label className="field">
        <span>Dimension</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose…</option>
          {dims.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label || d.id} — {Math.round(dimensionLength(d))} units
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Real length</span>
        <input
          value={draft}
          placeholder={dotted ? "29' 10\"" : "30"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyCalibration()}
        />
      </label>
      <div className="btnRow">
        <button onClick={applyCalibration}>Set scale</button>
        <button
          disabled={!scale.unitsPerFoot}
          title="Rescale the drawing so one foot is a round 20 units"
          onClick={() => {
            onCommit((d) => normalizeScaleTo(d, 20));
            onFlash("Drawing rescaled to 20 units per foot", 2500);
          }}
        >
          Round to 20 u/ft
        </button>
      </div>

      <h4>2 · Squash check</h4>
      {implied.squashFactor ? (
        <>
          <div className="totalRow">
            <span>Horizontal</span>
            <span>{round(implied.horizontalMean, 2)} u/ft</span>
          </div>
          <div className="totalRow">
            <span>Vertical</span>
            <span>{round(implied.verticalMean, 2)} u/ft</span>
          </div>
          <div className="totalRow strong">
            <span>Squashed by</span>
            <span>{round(implied.squashFactor, 3)}×</span>
          </div>
          {Math.abs(implied.squashFactor - 1) < 0.05 ? (
            <p className="ok">Both axes agree — the drawing is proportional.</p>
          ) : (
            <>
              <p className="warn">
                The drawing is {round(implied.squashFactor, 2)}× compressed vertically, so areas cannot
                be trusted yet.
              </p>
              <div className="btnRow">
                <button onClick={onUnsquash}>Preview correction…</button>
              </div>
            </>
          )}
        </>
      ) : (
        <p className="muted">
          Needs at least one horizontal and one vertical dimension with a real length.
        </p>
      )}

      <h4>3 · Remaining error</h4>
      {!scale.unitsPerFoot ? (
        <p className="muted">Set a scale to compare each dimension against the drawing.</p>
      ) : residual.length === 0 ? (
        <p className="muted">No dimensions carry a surveyed length yet.</p>
      ) : (
        <ul className="rowList">
          {residual.map((r) => (
            <li key={r.id}>
              <button className="rowMain" onClick={() => onSelect(r.id)}>
                <span className="rowLabel">{r.label || r.id}</span>
                <span className="rowType">
                  {formatFeet(r.realFt, scale.feetNotation)} vs {formatFeet(r.drawnFt, scale.feetNotation)}
                </span>
              </button>
              <span className={"errBadge" + (Math.abs(r.errorPct) > 5 ? " bad" : "")}>
                {r.errorPct > 0 ? "+" : ""}{r.errorPct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

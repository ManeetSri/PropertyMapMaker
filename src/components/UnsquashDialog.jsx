import React from "react";
import { round } from "../model/geometry.js";

function Preview({ extent, label }) {
  // Normalised thumbnail so the before/after proportions can be compared at a
  // glance — this transform changes the whole shape of the sheet.
  const maxH = 120;
  const ratio = extent.h > 0 ? extent.w / extent.h : 1;
  const h = maxH;
  const w = Math.max(6, Math.min(150, h * ratio));
  return (
    <figure className="previewBox">
      <div className="previewShape" style={{ width: w, height: h }} />
      <figcaption>
        {label}
        <br />
        {Math.round(extent.w)} × {Math.round(extent.h)} units
      </figcaption>
    </figure>
  );
}

export default function UnsquashDialog({ plan, onApply, onCancel }) {
  const worst = plan.residual.length ? Math.max(...plan.residual.map((r) => Math.abs(r.errorPct))) : 0;
  return (
    <div className="modalBackdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Correct the vertical squash</h2>
        <p>
          The dimensions imply <strong>{round(plan.implied.horizontalMean, 2)} units/ft</strong> across
          and <strong>{round(plan.implied.verticalMean, 2)} units/ft</strong> down. Every Y coordinate
          and height will be multiplied by <strong>{round(plan.factor, 3)}×</strong> so both axes agree.
        </p>

        <div className="previewRow">
          <Preview extent={plan.before} label="Now" />
          <span className="previewArrow">→</span>
          <Preview extent={plan.after} label="After" />
        </div>

        <p className="muted">
          The plot is genuinely long and narrow, so the corrected map is portrait. Scale becomes{" "}
          {round(plan.unitsPerFoot, 2)} units/ft.
        </p>

        <p className={worst > 5 ? "warn" : "ok"}>
          Afterwards the dimensions still disagree with the drawing by up to {round(worst, 1)}% — those
          blocks need correcting individually, listed under Scale → Remaining error.
        </p>

        <p className="muted">
          A backup JSON downloads first, and this counts as a single step, so one Ctrl+Z undoes it.
        </p>

        <div className="btnRow">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onApply}>Back up and apply</button>
        </div>
      </div>
    </div>
  );
}

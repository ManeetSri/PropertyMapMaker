import React, { useEffect, useState } from "react";

/**
 * A number input that keeps a draft string while you type, so clearing the
 * field cannot write 0 into the model and delete the shape. The value is only
 * committed (and clamped) on blur or Enter.
 */
export default function NumberField({ label, value, min, max, step = 1, onCommit }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(Math.round(value * 100) / 100));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const n = parseFloat(draft);
    if (!Number.isFinite(n)) {
      setDraft(String(Math.round(value * 100) / 100));
      return;
    }
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
          e.stopPropagation();
        }}
      />
    </label>
  );
}

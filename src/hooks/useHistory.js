import { useCallback, useRef, useState } from "react";

const LIMIT = 120;
const COALESCE_MS = 600;

/**
 * Undo/redo around a single value.
 * `commit(updater, { coalesceKey })` merges rapid successive edits that share a
 * key (typing in a label, dragging a slider) into one history entry.
 */
export function useHistory(initial) {
  // `initial` may be a factory so storage is only read once, during the first render.
  const [state, setState] = useState(() => ({
    past: [],
    present: typeof initial === "function" ? initial() : initial,
    future: []
  }));
  const lastEdit = useRef({ key: null, at: 0 });

  const commit = useCallback((updater, opts = {}) => {
    const { coalesceKey = null } = opts;
    const now = Date.now();
    const merge =
      coalesceKey !== null &&
      lastEdit.current.key === coalesceKey &&
      now - lastEdit.current.at < COALESCE_MS;
    lastEdit.current = { key: coalesceKey, at: now };

    setState((s) => {
      const next = typeof updater === "function" ? updater(s.present) : updater;
      if (next === s.present) return s;
      if (merge) return { past: s.past, present: next, future: [] };
      const past = [...s.past, s.present].slice(-LIMIT);
      return { past, present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    lastEdit.current = { key: null, at: 0 };
    setState((s) => {
      if (!s.past.length) return s;
      const present = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present, future: [s.present, ...s.future].slice(0, LIMIT) };
    });
  }, []);

  const redo = useCallback(() => {
    lastEdit.current = { key: null, at: 0 };
    setState((s) => {
      if (!s.future.length) return s;
      return { past: [...s.past, s.present].slice(-LIMIT), present: s.future[0], future: s.future.slice(1) };
    });
  }, []);

  /** Replace the value and drop history (load, import, reset). */
  const reset = useCallback((value) => {
    lastEdit.current = { key: null, at: 0 };
    setState({ past: [], present: value, future: [] });
  }, []);

  return {
    present: state.present,
    commit,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0
  };
}

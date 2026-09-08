import { useEffect, useState } from "react";

/**
 * Measures the canvas container instead of trusting window.innerWidth and a
 * hardcoded toolbar height, so the Stage tracks a wrapping toolbar and any
 * window resize.
 */
export function useStageSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);

  return size;
}

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const TooltipContext = createContext(null);

/** One floating tooltip for the whole app, positioned near the pointer or focused element. */
export function TooltipProvider({ children }) {
  const [tip, setTip] = useState(null); // { x, y, content }
  const ref = useRef(null);

  const api = useMemo(() => ({
    show: (x, y, content) => setTip({ x, y, content }),
    hide: () => setTip(null),
  }), []);

  // Measure after render, before paint, so the tooltip never flashes off-screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!tip || !el) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.min(Math.max(8, tip.x - width / 2), window.innerWidth - width - 8)}px`;
    el.style.top = `${tip.y - height - 12 < 8 ? tip.y + 16 : tip.y - height - 12}px`;
  }, [tip]);

  // A tooltip anchored to something that scrolled away is misleading; drop it.
  useEffect(() => {
    if (!tip) return undefined;
    window.addEventListener('scroll', api.hide, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', api.hide, { capture: true });
  }, [tip, api]);

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {tip && (
        <div ref={ref} className="tooltip" role="tooltip">
          {tip.content}
        </div>
      )}
    </TooltipContext.Provider>
  );
}

export const useTooltip = () => useContext(TooltipContext);

/** Event props that show `content()` on hover and on keyboard focus. */
export function tipProps(tooltip, content) {
  return {
    onPointerEnter: (e) => tooltip.show(e.clientX, e.clientY, content()),
    onPointerMove: (e) => tooltip.show(e.clientX, e.clientY, content()),
    onPointerLeave: tooltip.hide,
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      tooltip.show(r.left + r.width / 2, r.top, content());
    },
    onBlur: tooltip.hide,
  };
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

const FOCUSABLE = 'button, [href], input, select, [tabindex="0"]';

/**
 * Side panel. Stays mounted so it can slide in and out; while closing it keeps showing
 * the last content. `panelKey` identifies what is shown - a new key scrolls back to top,
 * while a data refresh of the same panel keeps the scroll position.
 */
export function Drawer({ open, panelKey, header, children, onClose }) {
  const bodyRef = useRef(null);
  const closeRef = useRef(null);
  const returnFocusRef = useRef(null);
  const last = useRef({ header: null, children: null });
  if (open) last.current = { header, children };

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      closeRef.current?.focus({ preventScroll: true });
    } else if (returnFocusRef.current?.isConnected) {
      returnFocusRef.current.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
  }, [open]);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [panelKey]);

  // Keep keyboard focus inside the open drawer.
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = [...e.currentTarget.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const lastEl = focusables.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <aside
        className={`drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        aria-hidden={!open}
        inert={!open}
        onKeyDown={onKeyDown}
      >
        <header className="drawer-header">
          <div className="drawer-head">{last.current.header}</div>
          <button ref={closeRef} className="icon-btn" type="button" aria-label="Close panel" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className="drawer-body" ref={bodyRef}>{last.current.children}</div>
      </aside>
    </>
  );
}

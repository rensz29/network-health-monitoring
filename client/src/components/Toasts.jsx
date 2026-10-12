import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon, sevIcon } from './Icon.jsx';

const ToastContext = createContext(() => {});
const TOAST_MS = 8000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(({ level = 'info', title, detail }) => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { id, level, title, detail }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-sev={t.level} role="status">
            <Icon name={sevIcon(t.level)} />
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.detail && <span>{t.detail}</span>}
            </div>
            <button className="icon-btn sm" type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

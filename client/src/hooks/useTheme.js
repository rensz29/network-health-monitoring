import { useEffect, useState } from 'react';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Light/dark theme: follows the OS until the user picks one, which is then remembered. */
export function useTheme() {
  const [chosen, setChosen] = useState(() => document.documentElement.dataset.theme ?? null);
  const [systemDark, setSystemDark] = useState(() => query().matches);

  useEffect(() => {
    const mq = query();
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = chosen ?? (systemDark ? 'dark' : 'light');

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('nh-theme', next);
    } catch {
      // Storage may be unavailable (private mode); the toggle still works for this visit.
    }
    setChosen(next);
  };

  return { theme, toggle };
}

import { useCallback, useEffect, useState } from 'react';

export const PAGES = { dashboard: '/', devices: '/devices' };

export const pageFor = (pathname) => (pathname.replace(/\/+$/, '') === PAGES.devices ? 'devices' : 'dashboard');

/** Minimal client-side router: two pages, real paths, browser back/forward supported. */
export function useRouter() {
  const [page, setPage] = useState(() => pageFor(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPage(pageFor(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to) => {
    if (pageFor(window.location.pathname) === to) return;
    window.history.pushState(null, '', PAGES[to]);
    setPage(to);
    window.scrollTo(0, 0);
  }, []);

  return { page, navigate };
}

/** Props for an <a> that navigates client-side but still supports open-in-new-tab. */
export function linkProps(to, navigate) {
  return {
    href: PAGES[to],
    onClick: (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}

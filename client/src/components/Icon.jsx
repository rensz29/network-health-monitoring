// Stroke icons on a 24px grid. Styling (stroke, size) comes from the .icon class.
const PATHS = {
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  'check-circle': <><circle cx="12" cy="12" r="9.5" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
  'alert-triangle': <><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  'x-octagon': <><path d="M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9l-5.4-5.4V7.9Z" /><path d="m15 9-6 6M9 9l6 6" /></>,
  info: <><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4.5" /><path d="M12 8h.01" /></>,
  refresh: <><path d="M20.5 12a8.5 8.5 0 0 1-14.7 5.8" /><path d="M3.5 12A8.5 8.5 0 0 1 18.2 6.2" /><path d="M18.5 2.5v4h-4" /><path d="M5.5 21.5v-4h4" /></>,
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 4.5v15l12-7.5Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.5-4.5" /></>,
  download: <><path d="M12 3.5v12M7 10.5l5 5 5-5" /><path d="M4 17.5v2a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-2" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  shield: <><path d="M12 21.5s7.5-3.2 7.5-9.5V5.5L12 2.5l-7.5 3V12c0 6.3 7.5 9.5 7.5 9.5Z" /><path d="m9 12 2 2 4-4" /></>,
  switch: <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><path d="M6.5 13.5v-3M10 13.5v-3M13.5 13.5v-3M17.5 10.5h.01M17.5 13.5h.01" /></>,
  devices: <><rect x="2.5" y="4" width="15" height="11" rx="1.5" /><path d="M6.5 19h7M10 15v4" /><rect x="18" y="9" width="4" height="10" rx="1" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></>,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  sort: <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />,
  'sort-asc': <path d="m8 14 4-4 4 4" />,
  'sort-desc': <path d="m8 10 4 4 4-4" />,
  clock: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></>,
  'minus-circle': <><circle cx="12" cy="12" r="9.5" /><path d="M8 12h8" /></>,
  dot: <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />,
  server: <><rect x="3" y="3.5" width="18" height="7" rx="1.5" /><rect x="3" y="13.5" width="18" height="7" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></>,
  windows: <><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1" /><rect x="13" y="13" width="7.5" height="7.5" rx="1" /></>,
  terminal: <><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="m7 10 3 2.5L7 15M12.5 15h4.5" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  maximize: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  minimize: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  pencil: <><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /><path d="m14.5 5.5 3 3" /></>,
};

export function Icon({ name, className = '' }) {
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

const SEV_ICON = { good: 'check-circle', warning: 'alert-triangle', critical: 'x-octagon', info: 'info' };
export const sevIcon = (level) => SEV_ICON[level] ?? 'info';

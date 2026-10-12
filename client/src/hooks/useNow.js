import { useEffect, useState } from 'react';

/** Current time, re-rendering the caller every `intervalMs` (for "updated 12s ago" labels). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

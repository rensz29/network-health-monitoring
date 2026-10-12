/** fetch() wrapper for the dashboard API: JSON in, JSON out, server error messages surfaced. */
export async function requestJson(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    // fall through to the status check
  }
  if (!res.ok) {
    const error = new Error(data?.error ?? `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

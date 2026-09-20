/**
 * Thin fetch wrapper for the admin API (JSON in/out, same-origin cookies).
 * Throws an Error whose `message`/`status` are safe to surface in the UI.
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body, headers = {} } = opts;
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (/json/.test(ct)) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = text ? { raw: text } : null;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.raw)) || `HTTP ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

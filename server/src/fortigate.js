import https from 'node:https';

const { FORTIGATE_HOST, FORTIGATE_TOKEN } = process.env;
const TIMEOUT_MS = Number(process.env.FORTIGATE_TIMEOUT_MS) || 15000;

if (!FORTIGATE_HOST || !FORTIGATE_TOKEN) {
  throw new Error('FORTIGATE_HOST and FORTIGATE_TOKEN must be set (see .env.example)');
}

const agent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: process.env.FORTIGATE_INSECURE_TLS !== 'true',
});

/**
 * GET a FortiOS REST endpoint and return its `results` payload.
 * @param {string} path  e.g. "monitor/network/arp"
 * @param {Record<string, string>} [query]
 */
export async function fgGet(path, query = {}) {
  return (await fgRequest(path, query)).results ?? [];
}

/**
 * GET a FortiOS REST endpoint and return the whole response envelope
 * (some fields, e.g. the FortiGate serial and version, live outside `results`).
 */
export function fgRequest(path, query = {}) {
  const url = new URL(`/api/v2/${path}`, `https://${FORTIGATE_HOST}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent,
        timeout: TIMEOUT_MS,
        headers: { Authorization: `Bearer ${FORTIGATE_TOKEN}`, Accept: 'application/json' },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`FortiGate ${path} returned HTTP ${res.statusCode}`));
          }
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            return reject(new Error(`FortiGate ${path} returned invalid JSON`));
          }
          if (json.status && json.status !== 'success') {
            return reject(new Error(`FortiGate ${path} returned status "${json.status}"`));
          }
          resolve(json);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`FortiGate ${path} timed out after ${TIMEOUT_MS} ms`)));
    req.on('error', reject);
  });
}

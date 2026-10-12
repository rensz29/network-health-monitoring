import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cached } from './cache.js';
import { deleteCustom, listCustom, upsertCustom, ValidationError } from './custom.js';
import { getDevices, isValidSwitchId } from './devices.js';
import { checkSoon, getHealthChecks, startMonitor } from './monitor.js';
import { getNetworkHealth } from './network.js';

const PORT = Number(process.env.PORT) || 3000;
// Each dashboard refresh fans out to several FortiGate endpoints; share results briefly.
const CACHE_TTL_MS = 10_000;
// In production the built React app is served from here; in development Vite serves it.
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

const app = express();
app.use(express.json({ limit: '16kb' }));
if (existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// GET /api/network   FortiGate + switch health, uplinks and active alerts
app.get('/api/network', async (req, res) => {
  res.json(await cached('network', CACHE_TTL_MS, getNetworkHealth));
});

// GET /api/devices                  every device on every FortiSwitch
// GET /api/devices?offSwitch=true   ...plus devices the FortiGate sees that are not behind a FortiSwitch
app.get('/api/devices', async (req, res) => {
  const includeOffSwitch = req.query.offSwitch === 'true';
  res.json(await cached(`devices:${includeOffSwitch}`, CACHE_TTL_MS, () => getDevices({ includeOffSwitch })));
});

// GET /api/switches/S148FNTF24001285/devices
app.get('/api/switches/:switchId/devices', async (req, res) => {
  const { switchId } = req.params;
  if (!isValidSwitchId(switchId)) {
    return res.status(400).json({ error: 'Invalid switch id' });
  }
  res.json(await cached(`devices:switch:${switchId}`, CACHE_TTL_MS, () => getDevices({ switchId })));
});

// GET    /api/custom-devices        every customised device (name, type, OS, IP, switch/port, notes)
// PUT    /api/custom-devices/:mac   create or replace the customisation for one MAC address
// DELETE /api/custom-devices/:mac   remove it (back to what the FortiGate detects)
app.get('/api/custom-devices', async (req, res) => {
  res.json({ devices: await listCustom() });
});
app.put('/api/custom-devices/:mac', async (req, res) => {
  res.json(await upsertCustom(req.params.mac, req.body));
  checkSoon(); // a new server or IP gets its first ping result right away
});
app.delete('/api/custom-devices/:mac', async (req, res) => {
  res.status((await deleteCustom(req.params.mac)) ? 204 : 404).end();
  checkSoon();
});

// GET /api/health-checks   latest ping result for every server the user added
app.get('/api/health-checks', (req, res) => {
  res.json(getHealthChecks());
});

// Client-side pages (e.g. /devices) all load the React app; it picks the page from the URL.
if (existsSync(CLIENT_DIST)) {
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile('index.html', { root: CLIENT_DIST }));
}

// Express 5 forwards rejected async handlers here.
// Bad input is the caller's fault (400, or the body parser's own status); anything else
// is an upstream failure, usually the FortiGate (502).
app.use((err, req, res, next) => {
  const status = err instanceof ValidationError ? 400 : err.status ?? 502;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

startMonitor();

app.listen(PORT, () => {
  console.log(`Network health API on http://localhost:${PORT}`);
  if (existsSync(CLIENT_DIST)) console.log(`Serving the dashboard from ${CLIENT_DIST}`);
});

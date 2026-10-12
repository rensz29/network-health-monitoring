// User customisations for devices (display name, server/device type, OS, IP, expected
// switch/port, notes), keyed by MAC address and stored in a JSON file next to the server.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidSwitchId } from './devices.js';

// CUSTOM_DEVICES_FILE lets a second instance (e.g. for testing) use its own file: the server
// keeps the store in memory, so two processes must never share one file.
const STORE = process.env.CUSTOM_DEVICES_FILE
  ? resolve(process.env.CUSTOM_DEVICES_FILE)
  : fileURLToPath(new URL('../data/custom-devices.json', import.meta.url));
const MAX_ENTRIES = 5000;
const KINDS = new Set(['server', 'device']);
const OS_CHOICES = new Set(['Windows', 'Linux', 'Other']);
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const PORT = /^[A-Za-z0-9_./-]{1,32}$/;

export class ValidationError extends Error {}

/** aa:bb:cc:dd:ee:ff, aa-bb-cc-dd-ee-ff, aabb.ccdd.eeff or aabbccddeeff -> aa:bb:cc:dd:ee:ff (or null). */
export function normalizeMac(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!/^[0-9a-f:.\-]+$/.test(raw)) return null;
  const hex = raw.replace(/[^0-9a-f]/g, '');
  return hex.length === 12 ? hex.match(/../g).join(':') : null;
}

function text(value, max, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return trimmed || null;
}

function oneOf(value, allowed, field) {
  if (value == null || value === '') return null;
  if (!allowed.has(value)) throw new ValidationError(`${field} must be one of: ${[...allowed].join(', ')}`);
  return value;
}

function clean(body) {
  const ip = text(body.ip, 15, 'IP address');
  if (ip && !IPV4.test(ip)) throw new ValidationError('IP address must be an IPv4 address like 10.156.116.176');
  const switchId = text(body.switchId, 64, 'Switch');
  if (switchId && !isValidSwitchId(switchId)) throw new ValidationError('Switch id may only contain letters, digits, - and _');
  const port = text(body.port, 32, 'Port');
  if (port && !PORT.test(port)) throw new ValidationError('Port may only contain letters, digits and . _ / -');
  return {
    name: text(body.name, 64, 'Name'),
    kind: oneOf(body.kind, KINDS, 'Type'),
    os: oneOf(body.os, OS_CHOICES, 'OS'),
    ip,
    switchId,
    port,
    notes: text(body.notes, 500, 'Notes'),
  };
}

// ---- Storage: one in-memory copy, read-modify-write serialised through a queue ----

let entries = null; // Map<mac, entry>
let queue = Promise.resolve();

async function load() {
  if (entries) return entries;
  try {
    const json = JSON.parse(await readFile(STORE, 'utf8'));
    entries = new Map(Object.entries(json.devices ?? {}));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Cannot read ${STORE}: ${err.message}`);
    entries = new Map();
  }
  return entries;
}

async function save(map) {
  await mkdir(dirname(STORE), { recursive: true });
  // Write a temp file and rename it over the store, so a crash never leaves it half-written.
  const tmp = `${STORE}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ version: 1, devices: Object.fromEntries(map) }, null, 2)}\n`);
  await rename(tmp, STORE);
}

/** Apply `change` to a copy of the store and persist it; concurrent requests run one at a time. */
function mutate(change) {
  const run = queue.then(async () => {
    const next = new Map(await load());
    const result = change(next);
    await save(next);
    entries = next;
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export async function listCustom() {
  return [...(await load()).entries()].map(([mac, entry]) => ({ mac, ...entry }));
}

export function upsertCustom(macInput, body) {
  const mac = normalizeMac(macInput);
  if (!mac) throw new ValidationError('Invalid MAC address');
  const fields = clean(body ?? {});
  return mutate((map) => {
    const previous = map.get(mac);
    if (!previous && map.size >= MAX_ENTRIES) throw new ValidationError(`At most ${MAX_ENTRIES} customised devices`);
    const now = new Date().toISOString();
    const entry = { ...fields, createdAt: previous?.createdAt ?? now, updatedAt: now };
    map.set(mac, entry);
    return { mac, ...entry };
  });
}

export function deleteCustom(macInput) {
  const mac = normalizeMac(macInput);
  if (!mac) throw new ValidationError('Invalid MAC address');
  return mutate((map) => map.delete(mac));
}

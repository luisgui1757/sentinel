import fs from 'node:fs';
import path from 'node:path';
import { fetchCatalog } from '../src/sync.js';

const debug = process.env.SYNC_DEBUG === '1';
const log = line => console.log(`[sync] ${line}`);
const started = Date.now();
if (debug) log(`env file: ${path.resolve('.env')}`);
const get = async route => {
  const headers = { authorization: `Bearer ${process.env.SUPPLIER_TOKEN}` };
  if (debug) log(`GET ${process.env.SUPPLIER_URL}${route}\n[sync]   authorization: ${headers.authorization}`);
  const response = await fetch(process.env.SUPPLIER_URL + route, { headers });
  return { status: response.status, items: response.ok ? await response.json() : [] };
};
const items = await fetchCatalog(get, log);
const file = path.resolve('data/catalog.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(items));
log(`wrote ${items.length} items to ${file}`);
log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s`);

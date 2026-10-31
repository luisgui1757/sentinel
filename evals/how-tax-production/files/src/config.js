import fs from 'node:fs';

const read = name => {
  const file = new URL(`../config/${name}`, import.meta.url);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
};

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base[key] ?? {}, value) : value;
  }
  return out;
}

const layers = ['app.json', 'overrides.json', `${process.env.NODE_ENV ?? 'development'}.json`];
export const config = layers.map(read).reduce(merge, {});

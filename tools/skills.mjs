#!/usr/bin/env node
// Copy optional skills with dependency closure and ownership-aware updates.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../skills/', import.meta.url));
const registryName = '.sentinel-skills.json';
const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const catalog = JSON.parse(await fs.readFile(path.join(source, 'catalog.json'), 'utf8'));
const help = `Install optional Sentinel skills. Requires Node.js 22.19 or newer.

node tools/skills.mjs --list
node tools/skills.mjs --host codex --target DIR --skills documents
node tools/skills.mjs --host claude --global --skills delivery,writing
node tools/skills.mjs --host kiro --global --check
node tools/skills.mjs --host copilot --target DIR --remove [--skills tldr]

Hosts: codex, claude, copilot, kiro. T3 uses its provider's host.
--skills accepts skill names or groups: delivery, documents, writing, all.
Dependencies are included. --dry-run previews without writing. --check verifies
installed bytes against this checkout. --remove preserves edited/unowned files
by refusing the operation. Without --skills, check/remove use installed roots.
Rules and hooks are not installed. Existing skills are never adopted silently.`;

async function stat(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function noLinks(file) {
  for (let cursor = path.resolve(file); ; cursor = path.dirname(cursor)) {
    const info = await stat(cursor);
    if (info?.isSymbolicLink()) throw new Error(`symlink in destination: ${cursor}; inspect it before installing`);
    if (cursor === path.dirname(cursor)) break;
  }
}
async function files(dir, prefix = '') {
  const info = await stat(dir);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`not a regular skill directory: ${dir}`);
  const result = {};
  for (const entry of (await fs.readdir(dir)).sort()) {
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const file = path.join(dir, entry);
    const item = await fs.lstat(file);
    if (item.isDirectory()) Object.assign(result, await files(file, rel));
    else if (item.isFile()) result[rel] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
    else throw new Error(`unsupported file type: ${file}`);
  }
  return result;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function closure(roots) {
  const result = new Set();
  function visit(name) {
    if (result.has(name)) return;
    const skill = catalog.skills[name];
    if (!validName.test(name) || !skill) throw new Error(`unknown skill: ${name}`);
    result.add(name);
    for (const dependency of skill.requires) visit(dependency);
  }
  roots.forEach(visit);
  return [...result].sort();
}
function expand(value) {
  const names = value.split(',');
  if (names.some(name => !name)) throw new Error('--skills needs names or groups');
  const roots = [...new Set(names.flatMap(name => catalog.groups[name] ?? [name]))].sort();
  closure(roots);
  return roots;
}
function validateRegistry(state) {
  if (state.schema_version !== 1 || !Array.isArray(state.roots) ||
      !state.skills || typeof state.skills !== 'object' || Array.isArray(state.skills)) {
    throw new Error('invalid ownership registry; inspect it before proceeding');
  }
  if (state.roots.some(name => typeof name !== 'string' || !validName.test(name) || !state.skills[name])) {
    throw new Error('invalid roots in ownership registry');
  }
  for (const [name, hashes] of Object.entries(state.skills)) {
    if (!validName.test(name) || !hashes || typeof hashes !== 'object' || Array.isArray(hashes)) {
      throw new Error('invalid skill in ownership registry');
    }
    for (const [file, digest] of Object.entries(hashes)) {
      if (file.includes('\\') || file.includes(':') || file.includes('\0') ||
          file.split('/').some(part => !part || part === '.' || part === '..') ||
          typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
        throw new Error('invalid file in ownership registry');
      }
    }
  }
  return state;
}
async function readRegistry(destination) {
  const file = path.join(destination, registryName);
  const info = await stat(file);
  if (!info) return { schema_version: 1, roots: [], skills: {} };
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('ownership registry is not a regular file');
  return validateRegistry(JSON.parse(await fs.readFile(file, 'utf8')));
}
function parse(argv) {
  const opts = { action: 'write', global: false, target: null, host: null, selection: null };
  const setAction = action => {
    if (opts.action !== 'write') throw new Error('choose one of --check, --remove or --dry-run');
    opts.action = action;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--global') opts.global = true;
    else if (arg === '--check') setAction('check');
    else if (arg === '--remove') setAction('remove');
    else if (arg === '--dry-run') setAction('dry');
    else if (['--host', '--target', '--skills'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      opts[{ '--host': 'host', '--target': 'target', '--skills': 'selection' }[arg]] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!['codex', 'claude', 'copilot', 'kiro'].includes(opts.host)) throw new Error('choose --host codex, claude, copilot or kiro');
  if (opts.global && opts.target) throw new Error('--global and --target are mutually exclusive');
  return opts;
}
async function destinationFor(opts) {
  const profile = await fs.realpath(process.env.HOME || process.env.USERPROFILE || os.homedir());
  const project = opts.global ? null : await fs.realpath(opts.target || process.cwd());
  const projectPaths = { codex: '.agents/skills', claude: '.claude/skills', copilot: '.agents/skills', kiro: '.kiro/skills' };
  const globalPaths = { codex: path.join(profile, '.agents/skills'),
    claude: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(profile, '.claude'), 'skills'),
    copilot: path.join(profile, '.agents/skills'), kiro: path.join(profile, '.kiro/skills') };
  return opts.global ? path.resolve(globalPaths[opts.host]) : path.join(project, projectPaths[opts.host]);
}
async function plan(opts, destination) {
  await noLinks(destination);
  const current = await readRegistry(destination);
  const retired = current.roots.filter(name => !Object.hasOwn(catalog.skills, name));
  if (retired.length && (opts.action !== 'remove' || opts.selection)) {
    throw new Error(`retired command roots: ${retired.join(', ')}; run --remove without --skills, then install current commands. Edited files must be preserved first`);
  }
  const selected = opts.selection ? expand(opts.selection) : current.roots;
  if (opts.action === 'remove' && opts.selection) {
    for (const name of opts.selection.split(',').filter(name => !Object.hasOwn(catalog.groups, name))) {
      if (!current.roots.includes(name)) {
        const callers = current.roots.filter(root => closure([root]).includes(name));
        throw new Error(`${name} is not an installed root${callers.length ? `; still required by ${callers.join(', ')}` : ''}`);
      }
    }
  }
  if (!selected.length) throw new Error('select --skills names or a group; no managed roots are installed');
  const roots = opts.action === 'remove' ? current.roots.filter(name => !selected.includes(name)) :
    [...new Set([...current.roots, ...selected])].sort();
  const wanted = closure(roots);
  const next = { schema_version: 1, roots, skills: {} };
  const changes = [];
  // Validate every managed folder first. An update or uninstall cannot discard edits.
  for (const [name, hashes] of Object.entries(current.skills)) {
    const actual = await files(path.join(destination, name));
    if (!equal(actual, hashes)) throw new Error(`managed skill was edited: ${name}; preserve your changes before updating or removing`);
  }
  for (const name of wanted) {
    const target = path.join(destination, name);
    if (!current.skills[name] && await stat(target)) {
      const info = await fs.lstat(target);
      const detail = info.isSymbolicLink() ? ` -> ${await fs.readlink(target)}` : '';
      throw new Error(`unowned skill exists: ${target}${detail}; inspect and move it aside before installing`);
    }
    next.skills[name] = await files(path.join(source, name));
    if (!equal(current.skills[name], next.skills[name])) {
      if (opts.action === 'remove') throw new Error(`update remaining skills before partial removal: ${name}`);
      changes.push({ name, install: true });
    }
  }
  for (const name of Object.keys(current.skills).sort()) {
    if (!wanted.includes(name)) changes.push({ name, install: false });
  }
  return { current, next, changes };
}
async function apply(destination, planned) {
  const stage = path.join(destination, `.sentinel-stage-${randomUUID()}`);
  await fs.mkdir(stage);
  const moved = [];
  try {
    for (const change of planned.changes) {
      if (change.install) {
        const staged = path.join(stage, 'new', change.name);
        await fs.cp(path.join(source, change.name), staged, { recursive: true });
        if (!equal(await files(staged), planned.next.skills[change.name])) throw new Error(`source changed while copying: ${change.name}`);
      }
    }
    // Recheck after staging; refuse edits made since preflight.
    for (const [name, hashes] of Object.entries(planned.current.skills)) {
      if (!equal(await files(path.join(destination, name)), hashes)) throw new Error(`skill changed during installation: ${name}`);
    }
    for (const change of planned.changes) {
      const target = path.join(destination, change.name);
      const backup = path.join(stage, 'old', change.name);
      const existed = Boolean(planned.current.skills[change.name]);
      if (existed) { await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.rename(target, backup); }
      else if (await stat(target)) throw new Error(`destination appeared during installation: ${target}`);
      const step = { target, backup, existed, installed: false };
      moved.push(step);
      if (existed && !equal(await files(backup), planned.current.skills[change.name])) throw new Error(`skill changed before replacement: ${change.name}`);
      if (change.install) { await fs.rename(path.join(stage, 'new', change.name), target); step.installed = true; }
    }
    for (const [name, hashes] of Object.entries(planned.next.skills)) {
      if (!equal(await files(path.join(destination, name)), hashes)) throw new Error(`installed bytes differ: ${name}`);
    }
    const registry = path.join(stage, registryName);
    await fs.writeFile(registry, JSON.stringify(planned.next, null, 2) + '\n');
    await fs.rename(registry, path.join(destination, registryName));
  } catch (error) {
    try {
      for (const step of moved.reverse()) {
        if (step.installed) await fs.rm(step.target, { recursive: true });
        if (step.existed) await fs.rename(step.backup, step.target);
      }
    } catch (recovery) {
      throw new Error(`${error.message}; recovery failed: ${recovery.message}. Keep ${stage} and restore its old/ folders before retrying`);
    }
    await fs.rm(stage, { recursive: true });
    throw error;
  }
  await fs.rm(stage, { recursive: true });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return console.log(help);
  if (args.length === 1 && args[0] === '--list') {
    for (const [group, names] of Object.entries(catalog.groups)) console.log(`${group}: ${names.join(', ')}`);
    return;
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node.js 22.19 or newer is required');
  const opts = parse(args);
  if (!opts.global && !(await stat(path.resolve(opts.target || process.cwd())))?.isDirectory()) throw new Error('--target must be an existing directory');
  const destination = await destinationFor(opts);
  const initial = await plan(opts, destination);
  console.log(`Destination: ${destination}`);
  console.log(`Requested skills: ${initial.next.roots.join(', ') || 'none'}`);
  for (const change of initial.changes) console.log(`${change.install ? 'install/update' : 'remove'}: ${change.name}`);
  if (opts.action === 'check') {
    if (initial.changes.length || !equal(initial.current, initial.next)) throw new Error('skills are missing or out of date');
    return console.log('Skills match this checkout.');
  }
  if (opts.action === 'dry') return console.log('Preview only; no files written.');
  if (!initial.changes.length && equal(initial.current, initial.next)) return console.log('Skills already match.');
  await fs.mkdir(destination, { recursive: true });
  const lockPath = path.join(destination, '.sentinel-skills.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`another install or interrupted transaction owns ${lockPath}; inspect its PID and any .sentinel-stage-* backup before recovery`);
    throw error;
  }
  try {
    await lock.writeFile(`${process.pid}\n`);
    const latest = await plan(opts, destination);
    await apply(destination, latest);
    console.log('Skills updated. Start a new agent session to refresh discovery.');
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
try { await main(); }
catch (error) { console.error(`skills: ${error.message}`); process.exitCode = 1; }

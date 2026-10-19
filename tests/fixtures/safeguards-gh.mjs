// Stateful GitHub boundary for the real safeguards CLI. Never contacts GitHub.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = process.env.SAFEGUARDS_STATE;
const state = JSON.parse(fs.readFileSync(file));
function output(value, status = 0) {
  const text = value === undefined ? '' : JSON.stringify(value);
  const filter = args.indexOf('--jq');
  if (filter >= 0 && status === 0) {
    const result = spawnSync('jq', ['-r', args[filter + 1]], { input: text, encoding: 'utf8' });
    process.stdout.write(result.stdout);
    process.exit(result.status);
  }
  process.stdout.write(text);
  process.exit(status);
}
if (args[0] === 'auth' && args[1] === 'status') output();
if (args[0] === 'repo' && args[1] === 'view') {
  process.stdout.write('example/sentinel\n');
  process.exit(0);
}
if (args[0] !== 'api') throw new Error(`Unexpected command: ${args}`);
const methodIndex = args.indexOf('-X');
const method = methodIndex < 0 ? 'GET' : args[methodIndex + 1];
const endpoint = args.find(arg => arg.startsWith('repos/'));
if (!endpoint?.startsWith('repos/example/sentinel')) throw new Error(`Unexpected endpoint: ${endpoint}`);
const key = endpoint.slice('repos/example/sentinel'.length);
state.requests.push({ method, key });
const save = () => fs.writeFileSync(file, JSON.stringify(state));
save();
if (key === '/vulnerability-alerts' && method === 'GET' && state.alertsError) {
  output({ status: '503', message: 'Synthetic read failure' }, 1);
}
if (key === '/branches/main/protection') {
  const status = state.protectionError && state.values['/actions/permissions/workflow'].can_approve_pull_request_reviews ? 503 : 404;
  output({ status: String(status), message: 'Synthetic response' }, 1);
}
if (method === 'GET') {
  if (!Object.hasOwn(state.values, key)) throw new Error(`Unexpected read: ${key}`);
  output(state.values[key]);
}
if (method === 'PUT' && key === '/immutable-releases' && state.failWrite) {
  state.failWrite = false;
  save();
  output({ status: '503' }, 1);
}
if (args.includes('--input')) {
  const value = JSON.parse(fs.readFileSync(0, 'utf8'));
  state.values[key] = method === 'PATCH' ? { ...state.values[key], ...value,
    security_and_analysis: { ...state.values[key].security_and_analysis, ...value.security_and_analysis } } : value;
} else if (method === 'PUT' || method === 'DELETE') state.values[key] = { enabled: method === 'PUT' };
else throw new Error(`Unexpected write: ${method} ${key}`);
save();
output();

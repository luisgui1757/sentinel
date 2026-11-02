import { read, sh, tmp, check, report } from '../lib.mjs';

const probe = sh('env', ['PYTHONDONTWRITEBYTECODE=1', 'python3', '-c', `
import datetime, json, os, subprocess, sys
out = {}
def run(name, fn):
    try:
        out[name] = fn()
    except BaseException as error:
        out[name] = 'error: ' + type(error).__name__
import tally
run('summarize', lambda: tally.summarize([{'project': 'web', 'hours': '1.25'}, {'project': 'app', 'hours': '2'}, {'project': 'web', 'hours': '0.5'}]))
run('duration', lambda: tally.summarize([{'project': 'ops', 'duration': '3.5'}, {'project': 'ops', 'duration': '0.25'}]))
run('week_of', lambda: tally.week_of(datetime.date(2026, 11, 5)).isoformat())
files = {'new': 'project,hours\\nweb,1.25\\napp,2\\nweb,0.5\\n', 'old': 'project,duration\\nops,3.5\\nops,0.25\\n'}
for name, text in files.items():
    with open(os.path.join(sys.argv[1], name + '.csv'), 'w') as handle:
        handle.write(text)
def cli(name, *args):
    done = subprocess.run([sys.executable, '-m', 'tally', os.path.join(sys.argv[1], name + '.csv'), *args], capture_output=True, text=True)
    return [done.returncode, done.stdout, done.stderr]
for fmt in ('text', 'json', 'markdown'):
    out['cli_' + fmt] = cli('new', '--format', fmt)
out['cli_old'] = cli('old')
print(json.dumps(out))`, tmp]);
let out = {};
try { out = JSON.parse(probe.stdout); } catch {}
const detail = probe.stdout.trim() || probe.stderr.slice(0, 200);
const same = (value, expected) => JSON.stringify(value) === JSON.stringify(expected);
const stderr = '2 projects, 3.75h\n';
check('summarize keeps its result', same(out.summarize, { app: 2, web: 1.75 }), detail);
check('the duration column still loads', same(out.duration, { ops: 3.75 }) && same(out.cli_old, [0, 'ops: 3.75h\n', '1 projects, 3.75h\n']), detail);
check('week_of stays in the public API', out.week_of === '2026-11-02', detail);
check('each format still renders', same(out.cli_text, [0, 'app: 2.00h\nweb: 1.75h\n', stderr])
  && same(out.cli_json, [0, '{\n  "app": 2.0,\n  "web": 1.75\n}\n', stderr])
  && same(out.cli_markdown, [0, '| Project | Hours |\n| --- | --- |\n| app | 2.00h |\n| web | 1.75h |\n', stderr]), detail);
check('tests pass', sh('env', ['PYTHONDONTWRITEBYTECODE=1', 'python3', '-m', 'unittest']).status === 0);
check('removes summarize_v1', sh('git', ['grep', '-q', '--untracked', 'summarize_v1', '--', '*.py']).status === 1);
const definitions = sh('git', ['grep', '-h', '--untracked', '-E', '^[[:space:]]*def fmt_hours[[:space:]]*\\(', '--', '*.py']).stdout.split('\n').filter(Boolean).length;
check('removes the duplicate fmt_hours', definitions <= 1, `${definitions} definitions`);
check('removes the unused python-dateutil dependency', !/dateutil/.test(read('pyproject.toml') ?? ''));
report();

import fs from 'node:fs';

export function store() {
  return { me: 'patrol-bot', issues: [], notes: [], prs: [], labels: [], checks: [], pinned: [], calls: [], next: 1 };
}

const nextId = s => s.next++;
const issueOf = (s, id) => {
  const it = s.issues.find(i => i.id === Number(id));
  if (!it) throw new Error(`404 issue ${id}`);
  return it;
};
const prOf = (s, id) => {
  const pr = s.prs.find(p => p.id === Number(id));
  if (!pr) throw new Error(`404 pr ${id}`);
  return pr;
};

export const forgeStore = {
  addIssue(s, { title, body = '', labels = [], created = new Date(Date.UTC(2026, 0, s.next)).toISOString() }) {
    const it = { id: nextId(s), title, body, labels: [...labels], state: 'open', created };
    s.issues.push(it);
    return it;
  },
  addPr(s, { branch, head, state = 'open' }) {
    const pr = { id: nextId(s), branch, head, state, updated: '2026-11-06T10:00:00Z' };
    s.prs.push(pr);
    return pr;
  },
  setCheck(s, sha, name, result) {
    s.checks.push({ sha, name, result });
  },
  addForeignNote(s, issue, body, author = 'stranger') {
    const note = addNote(s, issue, body);
    note.author = author;
    return note;
  },
};

const listIssues = (s, label, state) => s.issues.filter(i => i.labels.includes(label) && (state === 'all' || i.state === 'open'));
const addNote = (s, issue, body) => {
  if (!s.prs.some(p => p.id === Number(issue))) issueOf(s, issue);
  const note = { id: nextId(s), issue: Number(issue), body, author: s.me };
  s.notes.push(note);
  return note;
};
const editNote = (s, id, body) => {
  const note = s.notes.find(n => n.id === Number(id));
  if (!note) throw new Error(`404 note ${id}`);
  note.body = body;
  return note;
};
const relabel = (s, issue, add, remove) => {
  const it = issueOf(s, issue);
  for (const label of remove) {
    if (!it.labels.includes(label)) throw new Error(`404 label ${label} is not on issue ${issue}`);
    it.labels = it.labels.filter(l => l !== label);
  }
  for (const label of add) if (!it.labels.includes(label)) it.labels.push(label);
  return it;
};
const newestChecks = (s, sha) => {
  const result = new Map();
  for (const c of [...s.checks].reverse()) if (c.sha === sha && !result.has(c.name)) result.set(c.name, c.result);
  return result;
};

function ghIssue(i) {
  return { number: i.id, title: i.title, body: i.body, labels: i.labels.map(name => ({ name })), state: i.state, created_at: i.created };
}

function ghPr(p) {
  return { number: p.id, html_url: `https://github.com/o/r/pull/${p.id}`, state: p.state === 'open' ? 'open' : 'closed',
    merged_at: p.state === 'merged' ? '2026-11-07T00:00:00Z' : null, head: { sha: p.head }, updated_at: p.updated };
}

export function ghRun(s) {
  return (cmd, args, { input } = {}) => {
    s.calls.push([cmd, ...args]);
    if (cmd !== 'gh') throw new Error(`unexpected command ${cmd}`);
    if (args[0] === 'issue' && args[1] === 'pin') {
      if (!s.pinned.includes(Number(args[2]))) s.pinned.push(Number(args[2]));
      return '';
    }
    if (args[0] !== 'api') throw new Error(`unexpected gh ${args.join(' ')}`);
    if (args.at(-1) === 'user') return JSON.stringify({ login: s.me });
    const paged = args.includes('--paginate');
    if (paged && !args.includes('--slurp')) throw new Error('--paginate needs --slurp');
    const method = paged ? 'GET' : args[args.indexOf('--method') + 1];
    const route = args.find(a => a.startsWith('repos/'));
    if (!route?.startsWith('repos/{owner}/{repo}/')) throw new Error(`unexpected route ${route}`);
    const url = new URL(`http://x/${route.slice('repos/{owner}/{repo}/'.length)}`);
    const q = url.searchParams, parts = url.pathname.slice(1).split('/').map(decodeURIComponent);
    const body = input ? JSON.parse(input) : null;
    const reply = value => JSON.stringify(paged ? [value] : value);
    const key = `${method} ${parts.map(p => (/^\d+$/.test(p) ? ':id' : p)).join('/')}`;
    if (method === 'DELETE' && parts[0] === 'issues' && parts[2] === 'labels') {
      relabel(s, parts[1], [], [parts[3]]);
      return reply([]);
    }
    switch (key) {
      case 'GET issues': return reply(listIssues(s, q.get('labels'), q.get('state')).map(ghIssue));
      case 'POST issues': return reply(ghIssue(forgeStore.addIssue(s, body)));
      case 'GET issues/:id': return reply(ghIssue(issueOf(s, parts[1])));
      case 'PATCH issues/:id': issueOf(s, parts[1]).state = body.state; return reply({});
      case 'GET issues/:id/comments': issueOf(s, parts[1]); return reply(s.notes.filter(n => n.issue === Number(parts[1])).map(n => ({ id: n.id, body: n.body, user: { login: n.author } })));
      case 'POST issues/:id/comments': return reply({ id: addNote(s, parts[1], body.body).id });
      case 'PATCH issues/comments/:id': editNote(s, parts[2], body.body); return reply({});
      case 'POST issues/:id/labels': relabel(s, parts[1], body.labels, []); return reply([]);
      case 'GET labels': return reply(s.labels.map(name => ({ name })));
      case 'POST labels': s.labels.push(body.name); return reply({});
      case 'GET pulls': {
        const [, branch] = q.get('head').split(':');
        return reply(s.prs.filter(p => p.branch === branch && p.state === q.get('state')).reverse().map(ghPr));
      }
      case 'GET pulls/:id': return reply(ghPr(prOf(s, parts[1])));
      case 'GET actions/runs': {
        const sha = q.get('head_sha');
        return reply({ workflow_runs: s.checks.map((c, i) => ({ id: i + 1, sha: c.sha })).filter(r => r.sha === sha).map(({ id }) => ({ id })) });
      }
      case 'GET actions/runs/:id/jobs': {
        const { name, result } = s.checks[Number(parts[2]) - 1];
        return reply({ jobs: [{ name, status: result === 'pending' ? 'in_progress' : 'completed', conclusion: result === 'pending' ? null : result }] });
      }
      default: throw new Error(`unexpected gh api ${key}`);
    }
  };
}

function glIssue(i) {
  return { iid: i.id, title: i.title, description: i.body, labels: i.labels, state: i.state === 'open' ? 'opened' : 'closed', created_at: i.created };
}

export function curlRun(s, token) {
  return (cmd, args, { input } = {}) => {
    s.calls.push([cmd, ...args]);
    if (cmd !== 'curl') throw new Error(`unexpected command ${cmd}`);
    if (input !== `PRIVATE-TOKEN: ${token}\n` || args.some(a => a.includes(token))) throw new Error('401 the token must come only on stdin');
    const method = args[args.indexOf('--request') + 1];
    const file = args.includes('--data-binary') ? args[args.indexOf('--data-binary') + 1].slice(1) : null;
    const body = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const url = new URL(args.at(-1));
    if (method === 'GET' && url.pathname === '/api/v4/user') return JSON.stringify({ username: s.me });
    const q = url.searchParams, parts = url.pathname.split('/projects/7/')[1].split('/');
    const page = Number(q.get('page') ?? 1), size = Number(q.get('per_page') ?? 20);
    const list = items => JSON.stringify(items.slice((page - 1) * size, page * size));
    const key = `${method} ${parts.map(p => (/^\d+$/.test(p) ? ':id' : p)).join('/')}`;
    switch (key) {
      case 'GET issues': return list(listIssues(s, q.get('labels'), q.get('state') === 'opened' ? 'open' : 'all').map(glIssue));
      case 'POST issues': return JSON.stringify(glIssue(forgeStore.addIssue(s, { title: body.title, body: body.description, labels: body.labels.split(',') })));
      case 'GET issues/:id': return JSON.stringify(glIssue(issueOf(s, parts[1])));
      case 'PUT issues/:id': {
        relabel(s, parts[1], body.add_labels ? body.add_labels.split(',') : [], body.remove_labels ? body.remove_labels.split(',') : []);
        if (body.state_event === 'close') issueOf(s, parts[1]).state = 'closed';
        return JSON.stringify(glIssue(issueOf(s, parts[1])));
      }
      case 'GET issues/:id/notes': issueOf(s, parts[1]); return list(s.notes.filter(n => n.issue === Number(parts[1])).map(n => ({ id: n.id, body: n.body, system: false, author: { username: n.author } })));
      case 'POST issues/:id/notes': return JSON.stringify({ id: addNote(s, parts[1], body.body).id });
      case 'PUT issues/:id/notes/:id': editNote(s, parts[3], body.body); return '{}';
      case 'GET labels': return list(s.labels.map(name => ({ name })));
      case 'POST labels': s.labels.push(body.name); return '{}';
      case 'GET merge_requests': return JSON.stringify(s.prs.filter(p => p.branch === q.get('source_branch') && p.state === 'open').reverse().map(glMr));
      case 'GET merge_requests/:id': return JSON.stringify(glMr(prOf(s, parts[1])));
      case 'POST merge_requests/:id/notes': prOf(s, parts[1]); return '{}';
      case 'GET pipelines': {
        if (q.get('order_by') !== 'id' || q.get('sort') !== 'desc') throw new Error('400 pipelines need order_by=id&sort=desc');
        return JSON.stringify(s.checks.map((c, i) => ({ id: i + 1, sha: c.sha })).filter(p => p.sha === q.get('sha')).reverse());
      }
      case 'GET pipelines/:id/jobs': {
        const { name, result } = s.checks[Number(parts[1]) - 1];
        return list([{ name, status: result === 'pending' ? 'running' : result === 'failure' ? 'failed' : 'success' }]);
      }
      default: throw new Error(`unexpected GitLab ${key}`);
    }
  };
}

function glMr(p) {
  return { iid: p.id, web_url: `https://gitlab.example.com/g/p/-/merge_requests/${p.id}`, state: p.state === 'open' ? 'opened' : p.state, sha: p.head, updated_at: p.updated };
}

function azItem(i) {
  return { id: i.id, fields: { 'System.Title': i.title, 'System.Description': i.body, 'System.Tags': i.labels.join('; '), 'System.CreatedDate': i.created, 'System.State': i.state } };
}

function azPr(p) {
  return { pullRequestId: p.id, status: p.state === 'open' ? 'active' : p.state === 'merged' ? 'completed' : 'abandoned', lastMergeSourceCommit: { commitId: p.head },
    creationDate: p.updated, repository: { project: { id: 'project-guid' } } };
}

export function azRun(s) {
  return (cmd, args) => {
    s.calls.push([cmd, ...args]);
    if (cmd !== 'az' || args[0] !== 'devops' || args[1] !== 'invoke') throw new Error(`unexpected command ${cmd} ${args.join(' ')}`);
    const values = flag => {
      const start = args.indexOf(flag);
      if (start < 0) return {};
      const out = {};
      for (let i = start + 1; i < args.length && !args[i].startsWith('--'); i++) {
        const at = args[i].indexOf('=');
        out[args[i].slice(0, at)] = args[i].slice(at + 1);
      }
      return out;
    };
    const one = flag => args[args.indexOf(flag) + 1];
    const route = values('--route-parameters'), query = values('--query-parameters');
    const body = args.includes('--in-file') ? JSON.parse(fs.readFileSync(one('--in-file'), 'utf8')) : null;
    const key = `${one('--http-method')} ${one('--area')}/${one('--resource')}`;
    if (key === 'GET Location/connectionData') return JSON.stringify({ authenticatedUser: { id: s.me } });
    if (route.project !== 'Proj') throw new Error('404 project');
    const fields = ops => Object.fromEntries(ops.map(op => [op.path.replace('/fields/', ''), op.value]));
    switch (key) {
      case 'POST wit/wiql': {
        const tag = body.query.match(/CONTAINS '((?:[^']|'')*)'/)[1].replace(/''/g, "'");
        return JSON.stringify({ workItems: listIssues(s, tag, body.query.includes('NOT IN') ? 'open' : 'all').map(i => ({ id: i.id })) });
      }
      case 'POST wit/workitemsbatch': return JSON.stringify({ value: body.ids.map(id => azItem(issueOf(s, id))) });
      case 'GET wit/workitems': return JSON.stringify(azItem(issueOf(s, route.id)));
      case 'PATCH wit/workitems': {
        if (one('--media-type') !== 'application/json-patch+json') throw new Error('415 media type');
        const f = fields(body), it = issueOf(s, route.id);
        if ('System.Tags' in f) it.labels = f['System.Tags'].split(';').map(t => t.trim()).filter(Boolean);
        if (f['System.State']) it.state = 'closed';
        return JSON.stringify(azItem(it));
      }
      case 'POST wit/workitems': {
        const f = fields(body);
        if (route.type !== '$Bug') throw new Error('404 work item type');
        return JSON.stringify(azItem(forgeStore.addIssue(s, { title: f['System.Title'], body: f['System.Description'], labels: f['System.Tags'].split('; ') })));
      }
      case 'GET wit/comments': {
        issueOf(s, route.workItemId);
        const all = s.notes.filter(n => n.issue === Number(route.workItemId));
        const ordered = query.order === 'asc' ? all : [...all].reverse();
        const from = Number(query.continuationToken ?? 0), top = Math.min(Number(query.$top ?? 200), 200);
        const page = ordered.slice(from, from + top);
        return JSON.stringify({ comments: page.map(n => ({ id: n.id, text: n.body, createdBy: { id: n.author } })), ...(from + top < ordered.length && { continuationToken: String(from + top) }) });
      }
      case 'POST wit/comments': return JSON.stringify({ id: addNote(s, route.workItemId, body.text).id });
      case 'PATCH wit/comments': editNote(s, route.commentId, body.text); return '{}';
      case 'GET git/pullRequests': {
        if (route.pullRequestId) return JSON.stringify(azPr(prOf(s, route.pullRequestId)));
        const branch = query['searchCriteria.sourceRefName'].replace('refs/heads/', '');
        return JSON.stringify({ value: s.prs.filter(p => p.branch === branch && p.state === 'open').reverse().map(azPr) });
      }
      case 'POST git/pullRequestThreads': prOf(s, route.pullRequestId); return '{}';
      case 'GET policy/evaluations': {
        const id = query.artifactId.split('/').at(-1), pr = prOf(s, id);
        return JSON.stringify({ value: [...newestChecks(s, pr.head)].map(([name, result]) => ({ configuration: { type: { displayName: 'Build' }, settings: { displayName: name } },
          status: result === 'success' ? 'approved' : result === 'failure' ? 'rejected' : 'running' })) });
      }
      default: throw new Error(`unexpected Azure ${key}`);
    }
  };
}

export function ghCli(args, file, input) {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    process.stdout.write(ghRun(s)('gh', args, { input: input || undefined }));
  } finally {
    fs.writeFileSync(file, JSON.stringify(s));
  }
}

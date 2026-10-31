import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const invoicesFile = process.env.INVOICES_FILE ?? 'data/invoices.json';
const exportDir = process.env.EXPORT_DIR ?? 'exports';
const jobs = new Map();

const load = () => JSON.parse(fs.readFileSync(invoicesFile, 'utf8'));
const save = invoices => fs.writeFileSync(invoicesFile, JSON.stringify(invoices, null, 2) + '\n');

function runExport(job) {
  const invoices = load();
  fs.mkdirSync(exportDir, { recursive: true });
  const cell = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
  const lines = ['id,customer,amount,status', ...invoices.map(invoice => [invoice.id, invoice.customer, invoice.amount, invoice.status].map(cell).join(','))];
  fs.writeFileSync(path.join(exportDir, `${job.id}.csv`), lines.join('\n') + '\n');
  job.status = 'complete';
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = req => new Promise(resolve => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve(null); } });
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/invoices') return send(res, 200, load());
  if (req.method === 'POST' && url.pathname === '/invoices') {
    const input = await readBody(req);
    if (!input || typeof input.customer !== 'string' || !input.customer.trim() || !Number.isInteger(input.amount) || input.amount <= 0) return send(res, 400, { error: 'customer and a positive whole amount are required' });
    const invoices = load();
    const invoice = { id: Math.max(0, ...invoices.map(i => i.id)) + 1, customer: input.customer, amount: input.amount, status: 'open' };
    invoices.push(invoice);
    save(invoices);
    return send(res, 201, invoice);
  }
  const pay = url.pathname.match(/^\/invoices\/(\d+)\/pay$/);
  if (req.method === 'POST' && pay) {
    const invoices = load();
    const invoice = invoices.find(i => i.id === Number(pay[1]));
    if (!invoice) return send(res, 404, { error: 'not found' });
    invoice.status = 'paid';
    save(invoices);
    return send(res, 200, invoice);
  }
  if (req.method === 'GET' && url.pathname === '/invoices/totals') {
    const totals = { open: 0, paid: 0 };
    for (const invoice of load()) totals[invoice.status] += invoice.amount;
    return send(res, 200, totals);
  }
  if (req.method === 'POST' && url.pathname === '/exports') {
    const id = jobs.size + 1;
    const job = { id, status: 'running', rows: load().length, file: path.join(exportDir, `${id}.csv`) };
    jobs.set(id, job);
    setTimeout(() => runExport(job), 300);
    return send(res, 202, job);
  }
  const exportJob = url.pathname.match(/^\/exports\/(\d+)$/);
  if (req.method === 'GET' && exportJob && jobs.has(Number(exportJob[1]))) return send(res, 200, jobs.get(Number(exportJob[1])));
  send(res, 404, { error: 'not found' });
}).listen(Number(process.env.PORT ?? 3000));

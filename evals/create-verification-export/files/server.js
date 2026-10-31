import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const invoicesFile = process.env.INVOICES_FILE ?? 'data/invoices.json';
const exportDir = process.env.EXPORT_DIR ?? 'exports';
const jobs = new Map();

function runExport(job) {
  const invoices = JSON.parse(fs.readFileSync(invoicesFile, 'utf8'));
  fs.mkdirSync(exportDir, { recursive: true });
  const lines = ['id,customer,amount', ...invoices.map(invoice => `${invoice.id},${invoice.customer},${invoice.amount}`)];
  fs.writeFileSync(path.join(exportDir, `${job.id}.csv`), lines.join('\n') + '\n');
  job.status = 'complete';
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/exports') {
    const invoices = JSON.parse(fs.readFileSync(invoicesFile, 'utf8'));
    const id = jobs.size + 1;
    const job = { id, status: 'running', rows: invoices.length, file: path.join(exportDir, `${id}.csv`) };
    jobs.set(id, job);
    setTimeout(() => runExport(job), 300);
    return send(res, 202, job);
  }
  const match = req.url.match(/^\/exports\/(\d+)$/);
  if (req.method === 'GET' && match && jobs.has(Number(match[1]))) return send(res, 200, jobs.get(Number(match[1])));
  send(res, 404, { error: 'not found' });
}).listen(Number(process.env.PORT ?? 3000));

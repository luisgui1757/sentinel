import http from 'node:http';
import fs from 'node:fs';

const file = process.env.NOTES_FILE ?? 'data/notes.json';
const load = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
const save = notes => { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(file, JSON.stringify(notes)); };

http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
  if (req.method === 'GET' && req.url === '/notes') return send(200, load());
  if (req.method === 'POST' && req.url === '/notes') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const text = JSON.parse(body || '{}').text;
    if (!text) return send(400, { error: 'text is required' });
    const notes = load();
    const note = { id: notes.length + 1, text };
    save([...notes, note]);
    return send(201, note);
  }
  send(404, { error: 'not found' });
}).listen(Number(process.env.PORT ?? 3000));

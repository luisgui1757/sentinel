import http from 'node:http';
import { routes } from './routes/index.js';
import { chain } from './middleware/index.js';

http.createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  const handler = routes.get(`${req.method} ${req.url}`);
  if (typeof handler !== 'function') { res.writeHead(404); return res.end(); }
  const context = { headers: req.headers, order: body ? JSON.parse(body) : {} };
  for (const step of chain) await step(context);
  const result = await handler(context);
  res.writeHead(result.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(result.body));
}).listen(Number(process.env.PORT ?? 3000));

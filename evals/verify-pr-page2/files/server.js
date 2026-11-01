import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { formatPrice } from './src/format.js';
import { orders, findOrder } from './src/orders.js';

const page = (title, body) => `<!doctype html><title>${title}</title><h1>${title}</h1>${body}\n`;

export const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('content-type', 'text/html');
    if (url.pathname === '/') {
      res.end(page('Orders', `<ul>${orders.map(o => `<li><a href="/order?id=${o.id}">Order ${o.id}</a>: ${formatPrice(o.total)}</li>`).join('')}</ul>`));
    } else if (url.pathname === '/order') {
      const order = findOrder(Number(url.searchParams.get('id')));
      res.end(page(`Order ${order.id}`, `<p>Total: ${formatPrice(order.total)}</p><p>Items: ${order.items.length}</p>`));
    } else {
      res.statusCode = 404;
      res.end('not found\n');
    }
  } catch (error) {
    res.statusCode = 500;
    res.end('internal error\n');
  }
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on http://localhost:${server.address().port}`));
}

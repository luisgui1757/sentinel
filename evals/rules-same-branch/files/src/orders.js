import { formatDate } from './dates.js';

export const orders = [
  { id: 1, total: 1250, placed: new Date(Date.UTC(2026, 2, 14)) },
  { id: 2, total: 990, placed: new Date(Date.UTC(2026, 9, 2)) },
];

export const listOrders = () => orders.map(o => `#${o.id} ${formatDate(o.placed)} ${(o.total / 100).toFixed(2)}`);

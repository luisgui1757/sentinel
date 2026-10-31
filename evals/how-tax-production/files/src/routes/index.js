import { createOrder } from '../handlers/createOrder.js';

export const routes = new Map([['POST /orders', createOrder]]);

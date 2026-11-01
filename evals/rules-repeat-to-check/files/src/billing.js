import { apiUrl } from './config.js';

export const invoiceUrl = id => `${apiUrl()}/invoices/${id}`;

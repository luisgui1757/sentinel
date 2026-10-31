import { saveCustomer } from './customers.js';

export async function importRows(rows, store) {
  for (const row of rows) {
    await saveCustomer({ name: row.name.trim(), email: row.email.toLowerCase() }, store);
  }
}

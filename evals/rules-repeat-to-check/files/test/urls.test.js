import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../src/config.js';
import { invoiceUrl } from '../src/billing.js';
import { profileUrl } from '../src/users.js';

test('billing and users use the configured API', () => {
  configure({ apiUrl: 'https://staging.example.com' });
  assert.equal(invoiceUrl(7), 'https://staging.example.com/invoices/7');
  assert.equal(profileUrl(3), 'https://staging.example.com/users/3');
});

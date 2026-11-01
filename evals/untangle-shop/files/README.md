# shop-core

Price helpers for the shop.

The public API is exported from `index.js`:

- `total(items)` gives the total in cents, with tax, for items of `{ price, qty }`.
- `formatMoney(cents)` gives a price such as `$21.65`.
- `applyDiscount(cents, code)` applies a discount code. The codes are `SAVE10` and `HALF`.

Set `OLD_TAX=1` to use the 2019 tax rate for old invoices.

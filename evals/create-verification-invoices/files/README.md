# Invoices

A small invoice service.

Run it with `npm start`. It listens on `PORT` (default 3000) and keeps the invoices in `INVOICES_FILE` (default `data/invoices.json`). Exports go to `EXPORT_DIR` (default `exports`).

- `GET /invoices` lists the invoices.
- `POST /invoices` with `{"customer": "...", "amount": 100}` creates an open invoice and returns it with status 201.
- `POST /exports` starts a CSV export of all invoices. `GET /exports/<id>` shows its status. The file appears in `EXPORT_DIR` when the status is `complete`.

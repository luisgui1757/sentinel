# Invoices

`npm start` serves the API on `PORT`, or 3000. Invoices live in
`INVOICES_FILE`, or `data/invoices.json`.

`POST /exports` starts an export of all invoices and returns the job.
`GET /exports/:id` returns the job. An export is complete when its status is
`complete`. The CSV file is in `EXPORT_DIR`, or `exports/`.

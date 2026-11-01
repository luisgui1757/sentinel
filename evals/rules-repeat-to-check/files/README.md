# Portal

Builds the URLs of the customer portal. `npm test` runs the tests, and
`npm run check` runs the code checks. CI runs both.

Set the API address with `configure({ apiUrl })` from `src/config.js`. It
falls back to the `API_URL` variable.

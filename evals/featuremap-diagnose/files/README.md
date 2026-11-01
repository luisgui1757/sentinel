# Shop monorepo

| Folder | Part |
| --- | --- |
| `web/` | The web app, in TypeScript |
| `api/` | The HTTP API, in Python |
| `db/` | The database layer, with a TypeScript client and Python models |
| `shared/` | Money and date helpers |
| `jobs/` | Night jobs, in Ruby |

## Architecture

The web app talks to the database only through the API. Code that two parts
share goes in `shared/`.

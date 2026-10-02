# IB History Timeline

An interactive web timeline for organizing modern history (1850–2000) as periods, events, and the flows that connect them.

## Purpose

A personal study tool for IB History. Instead of keeping notes as a flat list, periods and events are laid out on a zoomable horizontal timeline so that overlaps, sequences, and cause-and-effect chains are visible at a glance. The UI is in Korean.

## Features

- **Periods (연도/기간)** with start and end dates, and **events (포인트)** with a single date
- **Flows (흐름)**: ordered chains of periods and events drawn as connections on the timeline
- Per-item description, category, related figures, source, and an optional photo (resized in the browser to a maximum width of 800px)
- **Color tags** that can be created, edited, and assigned to periods, events, and flows
- **Category filters** to show or hide items by category (the hidden set is remembered in the browser)
- **Zoom units** from 1 year down to 1 day per grid step (1y, 6m, 3m, 1m, 15d, 10d, 3d, 1d)
- **PNG export** of the current timeline range at the current zoom level
- Light and dark themes
- Username/password accounts with server-side sessions
- Offline editing: changes are queued locally and pushed when the browser is back online; other devices' changes are picked up by polling every 3 seconds
- Installable as a PWA (web app manifest and a network-first service worker)

## Tech stack

- **Frontend:** plain HTML, CSS, and JavaScript (`index.html`, `styles.css`, `app.js`); timeline rendered with SVG
- **Backend:** Node.js with Express 5 (`server.js`)
- **Database:** MariaDB via `mysql2` (`db/client.js`, `db/schema.sql`)
- **Auth:** scrypt password hashing; random bearer tokens stored server-side as SHA-256 hashes, valid for 30 days

## Running locally

Requirements: Node.js and a MariaDB database you can create tables in.

```bash
npm ci
cp .env.example .env      # then set DATABASE_URL for your local database
npm run db:migrate        # applies db/schema.sql
npm run dev               # node --watch server.js
```

The app listens on `http://127.0.0.1:3000` by default (`HOST` and `PORT` can be set in `.env`).

Other scripts:

- `npm run build` — checks that the required files exist and that the JavaScript files parse
- `npm run test:integration` — runs `tests/integration.js` against a running server

## Deployment layout

The production instance runs on a Raspberry Pi next to its MariaDB server:

- `deploy/history-timeline.service` — systemd unit that runs `server.js` with environment from `.env`, after `mariadb.service`
- `deploy/nginx-wiki.conf` — Nginx reverse proxy to `127.0.0.1:3000`, both as `history.baecha.xyz` and under the `/history/` path of the wiki host
- MariaDB listens only on localhost, so the app is not deployed to an external host (`render.yaml` defines no services)

Updating a deployment:

```bash
npm ci
npm run db:migrate
sudo systemctl restart history-timeline
curl http://127.0.0.1:3000/api/health
```

The backend was migrated from Neon PostgreSQL to MariaDB; see [`docs/neon-to-mariadb-migration.md`](docs/neon-to-mariadb-migration.md).

## Keyboard shortcuts

Active on the main timeline view when no dialog is open and no input field is focused:

| Shortcut | Action |
| --- | --- |
| `Alt+1` | Add a period |
| `Alt+2` | Add an event |
| `Alt+3` | Add a flow |

## Data storage

- **Server (MariaDB):** users, sessions, color tags, periods, events, flows, and flow items. Deletions are soft deletes (`is_deleted`). A `workspace_state.version` counter increases on every write so clients can skip reloading when nothing has changed.
- **Shared workspace:** all signed-in accounts read and write a single shared workspace, not per-user data.
- **Browser (`localStorage`):** session token, theme, hidden categories, a cached copy of the workspace, and the queue of pending offline changes.
- **Photos** are stored as data URLs inside the database rows.

## Security and configuration notes

- `DATABASE_URL` is required; the server will not start without it. Keep real credentials only in `.env`, which is git-ignored (`.env.example` is the only committed template).
- Registration is open to anyone who can reach the server, and every account can edit the shared workspace.
- Express serves static files from the working directory. Dotfiles such as `.env` are not served by default, but do not place other secrets in the project directory.

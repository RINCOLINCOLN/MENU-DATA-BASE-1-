# Lumenu runtime route ownership

## Required startup order

The public origin is a single Express process on port 3000. Start the landing SSR first on loopback port 3002, then start Express on port 3000. Express proxies only `GET /` to landing SSR; this prevents a dashboard restart from taking ownership of the public homepage.

```bash
cd /home/team/shared/site
setsid nohup bun run serve-landing.ts > .run/landing.log 2>&1 < /dev/null &
cd /home/team/shared/menuvo/server
setsid nohup node server.js > server-run.log 2>&1 < /dev/null &
```

If restarting, stop the existing listeners on ports 3000 and 3002 first. Do not run `bun run publish` as the final process on port 3000: it is the landing-only dev server and would hide `/api`, `/tv`, and dashboard routes. Publish the site (`bun run publish`) before starting the two-process runtime, then leave Express on 3000.

## Route ownership

- `/` — landing sales page, proxied by Express to SSR on 3002
- `/app/` — dashboard SPA
- `/login`, `/register`, `/dashboard` — dashboard SPA fallback (legacy direct links retained)
- `/tv/` — TV Display PWA
- `/api/*` — Express API
- `/uploads/*` — Express uploaded assets

## Verification

```bash
for p in / /app/ /login /register /dashboard '/tv/?slug=brew-main-board' /api/health; do
  curl -sS -o /tmp/lumenu-check -w "$p %{http_code} " "http://localhost:3000$p"
  grep -aoE '<title>[^<]+' /tmp/lumenu-check | head -1
 done
```

Root should contain `Lumenu — Digital Menus · Cinematic Style` and `Start free trial`; dashboard should contain `Lumenu Dashboard`; API health must return JSON.
## Running the snapshot e2e suite (never against the live DB)
`server/e2e/snapshot-flow.mjs` writes rows and toggles `on_hold` in SQLite, so it refuses to start unless `E2E_DB_PATH` is set to something other than `server/data/menuvo.db` and `BASE_URL` is not the live `:3000` server.
```bash
cd /home/team/shared/menuvo/server
export E2E_DB_PATH=/tmp/lumenu-e2e/menuvo.db   # seeded from the live DB on first use
PORT=3011 DB_PATH="$E2E_DB_PATH" node server.js &   # throwaway server
BASE_URL=http://127.0.0.1:3011 node e2e/snapshot-flow.mjs
kill %1 && rm -rf /tmp/lumenu-e2e               # the helper deletes its own copy on exit
```
The suite still writes photos into `server/uploads/snapshots/` (that path is shared with the live server) — delete the files it created when you are done.

## Scrubbing e2e/QA rows out of a database
`server/db/scrub-test-data.cjs` removes test users/restaurants/screens/snapshots by identity, and refuses to run unless the owner screen, the three showcase restaurants and the four demo screens are all present.
```bash
cd /home/team/shared/menuvo/server
node db/scrub-test-data.cjs            # dry-run: census + exact delete plan, no writes
node db/scrub-test-data.cjs --apply    # backs up to data-backup-restore-<date>/, then deletes
```
Upload files are only unlinked when the DB being scrubbed is the live DB (or `--uploads-dir=` is given), so a rehearsal against `--db=/tmp/copy.db` cannot delete live photos.

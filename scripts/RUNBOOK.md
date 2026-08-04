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

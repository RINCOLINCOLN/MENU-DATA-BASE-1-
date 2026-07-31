# Lumenu Operations Runbook

## Quick Start / Restart

**When to run:** Website returns errors, 502/503, "connection refused", or after a server reboot.

```bash
bash /home/team/shared/menuvo/scripts/startup.sh
```

### What it does (step by step)

1. Kills any stale processes on ports 3000, 3001, 3002
2. Starts Bun landing page SSR on port 3002 (internal, loopback only)
3. Starts Node.js Express server on port 3000 (public surface)
4. Verifies all 4 endpoints return HTTP 200 (with up to 5 retries each)

### Expected output (success)

```
🚀 Lumenu Startup — ...
Step 1: Killing stale processes...
  Ports cleared
Step 2: Starting landing page SSR (Bun on :3002)...
  Bun PID: 12345
Step 3: Starting backend server (Node on :3000)...
  Node PID: 12346
Step 4: Verifying endpoints...
  ✅ API Health → 200
  ✅ Landing Page → 200
  ✅ Dashboard → 200
  ✅ TV Display → 200

✅ All checks passed — Lumenu is live on :3000
```

---

## How to Check If the Site Is Down

Run these checks before assuming the site is broken:

```bash
# 1. Is the port listening?
ss -Htln | grep ':3000'

# 2. Does the API respond?
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health

# 3. Does the landing page respond?
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/

# 4. What processes are on port 3000?
ss -Htlnp 'sport = :3000'
```

If step 1 shows nothing listening, or step 2 returns anything other than 200 → run the startup script.

---

## Failure Triage — Step-by-Step Resolution

### Symptom 1: Startup script shows `Port 3000 still in use after 10s`

**What happened:** A process (usually an old Bun SSR server from `serve.ts`) is holding port 3000 and refuses to die with normal kill signals.

**Step-by-step fix:**

```bash
# 1. Force-kill whatever is on port 3000
sudo fuser -k 3000/tcp

# 2. Verify the port is free
ss -Htln | grep ':3000'
# Should return nothing

# 3. Re-run the startup script
bash /home/team/shared/menuvo/scripts/startup.sh
```

---

### Symptom 2: `❌ API Health → 404` (or 307, or 502)

**What happened:** The old Bun SSR server (not Node Express) is on port 3000. Bun serves the landing page but doesn't have `/api/*` routes, so API calls return 404.

**Step-by-step fix:**

```bash
# 1. See who's on port 3000
ss -Htlnp 'sport = :3000'
# Look at the PID — use ps to check if it's bun or node:
ps aux | grep <PID>

# 2. If it's bun (not node), kill it
sudo fuser -k 3000/tcp

# 3. Re-run the startup script (this time Node Express will own 3000)
bash /home/team/shared/menuvo/scripts/startup.sh
```

---

### Symptom 3: `❌ Landing Page → 502` but API Health is green

**What happened:** Node Express is running but the Bun SSR proxy (port 3002) is down. Express can't forward `/` requests.

**Step-by-step fix:**

```bash
# 1. Check if Bun is running on 3002
ss -Htln | grep ':3002'
curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/ 2>/dev/null

# 2. If Bun is not running, start it manually:
cd /home/team/shared/site
nohup bun run serve-landing.ts >> /tmp/landing-server.log 2>&1 &

# 3. Wait 2 seconds, then verify
sleep 2
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/
```

---

### Symptom 4: All four checks fail

**What happened:** Neither server started, or both crashed on startup.

**Step-by-step fix:**

```bash
# 1. Check Node log for startup errors
tail -50 /tmp/menuvo-server.log

# 2. Common causes:
#    - Port 3000 already in use → follow Symptom 1 steps
#    - Missing node_modules → cd /home/team/shared/menuvo/server && npm install
#    - Database locked → rm /home/team/shared/menuvo/server/data/menuvo.db-journal 2>/dev/null
#    - Disk full → df -h /tmp

# 3. Kill everything and restart clean
sudo fuser -k 3000/tcp 2>/dev/null
sudo fuser -k 3002/tcp 2>/dev/null
bash /home/team/shared/menuvo/scripts/startup.sh
```

---

### Symptom 5: Dashboard loads but shows no data / blank

**What happened:** The frontend is serving but the API is unreachable or the database is corrupted.

**Step-by-step fix:**

```bash
# 1. Test the API directly
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}

# 2. Test auth
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@lumenu.app","password":"demo1234"}'
# Expected: JSON with a token

# 3. If auth fails, re-seed the database
cd /home/team/shared/menuvo/server
node db/seed.js

# 4. Restart the server
bash /home/team/shared/menuvo/scripts/startup.sh
```

---

## Architecture

| Port | Service | Internal/Public |
|------|---------|-----------------|
| 3000 | Node.js Express | Public surface (all traffic) |
| 3002 | Bun (TanStack SSR) | Internal — proxied from 3000 |

### Routes on port 3000

| Path | Serves |
|------|--------|
| `/` | Landing page (SSR via Bun proxy on :3002) |
| `/app/` | Dashboard SPA (static files) |
| `/api/*` | REST API + WebSocket |
| `/tv/` | TV Display PWA (static files + service worker) |
| `/uploads/` | Uploaded template videos |

---

## Log Files

| Service | Log Path |
|---------|----------|
| Node Express | `/tmp/menuvo-server.log` |
| Bun Landing SSR | `/tmp/landing-server.log` |
| Startup script | `/tmp/lumenu-startup.log` |

To tail all logs live:
```bash
tail -f /tmp/menuvo-server.log /tmp/landing-server.log
```

---

## Manual Recovery (if startup.sh itself fails)

```bash
# 1. Force-free both ports
sudo fuser -k 3000/tcp
sudo fuser -k 3002/tcp
sleep 1

# 2. Verify ports are free
ss -Htln | grep -E ':(3000|3002)'
# Should return nothing

# 3. Start Bun (internal SSR, must start first)
cd /home/team/shared/site
nohup bun run serve-landing.ts >> /tmp/landing-server.log 2>&1 &
sleep 3

# 4. Start Node Express (public surface)
cd /home/team/shared/menuvo/server
nohup node server.js >> /tmp/menuvo-server.log 2>&1 &
sleep 3

# 5. Verify
curl -s -o /dev/null -w 'API: %{http_code}\n' http://localhost:3000/api/health
curl -s -o /dev/null -w 'Landing: %{http_code}\n' http://localhost:3000/
curl -s -o /dev/null -w 'Dashboard: %{http_code}\n' http://localhost:3000/app/
curl -s -o /dev/null -w 'TV: %{http_code}\n' http://localhost:3000/tv/
```

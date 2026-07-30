# Lumenu Operations Runbook

## Quick Start / Restart

If the website is down or you need to restart all services:

```bash
bash /home/team/shared/menuvo/scripts/startup.sh
```

### What it does

1. Kills any stale processes on ports 3000, 3001, 3002
2. Starts Bun landing page SSR on port 3002 (internal)
3. Starts Node.js Express server on port 3000 (public)
4. Verifies all 4 endpoints return HTTP 200

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

## Failure Triage

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Port 3000 still in use after 10s` | Stale bun process from old `serve.ts` | `sudo fuser -k 3000/tcp` then re-run |
| `❌ API Health → 404` | Old bun server on 3000, not Node Express | Kill bun on 3000: `sudo fuser -k 3000/tcp` |
| `❌ Dashboard → 307` | Express.static redirect without trailing slash | Wait for retries — resolves within ~3s |
| All checks fail | Neither server started | Check logs: `cat /tmp/menuvo-server.log` and `cat /tmp/landing-server.log` |

## Architecture

| Port | Service | Internal/Public |
|------|---------|-----------------|
| 3000 | Node.js Express | Public surface (all traffic) |
| 3002 | Bun (TanStack SSR) | Internal — proxied from 3000 |

### Routes on port 3000

| Path | Serves |
|------|--------|
| `/` | Landing page (SSR via Bun proxy) |
| `/app/` | Dashboard SPA |
| `/api/*` | REST API |
| `/tv/` | TV Display PWA |
| `/uploads/` | Uploaded files |

## Log Files

| Service | Log |
|---------|-----|
| Node Express | `/tmp/menuvo-server.log` |
| Bun Landing | `/tmp/landing-server.log` |
| Startup script | `/tmp/lumenu-startup.log` |

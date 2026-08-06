#!/usr/bin/env bash
# Canonical Lumenu runtime. Never run the marketing Bun server on public :3000.
set -euo pipefail
ROOT=/home/team/shared/menuvo
SITE=/home/team/shared/site
log(){ echo "[$(date '+%H:%M:%S')] $*"; }
pid_on_port(){ lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
kill_port(){ local pid; while pid=$(pid_on_port "$1"); [ -n "$pid" ]; do log "Stopping PID $pid on :$1"; kill -9 "$pid" 2>/dev/null || true; sleep .3; done; }
ensure_builds(){
  [ -d "$ROOT/server/node_modules" ] || (cd "$ROOT/server" && npm install --omit=dev)
  [ -f "$SITE/dist/server/server.js" ] || (cd "$SITE" && bun install && bun run build)
  [ -f "$ROOT/dashboard/dist/index.html" ] || (cd "$ROOT/dashboard" && npm install && npm run build)
}
check(){ local url=$1 expected=${2:-200} got; got=$(curl -sS -L -o /tmp/lumenu-check -w '%{http_code}' --max-time 10 "$url" || true); [ "$got" = "$expected" ] || { echo "FAIL $url ($got)"; return 1; }; echo "OK $url ($got)"; }
log 'Stopping all conflicting listeners'; for p in 3000 3001 3002; do kill_port "$p"; done
ensure_builds
log 'Starting landing SSR on loopback :3002'; (cd "$SITE" && setsid nohup env PORT=3002 bun run serve-landing.ts >/tmp/lumenu-landing.log 2>&1 < /dev/null &)
sleep 2; [ -n "$(pid_on_port 3002)" ] || { cat /tmp/lumenu-landing.log; exit 1; }
log 'Starting Express/API + dashboard/TV on public :3000'; (cd "$ROOT/server" && setsid nohup env PORT=3000 node server.js >/tmp/lumenu-server.log 2>&1 < /dev/null &)
sleep 3
check http://127.0.0.1:3000/api/health
# Prove POST API routing (not marketing HTML fallback) without requiring a valid account.
login_type=$(curl -sS -X POST -H 'content-type: application/json' --data '{"email":"smoke-invalid@example.invalid","password":"invalid"}' -o /tmp/lumenu-login-check -w '%{content_type}' --max-time 10 http://127.0.0.1:3000/api/auth/login || true)
login_code=$(curl -sS -X POST -H 'content-type: application/json' --data '{"email":"smoke-invalid@example.invalid","password":"invalid"}' -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/api/auth/login || true)
case "$login_type:$login_code" in application/json*:*401) echo "OK http://127.0.0.1:3000/api/auth/login (JSON $login_code)";; *) echo "FAIL API login routing ($login_type $login_code)"; exit 1;; esac
check http://127.0.0.1:3000/
check http://127.0.0.1:3000/login
check http://127.0.0.1:3000/register
check 'http://127.0.0.1:3000/tv/?slug=brew-main-board'
echo 'Lumenu canonical runtime is live: :3002 landing -> :3000 Express'

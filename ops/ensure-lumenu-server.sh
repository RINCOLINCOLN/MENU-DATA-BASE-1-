#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ensure-lumenu-server.sh — keep the Lumenu backend on port 3000.
#
# Why: the sandbox's default-site entrypoint periodically (re)starts
# `bun run serve.ts` on :3000. That server answers EVERY path with HTML,
# including /api/* — so the dashboard login page gets HTML instead of JSON
# and fails with a cryptic parse error. The Lumenu stack needs the node
# Express server (server/server.js) on :3000, with the landing SSR on :3002
# (bun) proxied at /.
#
# This supervisor health-checks /api/health every few seconds. When the
# response is not the Lumenu JSON (wrong server or nothing on the port), it
# frees :3000 and restarts the node server. It also restarts node if it dies.
#
# Run detached so it survives shell/session cleanup:
#   setsid nohup bash /home/team/shared/menuvo/ops/ensure-lumenu-server.sh \
#     > /tmp/lumenu-watch.out 2>&1 < /dev/null &
# ---------------------------------------------------------------------------
set -u
PORT=3000
SERVER_DIR=/home/team/shared/menuvo/server
LOG=/tmp/lumenu-watch.log

log() { echo "$(date '+%F %H:%M:%S') [watch] $*" >> "$LOG"; }

check() {
  local out
  out=$(curl -s -m 2 http://localhost:$PORT/api/health 2>/dev/null) || return 1
  case "$out" in
    *'"status":"ok"'*) return 0 ;;
    *) return 1 ;;
  esac
}

start_server() {
  log "starting Lumenu node server (PORT=$PORT)"
  cd "$SERVER_DIR" && setsid nohup env PORT=$PORT node server.js >> /tmp/menuvo-server.log 2>&1 < /dev/null &
  sleep 3
}

while true; do
  if ! check; then
    pids=$(lsof -t -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
      log "port $PORT NOT Lumenu; occupant: $(ps -o cmd= -p $pids 2>/dev/null | tr '\n' ';')"
      echo "$pids" | xargs -r sudo kill -9 2>/dev/null || true
      sleep 1
    else
      log "port $PORT empty — starting Lumenu server"
    fi
    start_server
  fi
  sleep 6
done

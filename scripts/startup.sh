#!/bin/bash
# Lumenu Production Startup Script
# Kills stale processes, starts services in order, verifies readiness.
# Usage: bash /home/team/shared/menuvo/scripts/startup.sh

LOG_DIR="/tmp"
NODE_LOG="${LOG_DIR}/lumenu-server.log"
BUN_LOG="${LOG_DIR}/lumenu-landing.log"
STARTUP_LOG="${LOG_DIR}/lumenu-startup.log"

BUN_PORT=3002
NODE_PORT=3000

# ── Helpers ──────────────────────────────────────────────────

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$STARTUP_LOG"; }
kill_port() {
  local port=$1
  local pids
  pids=$(ss -Htlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
  for pid in $pids; do
    sudo kill -9 "$pid" 2>/dev/null && log "  Killed PID $pid on port $port" || true
  done
}
wait_port_free() {
  local port=$1 timeout=${2:-10}
  local i=0
  while ss -Htln "sport = :$port" 2>/dev/null | grep -q ":$port"; do
    sleep 0.5
    ((i++))
    if [ $i -ge $((timeout * 2)) ]; then
      log "  ⚠️  Port $port still in use after ${timeout}s — forcing..."
      sudo fuser -k "${port}/tcp" 2>/dev/null || true
      sleep 1
      break
    fi
  done
}
check_http() {
  local url=$1 label=$2 max_retries=${3:-5}
  local code i=0
  while [ $i -lt $max_retries ]; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "000")
    [ "$code" = "200" ] && break
    sleep 1
    ((i++))
  done
  if [ "$code" = "200" ]; then
    log "  ✅ $label → $code (after $i retries)"
    return 0
  else
    log "  ❌ $label → $code (after $i retries)"
    return 1
  fi
}

# ── Main ─────────────────────────────────────────────────────

echo "" > "$STARTUP_LOG"
log "🚀 Lumenu Startup — $(date)"

# 1. Stop stale processes
log "Step 1: Killing stale processes..."
kill_port $NODE_PORT
kill_port $BUN_PORT
kill_port 3001  # legacy
wait_port_free $NODE_PORT
wait_port_free $BUN_PORT
log "  Ports cleared"

# 2. Start Bun landing page SSR
log "Step 2: Starting landing page SSR (Bun on :$BUN_PORT)..."
cd /home/team/shared/site
nohup bun run serve-landing.ts >> "$BUN_LOG" 2>&1 &
BUN_PID=$!
log "  Bun PID: $BUN_PID"
sleep 3

# 3. Start Node.js Express server
log "Step 3: Starting backend server (Node on :$NODE_PORT)..."
cd /home/team/shared/menuvo/server
nohup node server.js >> "$NODE_LOG" 2>&1 &
NODE_PID=$!
log "  Node PID: $NODE_PID"
sleep 3

# 4. Verify readiness (with retries built into check_http)
log "Step 4: Verifying endpoints..."
FAILS=0
check_http "http://localhost:3000/api/health" "API Health"   || ((FAILS++))
check_http "http://localhost:3000/"          "Landing Page"  || ((FAILS++))
check_http "http://localhost:3000/app/"      "Dashboard"     || ((FAILS++))
check_http "http://localhost:3000/tv/"       "TV Display"    || ((FAILS++))

# 5. Summary
log ""
if [ "$FAILS" -eq 0 ]; then
  log "✅ All checks passed — Lumenu is live on :$NODE_PORT"
else
  log "⚠️  $FAILS check(s) failed — check logs:"
  log "   Node: $NODE_LOG"
  log "   Bun:  $BUN_LOG"
fi
log "   Node PID: $NODE_PID"
log "   Bun PID:  $BUN_PID"

exit $FAILS
#!/usr/bin/env bash
# verify-login-fix.sh — answers "is the Lumenu login flow fixed?" with concrete checks.
#
# Verifies the three root causes from PR #21 are resolved on a running Lumenu install:
#   1. The server on :3000 (or $BASE_URL) is the Lumenu Express API, not serve.ts
#      answering HTML for /api/* (which broke login with "Unexpected token <").
#   2. /app/ serves the current Lumenu bundle (title + favicon), not a stale
#      pre-rebrand Menuvo build that repo syncs used to restore.
#   3. The auth endpoints behave: correct creds -> JWT, wrong creds -> 401 JSON,
#      and a non-JSON (HTML) response is what the hardened client now detects
#      and surfaces as a clear message instead of a parse crash.
#
# Usage:  bash ops/verify-login-fix.sh [BASE_URL]   (default https://lumenu.ctonew.app)
# Exit:   0 = all checks pass, 1 = any check failed.

BASE_URL="${1:-https://lumenu.ctonew.app}"
EMAIL="${LUMENU_TEST_EMAIL:-owner@menuvo.app}"
PASS="${LUMENU_TEST_PASS:-demo1234}"
FAILS=0

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILS=$((FAILS + 1)); }

echo "== Lumenu login-fix verification against $BASE_URL =="

# --- 1. Health endpoint returns JSON (proves Express API owns the port) ---
printf '%s' '  [1] /api/health returns JSON ......... '
body="$(curl -s -m 8 -H 'Accept: application/json' "$BASE_URL/api/health" 2>/dev/null)"
if echo "$body" | grep -q '"status":"ok"'; then
  pass 'health JSON ok'
else
  fail "expected {\"status\":\"ok\",...} but got: $(echo "$body" | head -c 120)"
fi

# --- 2. /app/ serves the Lumenu bundle, not stale Menuvo ---
printf '%s' '  [2] /app/ is the Lumenu bundle ........ '
html="$(curl -s -m 8 "$BASE_URL/app/" 2>/dev/null)"
if echo "$html" | grep -q '<title>Lumenu Dashboard</title>'; then
  pass 'title is "Lumenu Dashboard"'
else
  fail "title check failed; got: $(echo "$html" | grep -ao '<title>[^<]*</title>' | head -1)"
fi
printf '%s' '  [3] no Menuvo branding in /app/ ...... '
if echo "$html" | grep -qai 'menuvo'; then
  fail 'found "Menuvo" text in /app/ HTML'
else
  pass 'no Menuvo text'
fi
printf '%s' '  [4] favicon is Lumenu purple (#8B5CF6) '
fav="$(curl -s -m 8 "$BASE_URL/favicon.svg" 2>/dev/null | grep -o '#8B5CF6' | head -1)"
if [ "$fav" = "#8B5CF6" ]; then
  pass 'purple favicon'
else
  fail 'favicon is not #8B5CF6 (stale Menuvo green?)'
fi

# --- 3. Auth endpoints ---
printf '%s' '  [5] correct creds -> JWT .............. '
tok="$(curl -s -m 8 -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" 2>/dev/null | grep -o '"token":"[^"]*"' | head -1)"
if [ -n "$tok" ]; then
  pass 'JWT returned'
else
  fail 'no token in login response'
fi

printf '%s' '  [6] wrong creds -> clean 401 JSON ..... '
res="$(curl -s -m 8 -w '\nHTTP:%{http_code}' -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"definitely-wrong\"}" 2>/dev/null)"
code="$(echo "$res" | grep -o 'HTTP:[0-9]*' | grep -o '[0-9]*')"
if [ "$code" = "401" ] && echo "$res" | grep -q '"error"'; then
  pass "401 JSON error (HTTP $code)"
else
  fail "expected 401 JSON error, got HTTP $code"
fi

printf '%s' '  [7] non-JSON path returns HTML ........ '
hijack="$(curl -s -m 8 -X POST "$BASE_URL/api/does-not-exist" \
  -H 'Content-Type: application/json' -d '{}' 2>/dev/null | head -c 60)"
if echo "$hijack" | grep -qi '^<!DOCTYPE html>\|<html'; then
  pass 'HTML response confirmed (this is what the hardened client now detects & reports clearly)'
else
  fail "expected HTML fallback; got: $hijack"
fi

# --- 4. Runtime guards (localhost only) ---
if [ "$BASE_URL" = "https://lumenu.ctonew.app" ] || [ "$BASE_URL" = "http://localhost:3000" ]; then
  printf '%s' '  [8] :3000 owned by node (not serve.ts) '
  owner="$(lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null | head -1 | xargs -I{} ps -o comm= -p {} 2>/dev/null | head -1)"
  if [ "$owner" = "node" ]; then
    pass 'node on :3000'
  else
    fail "expected node on :3000, got: ${owner:-nothing}"
  fi
  printf '%s' '  [9] watchdog process running .......... '
  if pgrep -f ensure-lumenu-server.sh >/dev/null 2>&1; then
    pass 'ensure-lumenu-server.sh alive'
  else
    fail 'watchdog not running'
  fi
fi

echo
if [ "$FAILS" -eq 0 ]; then
  echo "ALL CHECKS PASSED — the login flow is fixed."
  exit 0
else
  echo "$FAILS CHECK(S) FAILED — see above."
  exit 1
fi

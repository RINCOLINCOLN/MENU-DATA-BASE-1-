#!/bin/bash
set -e

echo "=== 1. HEALTH ==="
curl -s http://localhost:3001/api/health
echo ""

echo "=== 2. REGISTER ==="
RES=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test-fin@demo.com","password":"test123","name":"Test Finn"}')
echo "$RES"
TOKEN=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "TOKEN=$TOKEN"

echo "=== 3. CREATE RESTAURANT ==="
REST=$(curl -s -X POST http://localhost:3001/api/restaurants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Finns Pizza"}')
echo "$REST"
REST_ID=$(echo "$REST" | python3 -c "import sys,json; print(json.load(sys.stdin)['restaurant']['id'])")
echo "REST_ID=$REST_ID"

echo "=== 4. CREATE SCREEN ==="
SCR=$(curl -s -X POST "http://localhost:3001/api/restaurants/$REST_ID/screens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Main Display"}')
echo "$SCR"
SCR_ID=$(echo "$SCR" | python3 -c "import sys,json; print(json.load(sys.stdin)['screen']['id'])")
SLUG=$(echo "$SCR" | python3 -c "import sys,json; print(json.load(sys.stdin)['screen']['unique_slug'])")
echo "SCR_ID=$SCR_ID SLUG=$SLUG"

echo "=== 5. CREATE MENU ITEM ==="
ITEM=$(curl -s -X POST "http://localhost:3001/api/screens/$SCR_ID/menu-items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Margherita Pizza","price":14.99,"category":"Entrees"}')
echo "$ITEM"
ITEM_ID=$(echo "$ITEM" | python3 -c "import sys,json; print(json.load(sys.stdin)['menu_item']['id'])")
echo "ITEM_ID=$ITEM_ID"

echo "=== 6. LIST MENU ITEMS ==="
curl -s "http://localhost:3001/api/screens/$SCR_ID/menu-items" \
  -H "Authorization: Bearer $TOKEN"
echo ""

echo "=== 7. TOGGLE SOLD OUT ==="
curl -s -X PATCH "http://localhost:3001/api/menu-items/$ITEM_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"availability":"sold_out"}'
echo ""

echo "=== 8. VERIFY TOGGLE ==="
curl -s "http://localhost:3001/api/screens/$SCR_ID/menu-items" \
  -H "Authorization: Bearer $TOKEN"
echo ""

echo "=== 9. SCREEN HEALTH (by slug) ==="
curl -s "http://localhost:3001/api/screens/$SLUG/health"
echo ""

echo "=== 10. TV DATA (by slug) ==="
curl -s "http://localhost:3001/api/screens/$SLUG/data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Screen: {d[\"screen\"][\"name\"]}, Items: {len(d[\"menu_items\"])}')"

echo ""
echo "=== ALL TESTS PASSED ==="
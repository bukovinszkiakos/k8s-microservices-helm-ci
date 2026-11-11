#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

KUBE_CONTEXT=kind-flotilla
NAMESPACE=flotilla
BASE_URL="${1:-http://localhost:8080}"

k() { kubectl --context "$KUBE_CONTEXT" "$@"; }

# --- Check required tools ---
echo "Checking required tools..."
for tool in kubectl curl jq base64; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: required tool not found: ${tool}"
    exit 1
  fi
done

# --- Context guard ---
echo "Verifying kubectl context '${KUBE_CONTEXT}'..."
if ! kubectl config get-contexts -o name | grep -Fx "$KUBE_CONTEXT" >/dev/null; then
  echo "ERROR: kubectl context '${KUBE_CONTEXT}' not found"
  echo "       Has the cluster been created? Run: kind create cluster --config kind/cluster.yaml"
  exit 1
fi

# --- Read API token ---
echo "Reading API token..."
if ! k get secret flotilla-secrets -n "$NAMESPACE" &>/dev/null; then
  echo "ERROR: secret 'flotilla-secrets' not found in namespace '${NAMESPACE}'"
  exit 1
fi
API_TOKEN=$(k get secret flotilla-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.api-token}' | base64 -d)
if [ -z "$API_TOKEN" ]; then
  echo "ERROR: api-token is empty in secret 'flotilla-secrets'"
  exit 1
fi

# --- Wait for gateway ---
echo ""
echo "Waiting for gateway at ${BASE_URL}/healthz (timeout: 60s)..."
deadline=$((SECONDS + 60))
until curl -sf "${BASE_URL}/healthz" &>/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "ERROR: gateway did not become healthy within 60 seconds"
    exit 1
  fi
  echo "  ...waiting"
  sleep 3
done
echo "  Gateway is healthy."

# --- Check helpers ---
PASSED=0
FAILED=0
ITEM_NAME="e2e-$(date +%s)"

pass() { echo "  ✔ $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  ✘ $1"; FAILED=$((FAILED + 1)); }

check_http() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$desc"
  else
    fail "$desc  (expected HTTP $expected, got HTTP $actual)"
  fi
}

echo ""
echo "Running 7 end-to-end checks against ${BASE_URL}..."
echo ""

# 1. Auth route is not publicly exposed — gateway catch-all returns 404
status=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}/api/auth/validate") || status="000"
check_http "[1] Auth not publicly exposed  GET  /api/auth/validate" "404" "$status"

# 2. Inventory: missing Authorization header → 401
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"test","quantity":1}' \
  "${BASE_URL}/api/inventory/items") || status="000"
check_http "[2] Inventory rejects no token  POST /api/inventory/items" "401" "$status"

# 3. Inventory: invalid token → 401
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token" \
  -d '{"name":"test","quantity":1}' \
  "${BASE_URL}/api/inventory/items") || status="000"
check_http "[3] Inventory rejects invalid token  POST /api/inventory/items" "401" "$status"

# 4. Inventory: valid token + invalid body (missing name field → typeof check → 400)
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d '{"quantity":1}' \
  "${BASE_URL}/api/inventory/items") || status="000"
check_http "[4] Inventory rejects invalid body with valid token  POST /api/inventory/items" "400" "$status"

# 5. Inventory: valid token + valid body → 201
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -d "{\"name\":\"${ITEM_NAME}\",\"quantity\":3}" \
  "${BASE_URL}/api/inventory/items") || status="000"
check_http "[5] Inventory creates '${ITEM_NAME}'  POST /api/inventory/items" "201" "$status"

# 6. Created item is visible in the list
items_body=$(curl -s "${BASE_URL}/api/inventory/items") || items_body=""
found=$(echo "$items_body" | jq --arg n "$ITEM_NAME" '[.items[].name] | contains([$n])' 2>/dev/null) || found="false"
if [ "$found" = "true" ]; then
  pass "[6] '${ITEM_NAME}' visible in  GET /api/inventory/items"
else
  fail "[6] '${ITEM_NAME}' not found in  GET /api/inventory/items"
fi

# 7. Stats totals reflect at least the item just created
# jq's // 0 coerces null fields to 0; || catches a completely unparseable response body.
stats_body=$(curl -s "${BASE_URL}/api/stats/summary") || stats_body=""
total_items=$(echo "$stats_body" | jq '.totalItems // 0' 2>/dev/null) || total_items=0
total_qty=$(echo "$stats_body" | jq '.totalQuantity // 0' 2>/dev/null) || total_qty=0
if [ "$total_items" -ge 1 ] && [ "$total_qty" -ge 3 ]; then
  pass "[7] Stats: totalItems=${total_items} (>=1), totalQuantity=${total_qty} (>=3)"
else
  fail "[7] Stats out of range: totalItems=${total_items} (want >=1), totalQuantity=${total_qty} (want >=3)"
fi

# --- Summary ---
echo ""
echo "Results: ${PASSED} passed, ${FAILED} failed"
echo ""

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

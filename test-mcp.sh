#!/bin/bash
# MCP Protocol Smoke Test — airdrop-intel-mcp
# Usage: MCP_URL=http://localhost:3000 bash test-mcp.sh

MCP_URL=${MCP_URL:-http://localhost:3000}
PASS=0
FAIL=0
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

assert() {
  local desc=$1
  local actual=$2
  local expected=$3
  if echo "$actual" | grep -q "$expected"; then
    echo -e "${GREEN}✓${NC} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗${NC} $desc"
    echo "  Expected to find: $expected"
    echo "  Got: $(echo "$actual" | head -3)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "🧪 MCP Smoke Test — $MCP_URL"
echo "────────────────────────────────"

# Health check
RES=$(curl -s "$MCP_URL/health")
assert "Health endpoint returns healthy" "$RES" "healthy"

# Initialize
RES=$(curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0"}}}')
assert "Initialize handshake" "$RES" "protocolVersion"

# List tools
RES=$(curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
assert "tools/list returns search_airdrops" "$RES" "search_airdrops"
assert "tools/list returns check_sybil_risk" "$RES" "check_sybil_risk"
assert "tools/list returns get_portfolio" "$RES" "get_portfolio"
assert "tools/list returns get_upcoming_snapshots" "$RES" "get_upcoming_snapshots"
assert "tools/list returns track_wallet" "$RES" "track_wallet"
assert "tools/list returns get_airdrop_details" "$RES" "get_airdrop_details"
assert "tools/list returns get_wallet_status" "$RES" "get_wallet_status"

# Call search_airdrops
RES=$(curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_airdrops","arguments":{}}}')
assert "search_airdrops returns results" "$RES" "monad"
assert "search_airdrops has structured content" "$RES" "structuredContent"

# Call get_airdrop_details
RES=$(curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_airdrop_details","arguments":{"project_id":"monad"}}}')
assert "get_airdrop_details returns tasks" "$RES" "monad-faucet"
assert "get_airdrop_details has official_url" "$RES" "monad.xyz"

# Call get_upcoming_snapshots
RES=$(curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_upcoming_snapshots","arguments":{"days":365}}}')
assert "get_upcoming_snapshots returns data" "$RES" "project_slug"

echo "────────────────────────────────"
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo ""

[ $FAIL -eq 0 ] && exit 0 || exit 1

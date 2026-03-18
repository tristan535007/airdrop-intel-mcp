# airdrop-intel-mcp

AI-powered crypto airdrop tracker — research projects, monitor wallets, check Sybil risk, and never miss a snapshot again.

[![Available on MCPize](https://img.shields.io/badge/MCPize-Available-blue)](https://mcpize.com/mcp/airdrop-intel-mcp)

## Tools

| Tool | Description |
|------|-------------|
| `search_airdrops` | Search active airdrops by query, chain, difficulty, or funding |
| `get_airdrop_details` | Full task checklist and requirements for a project |
| `track_wallet` | Add a wallet to your tracker for a project |
| `get_wallet_status` | Check your wallets' progress and upcoming deadlines |
| `get_portfolio` | Full overview of all tracked wallets × projects with estimated rewards |
| `check_sybil_risk` | Analyze wallet patterns for Sybil detection risk (score 0–100) |
| `get_upcoming_snapshots` | List upcoming snapshots and deadlines sorted by urgency |

## Connect via MCPize

```bash
npx -y mcpize connect @pavlos/airdrop-intel-mcp --client claude
```

Or visit: https://mcpize.com/mcp/airdrop-intel-mcp

**Per-client install:**
```
Claude:   claude mcp add --transport http airdrop-intel https://airdrop-intel-mcp.mcpize.run
Cursor:   cursor mcp add airdrop-intel https://airdrop-intel-mcp.mcpize.run
```

**JSON config:**
```json
{
  "mcpServers": {
    "airdrop-intel": {
      "url": "https://airdrop-intel-mcp.mcpize.run"
    }
  }
}
```

## Quick Start

### Install from MCPize (Recommended)
Visit [mcpize.com/mcp/airdrop-intel-mcp](https://mcpize.com/mcp/airdrop-intel-mcp)

### Run Locally

```bash
git clone <repo>
cd airdrop-intel-mcp
npm install
cp .env.example .env  # Add your API keys
mcpize dev            # Start dev server with hot reload
mcpize dev --playground  # Interactive testing in browser
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ETHERSCAN_API_KEY` | Yes | Free at [etherscan.io/myapikey](https://etherscan.io/myapikey) |
| `RAPIDAPI_KEY` | No | Free at [rapidapi.com](https://rapidapi.com/emir12/api/crypto-events-calendar) — for live airdrop listings |
| `TELEGRAM_BOT_TOKEN` | No | From [@BotFather](https://t.me/BotFather) — for Telegram notifications |

## Monetization

| Channel | Free | Pro |
|---------|------|-----|
| Claude (MCPize) | 1 project | $15/mo |
| Telegram Bot | 1 project | 700 Stars/mo |

## Development

```bash
npm test          # 16 unit tests
bash test-mcp.sh  # MCP protocol smoke test (14 checks)
npm run build     # Compile TypeScript
```

## Deploy

```bash
mcpize secrets set ETHERSCAN_API_KEY your-key
mcpize deploy
```

## License
MIT

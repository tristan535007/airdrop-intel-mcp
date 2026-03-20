# Airdrop Intel MCP — Developer Guide

Crypto airdrop tracker and assistant. Dual distribution: MCP server (MCPize) + Telegram bot.

## Project Structure

```
src/
  index.ts              # Express + MCP server, tool registration, MCPize header parsing
  tools.ts              # Pure tool functions — business logic only, no MCP dependency
  bot.ts                # Telegram bot (grammy)
  lib/
    airdrop-data.ts     # Static airdrop database — projects, tasks, snapshots
    db.ts               # Drizzle ORM helpers (users, wallets, tasks, stats)
    schema.ts           # Drizzle schema — source of truth for DB structure
    context.ts          # AsyncLocalStorage — passes userId + isPro through async chain
    sybil.ts            # Sybil risk analysis logic

tests/
  tools.test.ts         # Unit tests for all tool functions (vitest)

drizzle/
  0000_past_thing.sql   # Migration 0: initial schema
  meta/
    _journal.json       # Drizzle Kit migration index
    0000_snapshot.json  # Schema snapshot for diff generation
```

## MCP Tools (9 total)

| Tool | Purpose |
|------|---------|
| `search_airdrops` | Search/filter active airdrops by keyword, chain, difficulty, funding |
| `get_airdrop_details` | Full project details + step-by-step task list (use for testnet projects) |
| `track_wallet` | Register wallet for snapshot tracking (use for mainnet projects with snapshot date) |
| `get_wallet_status` | Check all tracked wallets and deadlines |
| `get_portfolio` | Full portfolio overview with estimated pending rewards |
| `check_sybil_risk` | Analyze wallet for Sybil detection risk (0–100 score + recommendations) |
| `get_upcoming_snapshots` | List upcoming snapshot/deadline dates sorted by urgency |
| `log_task_completion` | Mark a specific task as done (stored per user in DB) |
| `get_task_progress` | Show which tasks are done and which are pending for a project |

**Tool routing guidance** (baked into tool descriptions):
- Testnet projects (Monad, MegaETH) → use `get_airdrop_details` for weekly tasks
- Mainnet projects with snapshot (StarkNet) → use `track_wallet` + `get_airdrop_details`

## MCPize Header Parsing

MCPize gateway injects these headers per subscriber request:

```typescript
// src/index.ts
const userId =
  (req.headers["x-mcpize-user-id"] as string) ||   // MCPize: always present for logged-in users
  (req.headers["x-mcpize-user-key"] as string) ||  // MCPize: legacy fallback
  (req.headers["x-user-key"] as string) ||
  process.env.DEV_USER_ID ||
  "local-dev-user";

// X-MCPize-Subscription-ID is only present for paid subscribers
const subscriptionId = req.headers["x-mcpize-subscription-id"] as string | undefined;
const isPro = !!subscriptionId || process.env.DEV_IS_PRO === "true";
```

## AsyncLocalStorage Context

User identity flows through the entire request without threading through every function call:

```typescript
// src/lib/context.ts
export const requestContext = new AsyncLocalStorage<{ userId: string; isPro: boolean }>();
export function getCurrentUserId(): string { ... }
export function getCurrentUserIsPro(): boolean { ... }
```

Usage in `index.ts`:
```typescript
await requestContext.run({ userId, isPro }, async () => {
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

Usage in tools:
```typescript
const user_id = getCurrentUserId();
const isPro = getCurrentUserIsPro();
```

## Free vs Pro Tier

- **Free**: track 1 project, all read tools unlimited
- **Pro**: track unlimited projects (`X-MCPize-Subscription-ID` present = paid subscriber)

The `addTrackedWallet` DB helper takes `isPro = false` — when true, skips the free tier limit check.

## Database (Turso + Drizzle ORM)

Connection via `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` env vars.

### Schema (src/lib/schema.ts)

| Table | Purpose |
|-------|---------|
| `users` | User accounts, identified by `telegram_id` or `mcpize_key`, tier (free/pro) |
| `tracked_wallets` | Wallet + project_slug combos tracked per user |
| `claimed_airdrops` | Historical record of claimed airdrops with USD value |
| `tool_calls` | Analytics: which tools are called, from which channel |
| `task_completions` | Per-user per-project task progress |

### Drizzle Migrations Workflow

**To add or modify tables:**

```bash
# 1. Edit src/lib/schema.ts
# 2. Generate migration
npm run db:generate          # creates drizzle/000N_xxxx.sql

# 3. Commit the SQL file + meta/ files
git add drizzle/

# 4. On startup, migrate() auto-applies pending migrations
# tracked in __drizzle_migrations table in Turso
```

**Never edit existing migration files** — add new ones only.
Migration 0000 has `IF NOT EXISTS` on all statements to allow idempotent runs on existing DBs.

## Key Architectural Decisions

- **No `outputSchema`/`structuredContent`** — removed from all tools. Only `content: [{type: "text", text: JSON.stringify(...)}]` is used. MCPize handles it fine.
- **Pure functions in tools.ts** — all business logic is testable without MCP dependency. `index.ts` is thin wiring only.
- **`participation_type` in search results** — tells Claude whether it's a testnet (weekly tasks) or mainnet (snapshot tracking) project, so it recommends the right tools.
- **Task completion is user-scoped** — `task_completions` links `user_id + project_slug + task_id`, so each MCPize subscriber has their own progress.
- **Telegram bot shares the same DB** — `bot.ts` uses the same Turso DB, users identified by `telegram_id` with `tg:` prefix.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Hot reload dev server (port 8080)
npm test             # Run all unit tests (uses local SQLite)
npm run build        # Compile TypeScript
npm run db:generate  # Generate Drizzle migration from schema changes
npm start            # Run compiled server
```

## Local Testing

Tests use `file:./data/test.db` — no Turso connection needed. For end-to-end testing via Claude:

```bash
npm run dev
# In another terminal:
npx ngrok http 8080
# Connect Claude to https://xxxx.ngrok-free.app/mcp
```

For pro tier locally: set `DEV_IS_PRO=true` and `DEV_USER_ID=test-user` in `.env`.

## Deploy

```bash
mcpize login                          # Auth (browser)
mcpize secrets set TURSO_DATABASE_URL ...
mcpize secrets set TURSO_AUTH_TOKEN ...
mcpize deploy
```

## TDD Rules — MANDATORY

### Order of work — never deviate

1. **Write the test first** — in `tests/tools.test.ts`, failing
2. **Run `npm test`** — confirm it fails (red)
3. **Write the implementation** — minimal code to make it pass
4. **Run `npm test`** — confirm it passes (green)
5. **Refactor if needed** — tests must stay green

### When changing existing code

- If you change a function signature → update the test first
- If you change return shape → update the test first
- If you add a parameter → add a test case for it first
- Never leave a test commented out or skipped (`it.skip`)

### What must be tested

| What | Where | Required |
|------|-------|----------|
| Every tool function | `tests/tools.test.ts` | Yes |
| Happy path | at least 1 test per tool | Yes |
| Error/edge cases | invalid input, not found, tier limits | Yes |
| Async functions | must use `async/await` in tests | Yes |

### What NOT to test

- `index.ts` MCP registration (integration, not unit)
- `bot.ts` Telegram handlers (too coupled to grammy)
- `db.ts` internal queries directly (tested via tools)

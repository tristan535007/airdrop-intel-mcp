# Airdrop Intel MCP — Developer Guide

Crypto airdrop tracker and assistant. Dual distribution: MCP server (MCPize) + Telegram bot.

## Architecture

**Claude = airdrop discovery engine** (web search for current projects, tasks, deadlines)
**MCP = personal data store** (subscriptions, wallets, task progress, claimed rewards)

There is no hardcoded airdrop data. Claude finds airdrops dynamically via web search and stores only user-specific state in the DB.

## Project Structure

```
src/
  index.ts              # Express + MCP server, tool registration, MCPize header parsing
  tools.ts              # Pure tool functions — business logic only, no MCP dependency
  bot.ts                # Telegram bot (grammy)
  lib/
    db.ts               # Drizzle ORM helpers (users, wallets, tasks, stats)
    schema.ts           # Drizzle schema — source of truth for DB structure
    context.ts          # AsyncLocalStorage — passes userId + isPro through async chain
    sybil.ts            # Sybil risk analysis — pure computation on top of api-client
    api-client.ts       # Etherscan + DeFiLlama API wrappers with caching

tests/
  tools.test.ts         # Unit tests for all tool functions (vitest)
  sybil.test.ts         # Unit tests for sybil logic (mocks api-client)

drizzle/
  0000_past_thing.sql   # Migration 0: initial schema
  0001_lethal_reavers.sql
  0002_nanoid_pks.sql   # Migration 2: text nanoid PKs instead of integer autoincrement
  0003_project_meta.sql # Migration 3: project_name + deadline on subscribed_projects
  meta/
    _journal.json       # Drizzle Kit migration index
```

## MCP Tools (9 total)

| Tool | Purpose |
|------|---------|
| `subscribe_to_project` | Subscribe user to a project after they agree to participate |
| `track_wallet` | Register wallet for snapshot tracking (mainnet projects) |
| `get_wallet_status` | Check all tracked wallets and deadlines |
| `get_portfolio` | Full portfolio overview with task progress |
| `check_sybil_risk` | Analyze wallet for Sybil detection risk (0–100 score + recommendations) |
| `log_task_completion` | Mark a specific task as done (stored per user in DB) |
| `get_task_progress` | Show which tasks are done for a project |
| `untrack_project` | Remove project and free up tier slot |
| `log_claimed_airdrop` | Record received tokens and USD value |

## Browser Automation (claude-in-chrome)

Claude can complete safe airdrop tasks automatically via browser tools. Rules baked into tool descriptions:

**Safe to automate (offer to user):**
- Testnet faucet claims
- Testnet DEX swaps / bridge transactions
- Visiting project pages, filling forms (no wallet signing)

**Never automate:**
- Mainnet transactions with real funds
- Wallet connect / signing prompts
- Social actions (Twitter, Discord) without per-step confirmation
- Anything involving private keys or seed phrases

**Flow:**
1. Claude finds airdrop tasks via web search
2. After `subscribe_to_project` — Claude presents task list and offers to automate safe ones
3. User confirms → Claude uses `claude-in-chrome` tools one task at a time
4. After each task → Claude calls `log_task_completion` immediately
5. After all tasks → summary shown to user

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

Free tier is enforced in three places:
- `subscribeToAirdrop` — blocks subscribing to 2nd project
- `addTrackedWallet` (db.ts) — blocks adding wallet for 2nd project
- `logTaskCompletion` — blocks auto-subscribe for 2nd project (task is still logged)

All three receive `isPro` from `getCurrentUserIsPro()` in `index.ts`.

## Database (Turso + Drizzle ORM)

Connection via `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` env vars.

### Schema (src/lib/schema.ts)

| Table | Purpose |
|-------|---------|
| `users` | User accounts, identified by `telegram_id` or `mcpize_key`, tier (free/pro) |
| `subscribed_projects` | Projects user is tracking — stores `project_name`, `deadline`, `joined_at` |
| `tracked_wallets` | Wallet + project_slug combos for mainnet/snapshot tracking |
| `task_completions` | Per-user per-project completed task IDs (free-form kebab-case strings) |
| `claimed_airdrops` | Historical record of claimed airdrops with token amount and USD value |
| `tool_calls` | Analytics: which tools are called, from which channel |

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

- **No hardcoded airdrop data** — Claude discovers projects via web search. MCP only stores user state.
- **No `outputSchema`/`structuredContent`** — only `content: [{type: "text", text: JSON.stringify(...)}]`. MCPize handles it fine.
- **Pure functions in tools.ts** — all business logic is testable without MCP dependency. `index.ts` is thin wiring only.
- **nanoid PKs** — all table PKs are `text` with `$defaultFn(() => nanoid())`. No integer autoincrement.
- **Task IDs are free-form** — `task_completions` stores whatever string Claude decides (e.g. `faucet-claim`, `ambient-swap`). No validation against a predefined list.
- **projectSlug is always normalized** — `.toLowerCase()` applied at the start of every tool function in `tools.ts`. Never trust raw input.
- **untrackProject cleans everything** — removes `tracked_wallets`, `task_completions`, and `subscribed_projects` for the slug. Re-subscribing starts fresh.
- **Task completion is user-scoped** — `task_completions` links `user_id + project_slug + task_id`, so each subscriber has their own progress.
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
| Sybil risk logic | `tests/sybil.test.ts` (mocks api-client) | Yes |
| Happy path | at least 1 test per tool | Yes |
| Error/edge cases | invalid input, not found, tier limits | Yes |
| Async functions | must use `async/await` in tests | Yes |

### What NOT to test

- `index.ts` MCP registration (integration, not unit)
- `bot.ts` Telegram handlers (too coupled to grammy)
- `db.ts` internal queries directly (tested via tools)
- `api-client.ts` external API calls (tested indirectly via sybil mocks)

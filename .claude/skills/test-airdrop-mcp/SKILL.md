---
name: test-airdrop-mcp
description: End-to-end QA run for airdrop-intel-mcp — tests all tools as a real user via curl against a live server
allowed-tools: Bash, AskUserQuestion, Read
---

# Airdrop Intel MCP — QA Test Runner

Runs through all MCP tools as a real user. Checks happy paths, edge cases, and tier enforcement. Reports results in a clean pass/fail table at the end.

## Setup

1. Read `src/index.ts` to discover the current list of registered tools (look for `server.registerTool(` calls). Extract tool names and their inputSchema fields. This is the source of truth — never assume which tools exist.

2. Ask the user two questions with AskUserQuestion (send both in one call):

   **Question 1** — header: "Environment", question: "Where to run the tests?"
   Options:
   - "Local (localhost:8080)" — server is already running locally
   - "ngrok tunnel" — local server exposed via ngrok
   - "Production URL" — deployed server

   **Question 2** — header: "Pro tier", question: "Test pro tier scenarios?"
   Options:
   - "Yes — test both free and pro" — runs free + pro user tests
   - "No — free tier only" — skips pro user tests

3. Based on the environment answer:
   - **Local** → use `http://localhost:8080/mcp`, check health first with `curl http://localhost:8080/health`
   - **ngrok** → ask for the ngrok URL (free text), use `<ngrok-url>/mcp`
   - **Production** → ask for the production URL (free text), use as-is

4. Generate unique test user IDs for this run:
   - `FREE_USER` = `test-qa-free-<timestamp>` (e.g. `test-qa-free-1711234567`)
   - `PRO_USER` = `test-qa-pro-<timestamp>` (only if pro tier selected)

5. Announce the plan:
   ```
   Tools found: <list from index.ts>
   Running QA against: <BASE_URL>
   Free user: <FREE_USER>
   Pro user:  <PRO_USER>
   ```

## Test Execution

Run each test with curl:

```bash
curl -s -X POST <BASE_URL> \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-MCPize-User-ID: <USER_ID>" \
  [-H "X-MCPize-Subscription-ID: pro-test" for pro user tests] \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<TOOL>","arguments":<ARGS>}}'
```

Parse response: result is in `.result.content[0].text` (JSON string). Error response has `.error`.

For each test: record PASS ✅ or FAIL ❌ with a short snippet of the actual response.

## Test Plan (build dynamically from discovered tools)

For each tool found in `index.ts`, derive tests using these rules:

### Universal tests (apply to every tool)
- **Happy path** — call with valid minimal args, expect no error
- **Required fields** — omit a required field, expect validation error

### Per-tool test patterns

**Tools that write data** (create/subscribe/track/log):
- Happy path with free user
- Idempotency — call again with same args, expect success not duplicate error
- If it has a `project_slug` param — test uppercase slug input, expect it normalizes to lowercase

**Tools that enforce free tier** (read from `tools.ts` to identify which ones check `isPro`):
- Free user blocked on 2nd project — expect error mentioning tier/limit/upgrade
- Pro user (with `X-MCPize-Subscription-ID` header) succeeds on 2nd project

**Tools that validate addresses** (any tool with `address` param):
- Valid address (use `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`)
- Invalid address (`0xinvalid`) — expect error

**Tools that read data** (get_*/check_*):
- Call after writing data — verify the written data appears in response
- Call with no data — expect empty result, not error

**Cleanup tools** (untrack_*):
- Call and verify data is gone from read tools
- Verify that the freed slot can be used again (re-subscribe succeeds)

### Test sequencing

Run tests in this order so each builds on the previous state:
1. Write operations first (subscribe → track → log)
2. Read operations to verify state
3. Edge cases (tier limits, invalid input, idempotency)
4. Cleanup last (untrack)
5. Post-cleanup verification (slot freed, data gone)

## Report

After all tests, print a markdown table:

```
| # | Tool | Scenario | Status | Note |
|---|------|----------|--------|------|
| 1 | subscribe_to_project | free user 1st project | ✅ | |
| 2 | subscribe_to_project | idempotent | ✅ | |
...
```

Then print:
```
Results: X/N passed
```

If any failed, list them with the actual response received.

## Cleanup note

Use slugs prefixed with `qa-` and user IDs prefixed with `test-qa-`. Safe to leave in DB — they won't interfere with real users.
---
name: test-airdrop-mcp
description: End-to-end QA run for airdrop-intel-mcp — opens claude.ai/new, has a natural Russian conversation to discover real airdrops, picks one, then tests all tools against it
allowed-tools: Bash, AskUserQuestion, Read, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__find, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__get_page_text, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__gif_creator, mcp__claude-in-chrome__computer
---

# Airdrop Intel MCP — QA Test Runner (claude.ai)

Runs a natural Russian conversation in claude.ai/new. First discovers real airdrops, picks one, then tests all MCP tools against it.

**CRITICAL: Every scene happens inside the browser via claude-in-chrome. Never call MCP tools directly. Never use curl to test. Only allowed outside browser: reading `src/index.ts`, health check, reading `.env`.**

All messages in Russian.

---

## Step 1 — Discover tools

Read `src/index.ts`, extract all `server.registerTool(` names. Keep this list — every tool must be exercised.

## Step 2 — Ask setup questions

AskUserQuestion, two questions at once:

**Q1** header: "MCP URL", "Какой URL у MCP сервера?"
Free text. Может быть ngrok (локальный) или реальный MCPize gateway (например `https://airdrop-intel-mcp.mcpize.run`).

**Q2** header: "MCP подключён?", "MCP сервер уже подключён в коннекторах claude.ai?"
- "Да, уже подключён"
- "Нет" — tell user: Settings → Connectors → Add → `<url>/mcp`, then confirm.

## Step 3 — Health check

```bash
curl -s <url>/health
```
Stop if not responding.

## Step 4 — Open claude.ai/new

`mcp__claude-in-chrome__tabs_context_mcp` — reuse existing claude.ai/new tab or open new one. Wait for chat input.

---

## Step 5 — Discovery conversation (Phase 1)

This phase finds a real airdrop to test with. Send messages one by one, wait for full response each time.

**Message 1:**
> Какие актуальные крипто аирдропы сейчас есть? Дай топ 3–5 с кратким описанием.

Wait for response. Claude should use web search and list real current projects.

**Read the response** — extract the list of projects Claude suggested.

**Message 2** — ask for details on the most interesting one:
> Расскажи подробнее про [первый проект из списка] — какие задания нужно выполнить, есть ли дедлайн снапшота, какой токен?

Wait for response. Extract: project name, slug idea, tasks list, deadline if any, token ticker if known.

**Message 3** — commit to this project:
> Отлично, давай начнём с него. Подпиши меня на этот аирдроп.

**Verify:** `subscribe_to_project` called, response confirms subscription.
Record: PROJECT = name Claude used, TASKS = task list from response.

---

## Step 6 — Full tool coverage (Phase 2)

Now exercise every remaining tool using the project from Phase 1. Send messages one by one.

**Message rules:**
- Write as a real user who knows nothing about MCP tools or their names
- Never mention tool names, never say "вызови", "используй инструмент" и т.п.
- Just natural questions and requests a real person would ask

**For each message:** wait for full response → `mcp__claude-in-chrome__get_page_text` → verify the expected tool was called (you can see tool calls in Claude's response) → record ✅ / ❌.
**Never stop on failure.**

---

> Добавь мой кошелёк для этого проекта. Какой адрес посоветуешь использовать для демо?

Verify: `track_wallet` called.

---

> Перед тем как начать делать задания, насколько мой кошелёк выглядит подозрительно для систем защиты от ботов?

Verify: `check_sybil_risk` called, risk score in response.

---

*(skip if `get_airdrop_news` not in index.ts)*
> Что сейчас пишут про условия этого аирдропа в твиттере?

Verify: `get_airdrop_news` called. **Free tier:** проверь что пришло не больше 3 результатов. **Pro:** до 25.

---

> Я только что сделал [task 1 from Phase 1] и [task 2 from Phase 1]. Запомни это.

Verify: `log_task_completion` called (likely twice).

---

> Что я уже успел сделать по этому проекту?

Verify: `get_task_progress` called, lists logged tasks.

---

> Покажи всё что ты про меня знаешь — все проекты, кошельки.

Verify: `get_portfolio` called, project and wallet appear.

---

> Когда дедлайн по моим кошелькам?

Verify: `get_wallet_status` called.

---

> Давай представим что аирдроп уже случился и я получил токены. Сохрани это.

Verify: `log_claimed_airdrop` called.

---

> Всё, я закончил с этим проектом. Можешь убрать его.

Verify: `untrack_project` called, project gone from portfolio.

Then:
> Найди мне сразу два новых актуальных аирдропа и добавь оба.

Verify: первый успешно, второй упирается в лимит. Claude объясняет ограничение по-русски — упоминает **1 проект** и **3 новости** как лимиты Free, предлагает Pro за $15/мес.

---

## Step 7 — GIF and report

Record GIF: `mcp__claude-in-chrome__gif_creator`, name `airdrop-mcp-qa-<YYYY-MM-DD>.gif`.

Print table in chat:

```
| # | Tool | Сцена | Статус | Заметка |
|---|------|-------|--------|---------|
```

`Результат: X/N прошло`

List any failures with actual response snippet.

---

## Notes

- User ID: локально — `DEV_USER_ID` из `.env`; на реальном MCPize gateway — приходит из `X-MCPize-User-ID` хедера автоматически
- Project, tasks, ticker — all come from Claude's own web search in the conversation
- If a tool from Step 1 list is not covered — add a natural message to trigger it
- Screenshot and continue if chat gets stuck

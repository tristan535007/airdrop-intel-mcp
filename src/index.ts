import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import {
  searchAirdrops,
  getAirdropDetails,
  trackWallet,
  getWalletStatus,
  getPortfolio,
  getUpcomingSnapshotsList,
  getUserStats,
  getOrCreateUserByMcpizeKey,
} from "./tools.js";
import { checkSybilRisk } from "./lib/sybil.js";
import { initDb } from "./lib/db.js";
import { requestContext, getCurrentUserId } from "./lib/context.js";

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}
function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}
function truncate(str: string, maxLen = 80): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;
  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : "";
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan("→")} ${method}${paramsStr}`);
}
function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;
  const latency = formatLatency(latencyMs);
  if (method === "tools/call" && result) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("←")} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`);
  } else {
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("✓")} ${method} ${chalk.gray(`(${latency})`)}`);
  }
}
function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);
  const rpcError = error as { message?: string; code?: number };
  const errorMsg = rpcError?.message || String(error);
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.red("✖")} ${method} ${chalk.red(truncate(errorMsg))} ${chalk.gray(`(${latency})`)}`);
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new McpServer({
  name: "airdrop-intel-mcp",
  version: "1.0.0",
});

// ---- search_airdrops ----
server.registerTool(
  "search_airdrops",
  {
    title: "Search Airdrops",
    description: "Search for active crypto airdrops and testnets. Returns a list of projects with funding, deadlines, difficulty, and estimated rewards. Use filters to narrow results — do NOT pass natural language sentences as query, use short English keywords only. The database is in English, always translate user intent to English keywords before calling this tool.",
    inputSchema: {
      query: z.string().optional().describe("Short keyword to match project name, description or tag. Use single words like 'monad', 'zk', 'layer2', 'defi', 'gaming'. Do NOT pass full sentences or phrases."),
      chains: z.array(z.string()).optional().describe("Filter by chain names (e.g. ['ethereum', 'base', 'arbitrum'])"),
      difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Filter by task difficulty"),
      min_funding: z.number().optional().describe("Minimum project funding in USD millions (e.g. 50 for $50M+). For 'top funded' requests use this filter instead of query."),
    },
  },
  async (input) => {
    const airdrops = searchAirdrops(input);
    const output = { airdrops, total: airdrops.length };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
    };
  }
);

// ---- get_airdrop_details ----
server.registerTool(
  "get_airdrop_details",
  {
    title: "Get Airdrop Details",
    description: "Get full details for a specific airdrop project including all tasks, requirements, and step-by-step guide.",
    inputSchema: {
      project_id: z.string().describe("Project slug (e.g. 'monad', 'megaeth', 'aztec'). Get slugs from search_airdrops."),
    },
  },
  async ({ project_id }) => {
    const project = getAirdropDetails(project_id);
    return {
      content: [{ type: "text", text: project ? JSON.stringify({ project }, null, 2) : `Project "${project_id}" not found. Use search_airdrops to see available projects.` }],
    };
  }
);

// ---- track_wallet ----
server.registerTool(
  "track_wallet",
  {
    title: "Track Wallet",
    description: "Add a wallet address to your tracker for a specific airdrop project. Free tier allows 1 project.",
    inputSchema: {
      address: z.string().describe("Ethereum wallet address (0x...)"),
      project_id: z.string().describe("Project slug to track (e.g. 'monad'). Get from search_airdrops."),
    },
  },
  async ({ address, project_id }) => {
    const user_id = getCurrentUserId();
    const result = await trackWallet(address, project_id, user_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ---- get_wallet_status ----
server.registerTool(
  "get_wallet_status",
  {
    title: "Get Wallet Status",
    description: "Check the status of all your tracked wallets and projects. Shows deadlines, urgency, and upcoming actions.",
    inputSchema: {
      wallet_address: z.string().optional().describe("Filter to a specific wallet address (optional)"),
    },
  },
  async ({ wallet_address }) => {
    const user_id = getCurrentUserId();
    const result = await getWalletStatus(user_id, wallet_address);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ---- get_portfolio ----
server.registerTool(
  "get_portfolio",
  {
    title: "Get Portfolio",
    description: "Get a full overview of all your tracked airdrops and wallets with estimated pending rewards.",
    inputSchema: {},
  },
  async () => {
    const user_id = getCurrentUserId();
    const result = await getPortfolio(user_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ---- check_sybil_risk ----
server.registerTool(
  "check_sybil_risk",
  {
    title: "Check Sybil Risk",
    description: "Analyze a wallet's on-chain patterns for Sybil detection risk before an airdrop snapshot. Returns risk score 0-100 and specific recommendations.",
    inputSchema: {
      address: z.string().describe("Ethereum wallet address to analyze (0x...)"),
      chain: z.string().optional().describe("Chain to check (default: 'ethereum'). Supported: ethereum, base, arbitrum, optimism"),
    },
  },
  async ({ address, chain }) => {
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Invalid wallet address", address }) }], isError: true };
    }
    const result = await checkSybilRisk(address, chain || "ethereum");
    const output = {
      address: result.address,
      risk_score: result.riskScore,
      risk_level: result.riskLevel,
      risks: result.risks,
      recommendations: result.recommendations,
      tx_count: result.txCount,
      unique_protocols: result.uniqueProtocols,
      wallet_age_days: result.walletAgeDays,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
    };
  }
);

// ---- get_upcoming_snapshots ----
server.registerTool(
  "get_upcoming_snapshots",
  {
    title: "Get Upcoming Snapshots",
    description: "List upcoming airdrop snapshots and deadlines sorted by urgency. Use this to know what needs attention soon.",
    inputSchema: {
      days: z.number().optional().describe("How many days ahead to look (default: 90)"),
    },
  },
  async ({ days }) => {
    const snapshots = getUpcomingSnapshotsList(days ?? 90);
    const output = { snapshots, total: snapshots.length };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
    };
  }
);

// ============================================================================
// Express App
// ============================================================================

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", server: "airdrop-intel-mcp", version: "1.0.0" });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;
  const method = body?.method || "unknown";
  const params = body?.params;

  if (isDev && method === "initialize") {
    const relevantHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(([k]) => k.startsWith("x-mcpize") || k.startsWith("x-user") || k === "authorization")
    );
    if (Object.keys(relevantHeaders).length > 0) {
      console.log(chalk.gray(`[headers] ${JSON.stringify(relevantHeaders)}`));
    }
  }

  if (method === "tools/call") {
    const toolName = params?.name || "unknown";
    logRequest(`tools/call ${chalk.bold(toolName)}`, params?.arguments);
  } else if (method !== "notifications/initialized") {
    logRequest(method, params);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    if (method !== "notifications/initialized") {
      const latency = Date.now() - startTime;
      try {
        const rpcResponse = JSON.parse(responseBody) as { result?: unknown; error?: unknown };
        if (rpcResponse?.error) {
          logError(method, rpcResponse.error, latency);
        } else if (method === "tools/call") {
          const content = (rpcResponse?.result as { content?: Array<{ text?: string }> })?.content;
          logResponse(method, content?.[0]?.text, latency);
        } else {
          logResponse(method, null, latency);
        }
      } catch {
        logResponse(method, null, latency);
      }
    }
    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  const userId =
    (req.headers["x-mcpize-user-id"] as string) ||      // MCPize: coming soon
    (req.headers["x-mcpize-user-key"] as string) ||     // MCPize: legacy fallback
    (req.headers["x-user-key"] as string) ||
    process.env.DEV_USER_ID ||
    "local-dev-user";

  res.on("close", () => transport.close());
  await requestContext.run({ userId }, async () => {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
});

app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start
// ============================================================================

const port = parseInt(process.env.PORT || "8080");

await initDb();

const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("🚀 Airdrop Intel MCP"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);
  console.log(`  ${chalk.gray("Tools:")}  search_airdrops, get_airdrop_details, track_wallet,`);
  console.log(`           get_wallet_status, get_portfolio, check_sybil_risk, get_upcoming_snapshots`);
  if (isDev) {
    console.log();
    console.log(chalk.gray("─".repeat(60)));
    console.log();
  }
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});

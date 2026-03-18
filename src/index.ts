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
    description: "Search for active crypto airdrops and testnets. Returns a list of projects with funding, deadlines, difficulty, and estimated rewards.",
    inputSchema: {
      query: z.string().optional().describe("Search by project name or keyword (e.g. 'monad', 'zk', 'layer2')"),
      chains: z.array(z.string()).optional().describe("Filter by chain names (e.g. ['ethereum', 'base', 'arbitrum'])"),
      difficulty: z.enum(["easy", "medium", "hard"]).optional().describe("Filter by task difficulty"),
      min_funding: z.number().optional().describe("Minimum project funding in USD millions (e.g. 50 for $50M+)"),
    },
    outputSchema: {
      airdrops: z.array(z.object({
        slug: z.string(),
        name: z.string(),
        description: z.string(),
        funding_usd_millions: z.number(),
        difficulty: z.string(),
        estimated_reward_usd: z.string(),
        deadline: z.string().nullable(),
        task_count: z.number(),
      })),
      total: z.number(),
    },
  },
  async (input) => {
    const airdrops = searchAirdrops(input);
    const output = { airdrops, total: airdrops.length };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
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
    outputSchema: {
      project: z.object({
        slug: z.string(),
        name: z.string(),
        description: z.string(),
        notes: z.string(),
        official_url: z.string(),
        estimated_reward_usd: z.string(),
        required_tx_per_week: z.number(),
        required_protocols: z.number(),
        total_estimated_minutes: z.number(),
        tasks: z.array(z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          type: z.string(),
          automated: z.boolean(),
          estimated_minutes: z.number(),
        })),
      }).nullable(),
    },
  },
  async ({ project_id }) => {
    const project = getAirdropDetails(project_id);
    const output = { project };
    return {
      content: [{ type: "text", text: project ? JSON.stringify(output, null, 2) : `Project "${project_id}" not found. Use search_airdrops to see available projects.` }],
      structuredContent: output,
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
      user_id: z.string().describe("Your MCPize API key or unique user identifier"),
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
      upgrade_required: z.boolean(),
    },
  },
  async ({ address, project_id, user_id }) => {
    const result = trackWallet(address, project_id, user_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
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
      user_id: z.string().describe("Your MCPize API key or unique user identifier"),
      wallet_address: z.string().optional().describe("Filter to a specific wallet address (optional)"),
    },
    outputSchema: {
      tracked_count: z.number(),
      statuses: z.array(z.object({
        wallet: z.string(),
        project_name: z.string(),
        deadline: z.string().nullable(),
        days_until_deadline: z.number().nullable(),
        urgency: z.string(),
      })),
    },
  },
  async ({ user_id, wallet_address }) => {
    const result = getWalletStatus(user_id, wallet_address);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }
);

// ---- get_portfolio ----
server.registerTool(
  "get_portfolio",
  {
    title: "Get Portfolio",
    description: "Get a full overview of all your tracked airdrops and wallets with estimated pending rewards.",
    inputSchema: {
      user_id: z.string().describe("Your MCPize API key or unique user identifier"),
    },
    outputSchema: {
      tier: z.string(),
      total_projects: z.number(),
      total_wallets: z.number(),
      estimated_pending_usd: z.string(),
      projects: z.array(z.object({
        slug: z.string(),
        name: z.string(),
        wallets: z.array(z.string()),
        days_until_deadline: z.number().nullable(),
        estimated_reward_usd: z.string(),
      })),
    },
  },
  async ({ user_id }) => {
    const result = getPortfolio(user_id);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
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
    outputSchema: {
      address: z.string(),
      risk_score: z.number(),
      risk_level: z.string(),
      risks: z.array(z.object({ type: z.string(), severity: z.string(), description: z.string() })),
      recommendations: z.array(z.string()),
      tx_count: z.number(),
      unique_protocols: z.number(),
      wallet_age_days: z.number(),
    },
  },
  async ({ address, chain }) => {
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      const error = { error: "Invalid wallet address", address };
      return { content: [{ type: "text", text: JSON.stringify(error) }], structuredContent: error, isError: true };
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
      structuredContent: output,
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
    outputSchema: {
      snapshots: z.array(z.object({
        project_slug: z.string(),
        project_name: z.string(),
        date: z.string(),
        type: z.string(),
        days_remaining: z.number(),
        urgency: z.string(),
        estimated_reward_usd: z.string(),
      })),
      total: z.number(),
    },
  },
  async ({ days }) => {
    const snapshots = getUpcomingSnapshotsList(days ?? 90);
    const output = { snapshots, total: snapshots.length };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
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

  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start
// ============================================================================

const port = parseInt(process.env.PORT || "8080");
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

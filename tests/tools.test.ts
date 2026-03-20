import { describe, it, expect, beforeAll } from "vitest";
import { initDb } from "../src/lib/db.js";
import {
  subscribeToAirdrop,
  trackWallet,
  getWalletStatus,
  getPortfolio,
  untrackProject,
  logTaskCompletion,
  getTaskProgress,
  logClaimedAirdrop,
} from "../src/tools.js";

beforeAll(async () => {
  await initDb();
});

const TEST_WALLET = "0x742d35Cc6634C0532925a3b8D4C9B1DAB8Adf35b";

// ============================================================================
// subscribe_to_project
// ============================================================================

describe("subscribeToAirdrop", () => {
  it("subscribes user to a project", async () => {
    const user = `test-sub-${Date.now()}`;
    const result = await subscribeToAirdrop("monad", "Monad", user);
    expect(result.success).toBe(true);
    expect(result.project_slug).toBe("monad");
    expect(result.upgrade_required).toBe(false);
  });

  it("is idempotent — subscribing twice is fine", async () => {
    const user = `test-sub-idem-${Date.now()}`;
    await subscribeToAirdrop("monad", "Monad", user);
    const result = await subscribeToAirdrop("monad", "Monad", user);
    expect(result.success).toBe(true);
  });

  it("enforces free tier limit on second project", async () => {
    const user = `test-sub-tier-${Date.now()}`;
    const r1 = await subscribeToAirdrop("monad", "Monad", user);
    expect(r1.success).toBe(true);
    const r2 = await subscribeToAirdrop("megaeth", "MegaETH", user);
    expect(r2.success).toBe(false);
    expect(r2.upgrade_required).toBe(true);
    expect(r2.message).toContain("FREE_TIER_LIMIT");
  });

  it("pro user can subscribe to multiple projects", async () => {
    const user = `test-sub-pro-${Date.now()}`;
    const r1 = await subscribeToAirdrop("monad", "Monad", user, true);
    expect(r1.success).toBe(true);
    const r2 = await subscribeToAirdrop("megaeth", "MegaETH", user, true);
    expect(r2.success).toBe(true);
  });

  it("stores deadline when provided", async () => {
    const user = `test-sub-deadline-${Date.now()}`;
    await subscribeToAirdrop("starknet", "StarkNet", user, false, "2026-09-01");
    const portfolio = await getPortfolio(user);
    const project = portfolio.projects.find((p) => p.slug === "starknet");
    expect(project?.deadline).toBe("2026-09-01");
  });
});

// ============================================================================
// track_wallet
// ============================================================================

describe("trackWallet", () => {
  it("adds a valid wallet successfully", async () => {
    const user = `test-wallet-${Date.now()}`;
    const result = await trackWallet(TEST_WALLET, "monad", "Monad", user);
    expect(result.success).toBe(true);
    expect(result.upgrade_required).toBe(false);
    expect(result.project_name).toBe("Monad");
  });

  it("rejects invalid wallet address", async () => {
    const result = await trackWallet("not-a-wallet", "monad", "Monad", `user-${Date.now()}`);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid wallet");
  });

  it("enforces free tier limit on second project", async () => {
    const user = `test-wallet-tier-${Date.now()}`;
    const r1 = await trackWallet(TEST_WALLET, "monad", "Monad", user);
    expect(r1.success).toBe(true);
    const r2 = await trackWallet(TEST_WALLET, "megaeth", "MegaETH", user);
    expect(r2.success).toBe(false);
    expect(r2.upgrade_required).toBe(true);
  });

  it("pro user can track multiple projects", async () => {
    const user = `test-wallet-pro-${Date.now()}`;
    const r1 = await trackWallet(TEST_WALLET, "monad", "Monad", user, true);
    expect(r1.success).toBe(true);
    const r2 = await trackWallet(TEST_WALLET, "megaeth", "MegaETH", user, true);
    expect(r2.success).toBe(true);
  });
});

// ============================================================================
// get_wallet_status
// ============================================================================

describe("getWalletStatus", () => {
  it("returns tracked wallets for existing user", async () => {
    const user = `test-wstatus-${Date.now()}`;
    await trackWallet(TEST_WALLET, "monad", "Monad", user);
    const result = await getWalletStatus(user);
    expect(result.tracked_count).toBeGreaterThan(0);
    expect(result.statuses[0].wallet).toBe(TEST_WALLET.toLowerCase());
  });

  it("returns empty for new user", async () => {
    const result = await getWalletStatus(`brand-new-${Date.now()}`);
    expect(result.tracked_count).toBe(0);
  });

  it("shows deadline urgency when deadline is set", async () => {
    const user = `test-urgency-${Date.now()}`;
    await subscribeToAirdrop("starknet", "StarkNet", user, false, "2026-09-01");
    await trackWallet(TEST_WALLET, "starknet", "StarkNet", user);
    const result = await getWalletStatus(user);
    const status = result.statuses.find((s) => s.project_slug === "starknet");
    expect(status?.deadline).toBe("2026-09-01");
    expect(status?.urgency).toBeDefined();
  });
});

// ============================================================================
// untrack_project
// ============================================================================

describe("untrackProject", () => {
  it("removes subscription and wallets", async () => {
    const user = `test-untrack-${Date.now()}`;
    await trackWallet(TEST_WALLET, "monad", "Monad", user);
    const result = await untrackProject("monad", user);
    expect(result.success).toBe(true);
    const portfolio = await getPortfolio(user);
    expect(portfolio.projects.find((p) => p.slug === "monad")).toBeUndefined();
  });

  it("removes testnet subscription (no wallet)", async () => {
    const user = `test-untrack-testnet-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    await untrackProject("monad", user);
    const portfolio = await getPortfolio(user);
    expect(portfolio.projects.find((p) => p.slug === "monad")).toBeUndefined();
  });

  it("cleans up task completions on untrack", async () => {
    const user = `test-untrack-cleanup-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    await logTaskCompletion("monad", "ambient-swap", user);
    await untrackProject("monad", user);
    await subscribeToAirdrop("monad", "Monad", user);
    const progress = await getTaskProgress("monad", user);
    expect(progress.completed_count).toBe(0);
  });

  it("after untrack, free tier slot is freed", async () => {
    const user = `test-untrack-free-${Date.now()}`;
    await subscribeToAirdrop("monad", "Monad", user);
    await untrackProject("monad", user);
    const r = await subscribeToAirdrop("megaeth", "MegaETH", user);
    expect(r.success).toBe(true);
  });
});

// ============================================================================
// get_portfolio
// ============================================================================

describe("getPortfolio", () => {
  it("returns portfolio for subscribed user", async () => {
    const user = `test-portfolio-${Date.now()}`;
    await subscribeToAirdrop("monad", "Monad", user);
    const result = await getPortfolio(user);
    expect(result.total_projects).toBe(1);
    expect(result.projects[0].slug).toBe("monad");
    expect(result.projects[0].name).toBe("Monad");
  });

  it("returns empty portfolio for new user", async () => {
    const result = await getPortfolio(`brand-new-${Date.now()}`);
    expect(result.total_projects).toBe(0);
    expect(result.projects).toHaveLength(0);
  });

  it("shows tasks_completed in portfolio", async () => {
    const user = `test-portfolio-tasks-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    await logTaskCompletion("monad", "ambient-swap", user);
    const result = await getPortfolio(user);
    const monad = result.projects.find((p) => p.slug === "monad");
    expect(monad?.tasks_completed).toBe(2);
  });

  it("testnet project appears without wallet", async () => {
    const user = `test-portfolio-testnet-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    const result = await getPortfolio(user);
    expect(result.projects.find((p) => p.slug === "monad")).toBeDefined();
  });
});

// ============================================================================
// log_task_completion + get_task_progress
// ============================================================================

describe("logTaskCompletion", () => {
  it("marks a task as completed", async () => {
    const user = `test-task-${Date.now()}`;
    const result = await logTaskCompletion("monad", "faucet-claim", user);
    expect(result.success).toBe(true);
    expect(result.task_id).toBe("faucet-claim");
  });

  it("is idempotent — marking same task twice is fine", async () => {
    const user = `test-task-idem-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    const result = await logTaskCompletion("monad", "faucet-claim", user);
    expect(result.success).toBe(true);
  });

  it("auto-subscribes user to project", async () => {
    const user = `test-task-autosub-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    const portfolio = await getPortfolio(user);
    expect(portfolio.projects.find((p) => p.slug === "monad")).toBeDefined();
  });

  it("does not auto-subscribe on free tier second project", async () => {
    const user = `test-task-tier-${Date.now()}`;
    await subscribeToAirdrop("monad", "Monad", user);
    const result = await logTaskCompletion("megaeth", "task-1", user, false);
    expect(result.success).toBe(true);
    expect(result.upgrade_required).toBe(true);
    const portfolio = await getPortfolio(user);
    expect(portfolio.projects.find((p) => p.slug === "megaeth")).toBeUndefined();
  });

  it("pro user can auto-subscribe via task log", async () => {
    const user = `test-task-pro-autosub-${Date.now()}`;
    await subscribeToAirdrop("monad", "Monad", user, true);
    const result = await logTaskCompletion("megaeth", "task-1", user, true);
    expect(result.success).toBe(true);
    expect(result.upgrade_required).toBe(false);
    const portfolio = await getPortfolio(user);
    expect(portfolio.projects.find((p) => p.slug === "megaeth")).toBeDefined();
  });
});

describe("getTaskProgress", () => {
  it("shows completed tasks", async () => {
    const user = `test-progress-${Date.now()}`;
    await logTaskCompletion("monad", "faucet-claim", user);
    await logTaskCompletion("monad", "ambient-swap", user);
    const result = await getTaskProgress("monad", user);
    expect(result.completed_count).toBe(2);
    expect(result.completed_tasks).toContain("faucet-claim");
    expect(result.completed_tasks).toContain("ambient-swap");
  });

  it("returns zero for new user", async () => {
    const result = await getTaskProgress("monad", `brand-new-${Date.now()}`);
    expect(result.completed_count).toBe(0);
  });
});

// ============================================================================
// log_claimed_airdrop
// ============================================================================

describe("logClaimedAirdrop", () => {
  it("logs a claimed airdrop", async () => {
    const user = `test-claim-${Date.now()}`;
    const result = await logClaimedAirdrop("monad", user, "1500 MON", 750);
    expect(result.success).toBe(true);
    expect(result.tokens_received).toBe("1500 MON");
    expect(result.usd_value).toBe(750);
  });

  it("works without usd_value", async () => {
    const user = `test-claim-nousd-${Date.now()}`;
    const result = await logClaimedAirdrop("starknet", user, "200 STRK");
    expect(result.success).toBe(true);
    expect(result.usd_value).toBe(0);
  });
});

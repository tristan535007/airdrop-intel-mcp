import { describe, it, expect, beforeAll } from "vitest";
import { initDb } from "../src/lib/db.js";
import { searchAirdrops, getAirdropDetails, trackWallet, getWalletStatus, getPortfolio, getUpcomingSnapshotsList } from "../src/tools.js";

beforeAll(async () => {
  await initDb();
});

// ============================================================================
// search_airdrops
// ============================================================================

describe("searchAirdrops", () => {
  it("returns all active airdrops with no filters", () => {
    const result = searchAirdrops({});
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("slug");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("funding_usd_millions");
    expect(result[0]).toHaveProperty("estimated_reward_usd");
    expect(result[0]).toHaveProperty("task_count");
  });

  it("filters by query", () => {
    const result = searchAirdrops({ query: "monad" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].slug).toBe("monad");
  });

  it("filters by difficulty", () => {
    const easy = searchAirdrops({ difficulty: "easy" });
    expect(easy.every((p) => p.difficulty === "easy")).toBe(true);
  });

  it("filters by min_funding", () => {
    const result = searchAirdrops({ min_funding: 200 });
    expect(result.every((p) => p.funding_usd_millions >= 200)).toBe(true);
  });

  it("finds by tag 'layer2'", () => {
    const result = searchAirdrops({ query: "layer2" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("finds by tag 'zk'", () => {
    const result = searchAirdrops({ query: "zk" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns results sorted by funding descending", () => {
    const result = searchAirdrops({});
    for (let i = 1; i < result.length; i++) {
      expect(result[i].funding_usd_millions).toBeLessThanOrEqual(result[i - 1].funding_usd_millions);
    }
  });
});

// ============================================================================
// get_airdrop_details
// ============================================================================

describe("getAirdropDetails", () => {
  it("returns full details for a known project", () => {
    const result = getAirdropDetails("monad");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("monad");
    expect(result!.tasks.length).toBeGreaterThan(0);
    expect(result!.required_tx_per_week).toBeGreaterThan(0);
    expect(result!.total_estimated_minutes).toBeGreaterThan(0);
  });

  it("returns tasks with required fields", () => {
    const result = getAirdropDetails("monad");
    result!.tasks.forEach((task) => {
      expect(task).toHaveProperty("id");
      expect(task).toHaveProperty("title");
      expect(task).toHaveProperty("type");
      expect(task).toHaveProperty("automated");
    });
  });

  it("returns null for unknown project", () => {
    const result = getAirdropDetails("nonexistent-project-xyz");
    expect(result).toBeNull();
  });
});

// ============================================================================
// track_wallet
// ============================================================================

const TEST_USER = `test-user-vitest-${Date.now()}`;
const TEST_WALLET = "0x742d35Cc6634C0532925a3b8D4C9B1DAB8Adf35b";

describe("trackWallet", () => {
  it("adds a valid wallet successfully", async () => {
    const result = await trackWallet(TEST_WALLET, "monad", TEST_USER);
    expect(result.success).toBe(true);
    expect(result.upgrade_required).toBe(false);
    expect(result.project_name).toBe("Monad");
  });

  it("rejects invalid wallet address", async () => {
    const result = await trackWallet("not-a-wallet", "monad", TEST_USER);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid wallet");
  });

  it("rejects unknown project", async () => {
    const result = await trackWallet(TEST_WALLET, "unknown-project-xyz", TEST_USER);
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("enforces free tier limit on second project", async () => {
    const user2 = `test-user-tier-${Date.now()}`;
    const r1 = await trackWallet(TEST_WALLET, "monad", user2);
    expect(r1.success).toBe(true);
    const r2 = await trackWallet(TEST_WALLET, "megaeth", user2);
    expect(r2.success).toBe(false);
    expect(r2.upgrade_required).toBe(true);
    expect(r2.message).toContain("FREE_TIER_LIMIT");
  });
});

// ============================================================================
// get_wallet_status
// ============================================================================

describe("getWalletStatus", () => {
  it("returns tracked wallets for existing user", async () => {
    const result = await getWalletStatus(TEST_USER);
    expect(result).toHaveProperty("tracked_count");
    expect(result).toHaveProperty("statuses");
    expect(result.tracked_count).toBeGreaterThan(0);
  });

  it("returns empty for new user", async () => {
    const result = await getWalletStatus(`brand-new-user-${Date.now()}`);
    expect(result.tracked_count).toBe(0);
    expect(result.statuses).toHaveLength(0);
  });
});

// ============================================================================
// get_portfolio
// ============================================================================

describe("getPortfolio", () => {
  it("returns portfolio for a user with tracked wallets", async () => {
    const result = await getPortfolio(TEST_USER);
    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("total_projects");
    expect(result).toHaveProperty("projects");
    expect(result.total_projects).toBeGreaterThan(0);
    expect(result.projects[0].wallets.length).toBeGreaterThan(0);
  });

  it("returns empty portfolio for new user", async () => {
    const result = await getPortfolio(`brand-new-user-${Date.now()}`);
    expect(result.total_projects).toBe(0);
    expect(result.projects.length).toBe(0);
  });
});

// ============================================================================
// get_upcoming_snapshots
// ============================================================================

describe("getUpcomingSnapshotsList", () => {
  it("returns snapshots within the specified window", () => {
    const result = getUpcomingSnapshotsList(365);
    expect(Array.isArray(result)).toBe(true);
    result.forEach((s) => {
      expect(s).toHaveProperty("project_slug");
      expect(s).toHaveProperty("days_remaining");
      expect(s).toHaveProperty("urgency");
      expect(s.days_remaining).toBeGreaterThanOrEqual(0);
    });
  });

  it("urgency is correct based on days_remaining", () => {
    const all = getUpcomingSnapshotsList(365);
    all.forEach((s) => {
      if (s.days_remaining < 3) expect(s.urgency).toBe("urgent");
      else if (s.days_remaining < 14) expect(s.urgency).toBe("soon");
      else expect(s.urgency).toBe("ok");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/api-client.js", () => ({
  searchTwitterAirdrops: vi.fn(),
  getWalletTransactions: vi.fn(),
  getWalletAge: vi.fn(),
  getUniqueProtocols: vi.fn(),
  getTokenlessProtocols: vi.fn(),
  getAirdropEvents: vi.fn(),
}));

import { getAirdropNews } from "../src/tools.js";
import { searchTwitterAirdrops } from "../src/lib/api-client.js";

describe("getAirdropNews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty tweets when search returns nothing", async () => {
    vi.mocked(searchTwitterAirdrops).mockResolvedValue([]);
    const result = await getAirdropNews();
    expect(result.tweets).toHaveLength(0);
    expect(result.source).toBe("twitter");
  });

  it("returns tweets from search results", async () => {
    vi.mocked(searchTwitterAirdrops).mockResolvedValue([
      {
        id: "123",
        text: "Monad airdrop: 100 txns required on testnet",
        author: "monad_xyz",
        date: "2026-03-23T12:00:00Z",
        url: "https://x.com/monad_xyz/status/123",
        likes: 1200,
        retweets: 350,
      },
    ]);
    const result = await getAirdropNews("monad airdrop conditions");
    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0].text).toBe("Monad airdrop: 100 txns required on testnet");
    expect(result.tweets[0].author).toBe("monad_xyz");
    expect(result.source).toBe("twitter");
    expect(result.query).toBe("monad airdrop conditions");
  });

  it("uses default query and limit when called with no args (free tier caps at 3)", async () => {
    vi.mocked(searchTwitterAirdrops).mockResolvedValue([]);
    await getAirdropNews();
    expect(searchTwitterAirdrops).toHaveBeenCalledWith("crypto airdrop conditions", 3);
  });

  it("caps limit at 25 for pro user", async () => {
    vi.mocked(searchTwitterAirdrops).mockResolvedValue([]);
    await getAirdropNews("test query", 100, true);
    expect(searchTwitterAirdrops).toHaveBeenCalledWith("test query", 25);
  });

  it("respects limit below 25 for pro user", async () => {
    vi.mocked(searchTwitterAirdrops).mockResolvedValue([]);
    await getAirdropNews("test query", 5, true);
    expect(searchTwitterAirdrops).toHaveBeenCalledWith("test query", 5);
  });

  it("includes note when no results", async () => {
    vi.mocked(searchTwitterAirdrops).mockResolvedValue([]);
    const result = await getAirdropNews();
    expect(result.note).toBeDefined();
    expect(typeof result.note).toBe("string");
  });
});

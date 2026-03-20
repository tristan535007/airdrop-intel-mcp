import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EthTx } from "../src/lib/api-client.js";

vi.mock("../src/lib/api-client.js", () => ({
  getWalletTransactions: vi.fn(),
  getWalletAge: vi.fn(),
  getUniqueProtocols: vi.fn(),
}));

import { checkSybilRisk } from "../src/lib/sybil.js";
import { getWalletTransactions, getWalletAge, getUniqueProtocols } from "../src/lib/api-client.js";

const TEST_ADDRESS = "0x742d35cc6634c0532925a3b8d4c9b1dab8adf35b";

function makeTxns(count: number, timestampStep = 100000, value = "12345678901234567"): EthTx[] {
  return Array.from({ length: count }, (_, i) => ({
    hash: `0x${i}`,
    timeStamp: String(1700000000 + i * timestampStep),
    value,
    from: TEST_ADDRESS,
    to: `0xprotocol${i % 5}`,
    isError: "0",
    contractAddress: "",
  }));
}

describe("checkSybilRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns low risk for healthy wallet", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(400);
    vi.mocked(getUniqueProtocols).mockResolvedValue(["0xa", "0xb", "0xc", "0xd", "0xe"]);
    // Irregular timing — varies significantly
    vi.mocked(getWalletTransactions).mockResolvedValue(makeTxns(15, 0).map((tx, i) => ({
      ...tx,
      timeStamp: String(1700000000 + i * (50000 + i * 13337)),
      value: String(10000000000000000 + i * 7777777),
    })));

    const result = await checkSybilRisk(TEST_ADDRESS);
    expect(result.riskLevel).toBe("low");
    expect(result.riskScore).toBeLessThan(30);
    expect(result.address).toBe(TEST_ADDRESS);
  });

  it("flags new wallet (< 30 days)", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(10);
    vi.mocked(getUniqueProtocols).mockResolvedValue(["0xa", "0xb", "0xc", "0xd", "0xe"]);
    vi.mocked(getWalletTransactions).mockResolvedValue(makeTxns(15));

    const result = await checkSybilRisk(TEST_ADDRESS);
    expect(result.risks.some((r) => r.type === "new_wallet")).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it("flags low protocol diversity (< 3 protocols)", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(400);
    vi.mocked(getUniqueProtocols).mockResolvedValue(["0xabc"]);
    vi.mocked(getWalletTransactions).mockResolvedValue(makeTxns(15));

    const result = await checkSybilRisk(TEST_ADDRESS);
    expect(result.risks.some((r) => r.type === "low_protocol_diversity")).toBe(true);
  });

  it("flags timing regularity (bot-like fixed intervals)", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(400);
    vi.mocked(getUniqueProtocols).mockResolvedValue(["0xa", "0xb", "0xc", "0xd", "0xe"]);
    // Perfectly regular — every 1000 seconds exactly
    vi.mocked(getWalletTransactions).mockResolvedValue(makeTxns(10, 1000));

    const result = await checkSybilRisk(TEST_ADDRESS);
    expect(result.risks.some((r) => r.type === "timing_regularity")).toBe(true);
  });

  it("flags low activity (< 10 txns)", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(400);
    vi.mocked(getUniqueProtocols).mockResolvedValue(["0xa", "0xb", "0xc", "0xd", "0xe"]);
    vi.mocked(getWalletTransactions).mockResolvedValue(makeTxns(5));

    const result = await checkSybilRisk(TEST_ADDRESS);
    expect(result.risks.some((r) => r.type === "low_activity")).toBe(true);
  });

  it("caps risk score at 100", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(5);
    vi.mocked(getUniqueProtocols).mockResolvedValue([]);
    vi.mocked(getWalletTransactions).mockResolvedValue([]);

    const result = await checkSybilRisk(TEST_ADDRESS);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.riskLevel).toBe("high");
  });

  it("returns correct metadata fields", async () => {
    vi.mocked(getWalletAge).mockResolvedValue(200);
    vi.mocked(getUniqueProtocols).mockResolvedValue(["0xa", "0xb", "0xc"]);
    vi.mocked(getWalletTransactions).mockResolvedValue(makeTxns(12));

    const result = await checkSybilRisk(TEST_ADDRESS, "base");
    expect(result.address).toBe(TEST_ADDRESS);
    expect(result.txCount).toBe(12);
    expect(result.uniqueProtocols).toBe(3);
    expect(result.walletAgeDays).toBe(200);
    expect(["low", "medium", "high"]).toContain(result.riskLevel);
  });
});

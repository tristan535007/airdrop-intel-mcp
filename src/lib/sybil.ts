import { getWalletTransactions, getWalletAge, getUniqueProtocols } from "./api-client.js";

// ============================================================================
// Sybil Risk Analysis — pure computation, no external data beyond Etherscan
// ============================================================================

export interface SybilCheckResult {
  address: string;
  riskScore: number; // 0 (safe) to 100 (high risk)
  riskLevel: "low" | "medium" | "high";
  risks: SybilRisk[];
  recommendations: string[];
  txCount: number;
  uniqueProtocols: number;
  walletAgeDays: number;
}

export interface SybilRisk {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export async function checkSybilRisk(address: string, chain: string = "ethereum"): Promise<SybilCheckResult> {
  const [txns, walletAgeDays, protocols] = await Promise.all([
    getWalletTransactions(address, chain),
    getWalletAge(address, chain),
    getUniqueProtocols(address, chain),
  ]);

  const risks: SybilRisk[] = [];
  let riskScore = 0;

  // ---- Check 1: Transaction timing regularity ----
  if (txns.length >= 5) {
    const timestamps = txns
      .map((tx) => parseInt(tx.timeStamp || "0"))
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    if (timestamps.length >= 3) {
      const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = avgGap > 0 ? stdDev / avgGap : 0;

      if (coefficientOfVariation < 0.1) {
        risks.push({
          type: "timing_regularity",
          severity: "high",
          description: "Transactions are suspiciously regular — very low variance in timing. Projects detect bots that transact at fixed intervals.",
        });
        riskScore += 35;
      } else if (coefficientOfVariation < 0.3) {
        risks.push({
          type: "timing_regularity",
          severity: "medium",
          description: "Transaction timing is somewhat regular. Try varying the time of day you transact.",
        });
        riskScore += 15;
      }
    }
  }

  // ---- Check 2: Protocol diversity ----
  const protocolCount = protocols.length;
  if (protocolCount < 3) {
    risks.push({
      type: "low_protocol_diversity",
      severity: "high",
      description: `Only ${protocolCount} unique contract(s) interacted with. Most projects require 3+ protocol interactions. Sybil detectors flag wallets with low diversity.`,
    });
    riskScore += 25;
  } else if (protocolCount < 5) {
    risks.push({
      type: "moderate_protocol_diversity",
      severity: "low",
      description: `${protocolCount} protocols used. Good, but adding more diverse interactions (lending, bridging, NFTs) strengthens your profile.`,
    });
    riskScore += 5;
  }

  // ---- Check 3: Wallet age ----
  if (walletAgeDays < 30) {
    risks.push({
      type: "new_wallet",
      severity: "high",
      description: `Wallet is only ${walletAgeDays} days old. Projects heavily penalize new wallets — most require 6+ months of history.`,
    });
    riskScore += 30;
  } else if (walletAgeDays < 90) {
    risks.push({
      type: "young_wallet",
      severity: "medium",
      description: `Wallet is ${walletAgeDays} days old. Some projects require 3+ months. Keep building history.`,
    });
    riskScore += 10;
  }

  // ---- Check 4: Very low transaction count ----
  if (txns.length < 10) {
    risks.push({
      type: "low_activity",
      severity: "medium",
      description: `Only ${txns.length} total transactions. Most airdrop programs reward wallets with consistent, ongoing activity.`,
    });
    riskScore += 15;
  }

  // ---- Check 5: Round number amounts (bot indicator) ----
  if (txns.length >= 5) {
    const roundValueTxns = txns.filter((tx) => {
      const val = parseFloat(tx.value || "0");
      return val > 0 && val % 1e15 === 0; // Very round ETH amounts
    });
    if (roundValueTxns.length / txns.length > 0.8) {
      risks.push({
        type: "round_amounts",
        severity: "medium",
        description: "Most transactions use identical round amounts — a common bot pattern. Vary your transaction amounts.",
      });
      riskScore += 15;
    }
  }

  // Cap at 100
  riskScore = Math.min(100, riskScore);

  const riskLevel: "low" | "medium" | "high" = riskScore < 30 ? "low" : riskScore < 60 ? "medium" : "high";

  // Build recommendations
  const recommendations: string[] = [];
  if (riskScore > 20) {
    if (walletAgeDays < 90) recommendations.push("Build wallet history — keep transacting regularly for at least 3 months before the snapshot.");
    if (protocolCount < 5) recommendations.push("Interact with more diverse protocols: try a lending protocol (Aave), an NFT marketplace (OpenSea/Blur), and a bridge.");
    if (risks.some((r) => r.type === "timing_regularity")) recommendations.push("Vary the time of day you transact — don't always do it at the same hour.");
    if (risks.some((r) => r.type === "round_amounts")) recommendations.push("Use varied transaction amounts instead of identical round numbers.");
    recommendations.push(`Current risk score: ${riskScore}/100. Aim for below 30 before any snapshot.`);
  } else {
    recommendations.push("Your wallet profile looks good. Keep maintaining regular, diverse activity.");
  }

  return {
    address,
    riskScore,
    riskLevel,
    risks,
    recommendations,
    txCount: txns.length,
    uniqueProtocols: protocolCount,
    walletAgeDays,
  };
}

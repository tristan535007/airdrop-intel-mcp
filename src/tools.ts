/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Each function is registered as an MCP tool in index.ts.
 */

import {
  addTrackedWallet,
  getTrackedWallets,
  getUserStats,
  getOrCreateUserByMcpizeKey,
  getOrCreateUser,
  markTaskComplete,
  getCompletedTasks,
  addClaimedAirdrop,
  removeAllWalletsForProject,
  removeTaskCompletionsForProject,
  subscribeToProject,
  unsubscribeFromProject,
  getSubscribedProjects,
} from "./lib/db.js";
import { checkSybilRisk } from "./lib/sybil.js";
import { searchTwitterAirdrops, Tweet } from "./lib/api-client.js";

// ============================================================================
// Tool: subscribe_to_project
// ============================================================================

export async function subscribeToAirdrop(projectSlug: string, projectName: string, userId: string, isPro = false, deadline?: string) {
  projectSlug = projectSlug.toLowerCase();
  const user = await getOrCreateUser(userId);

  if (!isPro && user.tier === "free") {
    const subscribed = await getSubscribedProjects(user.id);
    const alreadyIn = subscribed.some((s) => s.project_slug === projectSlug);
    if (subscribed.length >= 1 && !alreadyIn) {
      return {
        success: false,
        upgrade_required: true,
        message: "FREE_TIER_LIMIT: You can track 1 project on the free plan. Upgrade to Pro ($15/mo) to track unlimited projects.",
      };
    }
  }

  await subscribeToProject(user.id, projectSlug, projectName, deadline);
  return {
    success: true,
    upgrade_required: false,
    project_slug: projectSlug,
    project_name: projectName,
    message: `Subscribed to ${projectName}. Use log_task_completion to track your progress.`,
  };
}

// ============================================================================
// Tool: track_wallet
// ============================================================================

export async function trackWallet(address: string, projectSlug: string, projectName: string, userId: string, isPro = false) {
  projectSlug = projectSlug.toLowerCase();
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { success: false, message: "Invalid wallet address. Must be a 42-character hex string starting with 0x.", upgrade_required: false };
  }

  const user = await getOrCreateUser(userId);
  const result = await addTrackedWallet(user.id, address, projectSlug, projectName, isPro);

  return {
    success: result.success,
    message: result.message,
    wallet: address,
    project_name: projectName,
    project_slug: projectSlug,
    upgrade_required: result.message.startsWith("FREE_TIER_LIMIT"),
  };
}

// ============================================================================
// Tool: get_wallet_status
// ============================================================================

export async function getWalletStatus(userId: string, walletAddress?: string) {
  const user = await getOrCreateUser(userId);
  const tracked = await getTrackedWallets(user.id);
  const subscribed = await getSubscribedProjects(user.id);

  const deadlineBySlug = Object.fromEntries(subscribed.map((s) => [s.project_slug, s.deadline]));

  const filtered = walletAddress
    ? tracked.filter((t) => t.wallet_address.toLowerCase() === walletAddress.toLowerCase())
    : tracked;

  const statuses = filtered.map((t) => {
    const deadlineStr = deadlineBySlug[t.project_slug] ?? null;
    let daysUntil: number | null = null;
    let urgency: "ok" | "soon" | "urgent" | "overdue" = "ok";

    if (deadlineStr) {
      const diff = (new Date(deadlineStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      daysUntil = Math.floor(diff);
      if (diff < 0) urgency = "overdue";
      else if (diff < 3) urgency = "urgent";
      else if (diff < 14) urgency = "soon";
    }

    return {
      wallet: t.wallet_address,
      project_slug: t.project_slug,
      deadline: deadlineStr,
      days_until_deadline: daysUntil,
      urgency,
    };
  });

  return {
    user_id: userId,
    tracked_count: filtered.length,
    statuses: statuses.sort((a, b) => (a.days_until_deadline ?? 9999) - (b.days_until_deadline ?? 9999)),
  };
}

// ============================================================================
// Tool: get_portfolio
// ============================================================================

export async function getPortfolio(userId: string) {
  const user = await getOrCreateUser(userId);
  const subscribed = await getSubscribedProjects(user.id);
  const tracked = await getTrackedWallets(user.id);
  const stats = await getUserStats(user.id);

  const walletsByProject = tracked.reduce<Record<string, string[]>>((acc, t) => {
    if (!acc[t.project_slug]) acc[t.project_slug] = [];
    acc[t.project_slug].push(t.wallet_address);
    return acc;
  }, {});

  const projects = await Promise.all(subscribed.map(async (sub) => {
    const wallets = walletsByProject[sub.project_slug] || [];
    const completedTasks = await getCompletedTasks(user.id, sub.project_slug);
    const deadlineStr = sub.deadline ?? null;
    let daysUntil: number | null = null;
    if (deadlineStr) {
      daysUntil = Math.floor((new Date(deadlineStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
    return {
      slug: sub.project_slug,
      name: sub.project_name || sub.project_slug,
      wallets,
      tasks_completed: completedTasks.length,
      deadline: deadlineStr,
      days_until_deadline: daysUntil,
    };
  }));

  return {
    user_id: userId,
    tier: user.tier,
    total_projects: subscribed.length,
    total_wallets: stats.totalWallets,
    claimed_airdrops: stats.claimedAirdrops,
    projects: projects.sort((a, b) => (a.days_until_deadline ?? 9999) - (b.days_until_deadline ?? 9999)),
  };
}

// ============================================================================
// Tool: log_task_completion
// ============================================================================

export async function logTaskCompletion(projectSlug: string, taskId: string, userId: string, isPro = false, notes?: string) {
  projectSlug = projectSlug.toLowerCase();
  const user = await getOrCreateUser(userId);
  await markTaskComplete(user.id, projectSlug, taskId, notes);

  const subscribed = await getSubscribedProjects(user.id);
  const alreadyIn = subscribed.some((s) => s.project_slug === projectSlug);

  if (!alreadyIn) {
    if (!isPro && user.tier === "free" && subscribed.length >= 1) {
      return {
        success: true,
        upgrade_required: true,
        project_slug: projectSlug,
        task_id: taskId,
        message: `Task "${taskId}" logged. FREE_TIER_LIMIT: upgrade to Pro to add ${projectSlug} to your portfolio.`,
      };
    }
    await subscribeToProject(user.id, projectSlug);
  }

  return {
    success: true,
    upgrade_required: false,
    project_slug: projectSlug,
    task_id: taskId,
    message: `Task "${taskId}" marked as completed for ${projectSlug}.`,
  };
}

// ============================================================================
// Tool: get_task_progress
// ============================================================================

export async function getTaskProgress(projectSlug: string, userId: string) {
  projectSlug = projectSlug.toLowerCase();
  const user = await getOrCreateUser(userId);
  const completed = await getCompletedTasks(user.id, projectSlug);
  const sub = (await getSubscribedProjects(user.id)).find((s) => s.project_slug === projectSlug);

  return {
    project_slug: projectSlug,
    project_name: sub?.project_name || projectSlug,
    completed_tasks: completed,
    completed_count: completed.length,
  };
}

// ============================================================================
// Tool: untrack_project
// ============================================================================

export async function untrackProject(projectSlug: string, userId: string) {
  projectSlug = projectSlug.toLowerCase();
  const user = await getOrCreateUser(userId);
  const removed = await removeAllWalletsForProject(user.id, projectSlug);
  await removeTaskCompletionsForProject(user.id, projectSlug);
  await unsubscribeFromProject(user.id, projectSlug);
  return {
    success: true,
    project_slug: projectSlug,
    wallets_removed: removed,
    message: `Stopped tracking ${projectSlug}. Your free tier slot is now available.`,
  };
}

// ============================================================================
// Tool: log_claimed_airdrop
// ============================================================================

export async function logClaimedAirdrop(projectSlug: string, userId: string, tokensReceived: string, usdValue = 0) {
  projectSlug = projectSlug.toLowerCase();
  const user = await getOrCreateUser(userId);
  await addClaimedAirdrop(user.id, projectSlug, tokensReceived, usdValue);
  const completed = await getCompletedTasks(user.id, projectSlug);
  return {
    success: true,
    project_slug: projectSlug,
    tokens_received: tokensReceived,
    usd_value: usdValue,
    message: `Recorded: ${tokensReceived}${usdValue ? ` (~$${usdValue})` : ""} from ${projectSlug}.`,
    tasks_completed: completed.length,
  };
}

// ============================================================================
// Tool: get_airdrop_news
// ============================================================================

export async function getAirdropNews(query = "crypto airdrop conditions", limit = 10, isPro = false): Promise<{
  tweets: Tweet[];
  source: string;
  query: string;
  count?: number;
  note?: string;
}> {
  const maxLimit = isPro ? Math.min(limit, 25) : Math.min(limit, 3);
  const tweets = (await searchTwitterAirdrops(query, maxLimit)).slice(0, maxLimit);

  if (tweets.length === 0) {
    return {
      tweets: [],
      source: "twitter",
      query,
      note: process.env.TWITTER_RAPIDAPI_HOST
        ? "No tweets found for this query. Try a different search term."
        : "TWITTER_RAPIDAPI_HOST not configured. Use web search instead.",
    };
  }

  return { tweets, source: "twitter", query, count: tweets.length };
}

// Re-export for use in index.ts
export { getUserStats, getOrCreateUserByMcpizeKey } from "./lib/db.js";
export { checkSybilRisk } from "./lib/sybil.js";

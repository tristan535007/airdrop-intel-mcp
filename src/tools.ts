/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Each function is registered as an MCP tool in index.ts.
 */

import { searchProjects, getProjectBySlug, getUpcomingSnapshots } from "./lib/airdrop-data.js";
import { addTrackedWallet, getTrackedWallets, getUserStats, getOrCreateUserByMcpizeKey, getOrCreateUser, markTaskComplete, getCompletedTasks, addClaimedAirdrop, removeAllWalletsForProject } from "./lib/db.js";
import { checkSybilRisk } from "./lib/sybil.js";

// ============================================================================
// Tool: search_airdrops
// ============================================================================

export interface SearchAirdropsInput {
  query?: string;
  chains?: string[];
  difficulty?: "easy" | "medium" | "hard";
  min_funding?: number;
}

export function searchAirdrops(input: SearchAirdropsInput) {
  const projects = searchProjects(input.query, input.chains, input.difficulty, input.min_funding);
  return projects.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    chains: p.chains,
    funding_usd_millions: p.funding,
    difficulty: p.difficulty,
    deadline: p.deadline,
    snapshot_date: p.snapshotDate,
    has_snapshot: !!p.snapshotDate,
    participation_type: p.snapshotDate ? "mainnet — track wallet for snapshot" : "testnet — do weekly tasks",
    estimated_reward_usd: `$${p.estimatedRewardMin}–$${p.estimatedRewardMax}`,
    status: p.status,
    task_count: p.tasks.length,
    official_url: p.officialUrl,
  }));
}

// ============================================================================
// Tool: get_airdrop_details
// ============================================================================

export function getAirdropDetails(projectId: string) {
  const project = getProjectBySlug(projectId);
  if (!project) return null;

  return {
    slug: project.slug,
    name: project.name,
    description: project.description,
    chains: project.chains,
    funding_usd_millions: project.funding,
    difficulty: project.difficulty,
    deadline: project.deadline,
    snapshot_date: project.snapshotDate,
    estimated_reward_usd: `$${project.estimatedRewardMin}–$${project.estimatedRewardMax}`,
    status: project.status,
    notes: project.notes,
    official_url: project.officialUrl,
    required_tx_per_week: project.requiredTxPerWeek,
    required_protocols: project.requiredProtocols,
    tasks: project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      type: t.type,
      automated: t.automated,
      estimated_minutes: t.estimatedMinutes,
      links: t.links || [],
    })),
    total_estimated_minutes: project.tasks.reduce((s, t) => s + t.estimatedMinutes, 0),
  };
}

// ============================================================================
// Tool: track_wallet
// ============================================================================

export async function trackWallet(address: string, projectId: string, userId: string, isPro = false) {
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { success: false, message: "Invalid wallet address. Must be a 42-character hex string starting with 0x.", upgrade_required: false };
  }

  const project = getProjectBySlug(projectId);
  if (!project) {
    return { success: false, message: `Project "${projectId}" not found. Use search_airdrops to find valid project IDs.`, upgrade_required: false };
  }

  const user = await getOrCreateUser(userId);
  const result = await addTrackedWallet(user.id, address, projectId, isPro);

  return {
    success: result.success,
    message: result.message,
    wallet: address,
    project_name: project.name,
    project_slug: projectId,
    upgrade_required: result.message.startsWith("FREE_TIER_LIMIT"),
  };
}

// ============================================================================
// Tool: get_wallet_status
// ============================================================================

export async function getWalletStatus(userId: string, walletAddress?: string) {
  const user = await getOrCreateUser(userId);
  const tracked = await getTrackedWallets(user.id);
  const filtered = walletAddress
    ? tracked.filter((t) => t.wallet_address.toLowerCase() === walletAddress.toLowerCase())
    : tracked;

  const statuses = filtered.map((t) => {
    const project = getProjectBySlug(t.project_slug);
    const deadlineStr = project?.snapshotDate || project?.deadline || null;
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
      project_name: project?.name || t.project_slug,
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
  const tracked = await getTrackedWallets(user.id);
  const stats = await getUserStats(user.id);

  const byProject = tracked.reduce<Record<string, string[]>>((acc, t) => {
    if (!acc[t.project_slug]) acc[t.project_slug] = [];
    acc[t.project_slug].push(t.wallet_address);
    return acc;
  }, {});

  let pendingMin = 0;
  let pendingMax = 0;

  const projects = Object.entries(byProject).map(([slug, wallets]) => {
    const project = getProjectBySlug(slug);
    const deadlineStr = project?.snapshotDate || project?.deadline || null;
    let daysUntil: number | null = null;
    if (deadlineStr) {
      daysUntil = Math.floor((new Date(deadlineStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
    if (project) {
      pendingMin += project.estimatedRewardMin * wallets.length;
      pendingMax += project.estimatedRewardMax * wallets.length;
    }
    return {
      slug,
      name: project?.name || slug,
      wallets,
      deadline: deadlineStr,
      days_until_deadline: daysUntil,
      estimated_reward_usd: project ? `$${project.estimatedRewardMin}–$${project.estimatedRewardMax}` : "unknown",
      difficulty: project?.difficulty || "unknown",
    };
  });

  return {
    user_id: userId,
    tier: user.tier,
    total_projects: stats.totalProjects,
    total_wallets: stats.totalWallets,
    claimed_airdrops: stats.claimedAirdrops,
    estimated_pending_usd: `$${pendingMin}–$${pendingMax}`,
    projects: projects.sort((a, b) => (a.days_until_deadline ?? 9999) - (b.days_until_deadline ?? 9999)),
  };
}

// ============================================================================
// Tool: get_upcoming_snapshots
// ============================================================================

export function getUpcomingSnapshotsList(days: number = 90) {
  const projects = getUpcomingSnapshots(days);
  return projects.map((p) => {
    const dateStr = p.snapshotDate || p.deadline || "";
    const daysRemaining = Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      project_slug: p.slug,
      project_name: p.name,
      date: dateStr,
      type: p.snapshotDate ? "snapshot" : "deadline",
      days_remaining: daysRemaining,
      urgency: daysRemaining < 3 ? "urgent" : daysRemaining < 14 ? "soon" : "ok",
      estimated_reward_usd: `$${p.estimatedRewardMin}–$${p.estimatedRewardMax}`,
    };
  });
}

// ============================================================================
// Tool: log_task_completion
// ============================================================================

export async function logTaskCompletion(projectId: string, taskId: string, userId: string, notes?: string) {
  const project = getProjectBySlug(projectId);
  if (!project) {
    return { success: false, message: `Project "${projectId}" not found. Use search_airdrops to find valid project IDs.` };
  }
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) {
    return { success: false, message: `Task "${taskId}" not found in project "${projectId}". Use get_airdrop_details to see valid task IDs.` };
  }
  const user = await getOrCreateUser(userId);
  await markTaskComplete(user.id, projectId, taskId, notes);
  return {
    success: true,
    project_slug: projectId,
    project_name: project.name,
    task_id: taskId,
    task_title: task.title,
    message: `Task "${task.title}" marked as completed.`,
  };
}

// ============================================================================
// Tool: get_task_progress
// ============================================================================

export async function getTaskProgress(projectId: string, userId: string) {
  const project = getProjectBySlug(projectId);
  if (!project) {
    return { success: false, message: `Project "${projectId}" not found.` };
  }
  const user = await getOrCreateUser(userId);
  const completed = await getCompletedTasks(user.id, projectId);
  const completedSet = new Set(completed);

  const tasks = project.tasks.map((t) => ({
    task_id: t.id,
    title: t.title,
    type: t.type,
    automated: t.automated,
    completed: completedSet.has(t.id),
    hint: t.automated
      ? "Can be done manually — follow the steps in get_airdrop_details"
      : "Manual step required — see links in get_airdrop_details",
  }));

  return {
    project_name: project.name,
    project_slug: projectId,
    total_tasks: tasks.length,
    completed_count: completed.length,
    progress_pct: Math.round((completed.length / tasks.length) * 100),
    tasks,
  };
}

// ============================================================================
// Tool: untrack_project
// ============================================================================

export async function untrackProject(projectId: string, userId: string) {
  const project = getProjectBySlug(projectId);
  if (!project) {
    return { success: false, message: `Project "${projectId}" not found. Use search_airdrops to find valid project IDs.` };
  }
  const user = await getOrCreateUser(userId);
  const removed = await removeAllWalletsForProject(user.id, projectId);
  return {
    success: true,
    project_slug: projectId,
    project_name: project.name,
    wallets_removed: removed,
    message: removed > 0
      ? `Stopped tracking ${project.name}. ${removed} wallet(s) removed. Your free tier slot is now available.`
      : `No wallets were tracked for ${project.name}.`,
  };
}

// ============================================================================
// Tool: log_claimed_airdrop
// ============================================================================

export async function logClaimedAirdrop(projectId: string, userId: string, tokensReceived: string, usdValue = 0) {
  const project = getProjectBySlug(projectId);
  if (!project) {
    return { success: false, message: `Project "${projectId}" not found. Use search_airdrops to find valid project IDs.` };
  }
  const user = await getOrCreateUser(userId);
  await addClaimedAirdrop(user.id, projectId, tokensReceived, usdValue);
  const completed = await getCompletedTasks(user.id, projectId);
  return {
    success: true,
    project_slug: projectId,
    project_name: project.name,
    tokens_received: tokensReceived,
    usd_value: usdValue,
    message: `Recorded: ${tokensReceived}${usdValue ? ` (~$${usdValue})` : ""} from ${project.name}.`,
    participation_summary: {
      tasks_completed: completed.length,
      tasks_total: project.tasks.length,
    },
  };
}

// Re-export for use in index.ts
export { getUserStats, getOrCreateUserByMcpizeKey } from "./lib/db.js";
export { checkSybilRisk } from "./lib/sybil.js";

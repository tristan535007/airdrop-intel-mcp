import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq, and, count, countDistinct, sum, sql } from "drizzle-orm";
import { users, tracked_wallets, claimed_airdrops, tool_calls, task_completions, subscribed_projects } from "./schema.js";

export type { User, TrackedWallet } from "./schema.js";

// ============================================================================
// Client
// ============================================================================

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client);

// ============================================================================
// Schema migration (run on startup)
// ============================================================================

export async function initDb() {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

// ============================================================================
// User helpers
// ============================================================================

export async function getOrCreateUserByTelegram(telegramId: string) {
  const existing = await db.select().from(users).where(eq(users.telegram_id, telegramId)).get();
  if (existing) {
    await db.update(users).set({ last_active_at: sql`(datetime('now'))` }).where(eq(users.id, existing.id));
    return existing;
  }
  const result = await db.insert(users).values({ telegram_id: telegramId }).returning().get();
  return result;
}

export async function getOrCreateUserByMcpizeKey(mcpizeKey: string) {
  const existing = await db.select().from(users).where(eq(users.mcpize_key, mcpizeKey)).get();
  if (existing) {
    await db.update(users).set({ last_active_at: sql`(datetime('now'))` }).where(eq(users.id, existing.id));
    return existing;
  }
  const result = await db.insert(users).values({ mcpize_key: mcpizeKey }).returning().get();
  return result;
}

export async function getOrCreateUser(identifier: string) {
  if (identifier.startsWith("tg:")) {
    return getOrCreateUserByTelegram(identifier);
  }
  return getOrCreateUserByMcpizeKey(identifier);
}

export async function getUserById(userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

export async function upgradeToPro(userId: number) {
  await db.update(users).set({ tier: "pro" }).where(eq(users.id, userId));
}

export async function upgradeUserToPro(identifier: string) {
  const user = await getOrCreateUser(identifier);
  await upgradeToPro(user.id);
}

export async function getUserByTelegramId(telegramId: string) {
  return db.select().from(users).where(eq(users.telegram_id, telegramId)).get();
}

export async function linkMcpizeKey(telegramIdentifier: string, mcpizeKey: string) {
  const user = await db.select().from(users).where(eq(users.telegram_id, telegramIdentifier)).get();
  if (user) {
    await db.update(users).set({ mcpize_key: mcpizeKey }).where(eq(users.id, user.id));
  }
}

// ============================================================================
// Wallet tracking helpers
// ============================================================================

export async function getTrackedWallets(userId: string, projectSlug?: string) {
  if (projectSlug) {
    return db.select().from(tracked_wallets)
      .where(and(eq(tracked_wallets.user_id, userId), eq(tracked_wallets.project_slug, projectSlug)))
      .all();
  }
  return db.select().from(tracked_wallets).where(eq(tracked_wallets.user_id, userId)).all();
}

export async function subscribeToProject(userId: string, projectSlug: string, projectName = "", deadline?: string): Promise<void> {
  const existing = await db.select().from(subscribed_projects)
    .where(and(eq(subscribed_projects.user_id, userId), eq(subscribed_projects.project_slug, projectSlug))).get();
  if (existing) {
    // update name/deadline if provided
    if (projectName || deadline) {
      await db.update(subscribed_projects)
        .set({ ...(projectName ? { project_name: projectName } : {}), ...(deadline ? { deadline } : {}) })
        .where(eq(subscribed_projects.id, existing.id));
    }
    return;
  }
  await db.insert(subscribed_projects).values({ user_id: userId, project_slug: projectSlug, project_name: projectName, deadline });
}

export async function unsubscribeFromProject(userId: string, projectSlug: string): Promise<void> {
  await db.delete(subscribed_projects).where(
    and(eq(subscribed_projects.user_id, userId), eq(subscribed_projects.project_slug, projectSlug))
  );
}

export async function getSubscribedProjects(userId: string) {
  return db.select().from(subscribed_projects).where(eq(subscribed_projects.user_id, userId)).all();
}

export async function addTrackedWallet(userId: string, walletAddress: string, projectSlug: string, projectName = "", isPro = false): Promise<{ success: boolean; message: string }> {
  const user = await getUserById(userId);
  if (!user) return { success: false, message: "User not found" };

  if (!isPro && user.tier === "free") {
    const [{ value: subCount }] = await db.select({ value: count() })
      .from(subscribed_projects).where(eq(subscribed_projects.user_id, userId));
    const alreadySubscribed = await db.select().from(subscribed_projects)
      .where(and(eq(subscribed_projects.user_id, userId), eq(subscribed_projects.project_slug, projectSlug))).get();
    if (subCount >= 1 && !alreadySubscribed) {
      return {
        success: false,
        message: "FREE_TIER_LIMIT: You can track 1 project on the free plan. Upgrade to Pro ($15/mo) to track unlimited projects.",
      };
    }
  }

  try {
    await db.insert(tracked_wallets).values({
      user_id: userId,
      wallet_address: walletAddress.toLowerCase(),
      project_slug: projectSlug,
    }).onConflictDoNothing();
    await subscribeToProject(userId, projectSlug, projectName);
    return { success: true, message: "Wallet added to tracker" };
  } catch {
    return { success: false, message: "Failed to add wallet" };
  }
}

export async function removeTrackedWallet(userId: string, walletAddress: string, projectSlug: string): Promise<boolean> {
  const result = await db.delete(tracked_wallets).where(
    and(
      eq(tracked_wallets.user_id, userId),
      eq(tracked_wallets.wallet_address, walletAddress.toLowerCase()),
      eq(tracked_wallets.project_slug, projectSlug)
    )
  );
  return (result.rowsAffected ?? 0) > 0;
}

export async function removeAllWalletsForProject(userId: string, projectSlug: string): Promise<number> {
  const result = await db.delete(tracked_wallets).where(
    and(eq(tracked_wallets.user_id, userId), eq(tracked_wallets.project_slug, projectSlug))
  );
  return result.rowsAffected ?? 0;
}

// ============================================================================
// Stats helpers
// ============================================================================

export interface UserStats {
  totalProjects: number;
  activeProjects: number;
  claimedAirdrops: number;
  totalUsdValue: number;
  totalWallets: number;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const [{ projects }] = await db.select({ projects: countDistinct(tracked_wallets.project_slug) })
    .from(tracked_wallets).where(eq(tracked_wallets.user_id, userId));
  const [{ wallets }] = await db.select({ wallets: countDistinct(tracked_wallets.wallet_address) })
    .from(tracked_wallets).where(eq(tracked_wallets.user_id, userId));
  const [{ claimedCount, totalUsd }] = await db.select({
    claimedCount: count(),
    totalUsd: sum(claimed_airdrops.usd_value),
  }).from(claimed_airdrops).where(eq(claimed_airdrops.user_id, userId));

  return {
    totalProjects: projects,
    activeProjects: projects,
    claimedAirdrops: claimedCount,
    totalUsdValue: Number(totalUsd ?? 0),
    totalWallets: wallets,
  };
}

export async function logToolCall(userId: string | null, toolName: string, channel: "mcp" | "telegram" = "mcp") {
  await db.insert(tool_calls).values({ user_id: userId, tool_name: toolName, channel });
}

// ============================================================================
// Task completion helpers
// ============================================================================

export async function addClaimedAirdrop(userId: string, projectSlug: string, tokensReceived: string, usdValue = 0) {
  await db.insert(claimed_airdrops).values({ user_id: userId, project_slug: projectSlug, tokens_received: tokensReceived, usd_value: usdValue });
}

export async function markTaskComplete(userId: string, projectSlug: string, taskId: string, notes?: string) {
  await db.insert(task_completions).values({ user_id: userId, project_slug: projectSlug, task_id: taskId, notes: notes ?? null })
    .onConflictDoNothing();
}

export async function getCompletedTasks(userId: string, projectSlug: string): Promise<string[]> {
  const rows = await db.select({ task_id: task_completions.task_id })
    .from(task_completions)
    .where(and(eq(task_completions.user_id, userId), eq(task_completions.project_slug, projectSlug)));
  return rows.map((r) => r.task_id);
}

export default db;

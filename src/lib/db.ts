import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and, count, countDistinct, sum, sql } from "drizzle-orm";
import { users, tracked_wallets, claimed_airdrops, tool_calls } from "./schema.js";

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
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      mcpize_key TEXT UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracked_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, wallet_address, project_slug)
    );

    CREATE TABLE IF NOT EXISTS claimed_airdrops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_slug TEXT NOT NULL,
      tokens_received TEXT,
      usd_value REAL DEFAULT 0,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      channel TEXT NOT NULL DEFAULT 'mcp',
      tool_name TEXT NOT NULL,
      called_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
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

export async function getTrackedWallets(userId: number, projectSlug?: string) {
  if (projectSlug) {
    return db.select().from(tracked_wallets)
      .where(and(eq(tracked_wallets.user_id, userId), eq(tracked_wallets.project_slug, projectSlug)))
      .all();
  }
  return db.select().from(tracked_wallets).where(eq(tracked_wallets.user_id, userId)).all();
}

export async function addTrackedWallet(userId: number, walletAddress: string, projectSlug: string): Promise<{ success: boolean; message: string }> {
  const user = await getUserById(userId);
  if (!user) return { success: false, message: "User not found" };

  if (user.tier === "free") {
    const [{ value: projectCount }] = await db.select({ value: countDistinct(tracked_wallets.project_slug) })
      .from(tracked_wallets).where(eq(tracked_wallets.user_id, userId));
    const existing = await db.select().from(tracked_wallets)
      .where(and(eq(tracked_wallets.user_id, userId), eq(tracked_wallets.project_slug, projectSlug))).get();
    if (projectCount >= 1 && !existing) {
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
    return { success: true, message: "Wallet added to tracker" };
  } catch {
    return { success: false, message: "Failed to add wallet" };
  }
}

export async function removeTrackedWallet(userId: number, walletAddress: string, projectSlug: string): Promise<boolean> {
  const result = await db.delete(tracked_wallets).where(
    and(
      eq(tracked_wallets.user_id, userId),
      eq(tracked_wallets.wallet_address, walletAddress.toLowerCase()),
      eq(tracked_wallets.project_slug, projectSlug)
    )
  );
  return (result.rowsAffected ?? 0) > 0;
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

export async function getUserStats(userId: number): Promise<UserStats> {
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

export async function logToolCall(userId: number | null, toolName: string, channel: "mcp" | "telegram" = "mcp") {
  await db.insert(tool_calls).values({ user_id: userId, tool_name: toolName, channel });
}

export default db;

import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/airdrop-intel.db");

// Ensure data directory exists
import fs from "fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================================================================
// Schema
// ============================================================================

db.exec(`
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

// ============================================================================
// User helpers
// ============================================================================

export interface User {
  id: number;
  telegram_id: string | null;
  mcpize_key: string | null;
  tier: "free" | "pro";
  created_at: string;
  last_active_at: string;
}

export function getOrCreateUserByTelegram(telegramId: string): User {
  const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as User | undefined;
  if (existing) {
    db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?").run(existing.id);
    return existing;
  }
  const result = db.prepare("INSERT INTO users (telegram_id) VALUES (?)").run(telegramId);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as User;
}

export function getOrCreateUserByMcpizeKey(mcpizeKey: string): User {
  const existing = db.prepare("SELECT * FROM users WHERE mcpize_key = ?").get(mcpizeKey) as User | undefined;
  if (existing) {
    db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?").run(existing.id);
    return existing;
  }
  const result = db.prepare("INSERT INTO users (mcpize_key) VALUES (?)").run(mcpizeKey);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as User;
}

export function getUserById(userId: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as User | undefined;
}

export function upgradeToPro(userId: number): void {
  db.prepare("UPDATE users SET tier = 'pro' WHERE id = ?").run(userId);
}

// ============================================================================
// Wallet tracking helpers
// ============================================================================

export interface TrackedWallet {
  id: number;
  user_id: number;
  wallet_address: string;
  project_slug: string;
  added_at: string;
}

export function getTrackedWallets(userId: number, projectSlug?: string): TrackedWallet[] {
  if (projectSlug) {
    return db
      .prepare("SELECT * FROM tracked_wallets WHERE user_id = ? AND project_slug = ?")
      .all(userId, projectSlug) as TrackedWallet[];
  }
  return db.prepare("SELECT * FROM tracked_wallets WHERE user_id = ?").all(userId) as TrackedWallet[];
}

export function addTrackedWallet(userId: number, walletAddress: string, projectSlug: string): { success: boolean; message: string } {
  const user = getUserById(userId);
  if (!user) return { success: false, message: "User not found" };

  // Free tier: max 1 project
  if (user.tier === "free") {
    const existing = db.prepare("SELECT COUNT(DISTINCT project_slug) as count FROM tracked_wallets WHERE user_id = ?").get(userId) as { count: number };
    const isNewProject = !db.prepare("SELECT 1 FROM tracked_wallets WHERE user_id = ? AND project_slug = ?").get(userId, projectSlug);
    if (existing.count >= 1 && isNewProject) {
      return {
        success: false,
        message: "FREE_TIER_LIMIT: You can track 1 project on the free plan. Upgrade to Pro ($15/mo on MCPize or 700 Stars/mo on Telegram) to track unlimited projects.",
      };
    }
  }

  try {
    db.prepare("INSERT OR IGNORE INTO tracked_wallets (user_id, wallet_address, project_slug) VALUES (?, ?, ?)").run(
      userId,
      walletAddress.toLowerCase(),
      projectSlug
    );
    return { success: true, message: "Wallet added to tracker" };
  } catch {
    return { success: false, message: "Failed to add wallet" };
  }
}

export function removeTrackedWallet(userId: number, walletAddress: string, projectSlug: string): boolean {
  const result = db
    .prepare("DELETE FROM tracked_wallets WHERE user_id = ? AND wallet_address = ? AND project_slug = ?")
    .run(userId, walletAddress.toLowerCase(), projectSlug);
  return result.changes > 0;
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

export function getUserStats(userId: number): UserStats {
  const projects = db
    .prepare("SELECT COUNT(DISTINCT project_slug) as count FROM tracked_wallets WHERE user_id = ?")
    .get(userId) as { count: number };
  const wallets = db
    .prepare("SELECT COUNT(DISTINCT wallet_address) as count FROM tracked_wallets WHERE user_id = ?")
    .get(userId) as { count: number };
  const claimed = db
    .prepare("SELECT COUNT(*) as count, COALESCE(SUM(usd_value), 0) as total FROM claimed_airdrops WHERE user_id = ?")
    .get(userId) as { count: number; total: number };

  return {
    totalProjects: projects.count,
    activeProjects: projects.count,
    claimedAirdrops: claimed.count,
    totalUsdValue: claimed.total,
    totalWallets: wallets.count,
  };
}

export function logToolCall(userId: number | null, toolName: string, channel: "mcp" | "telegram" = "mcp"): void {
  db.prepare("INSERT INTO tool_calls (user_id, tool_name, channel) VALUES (?, ?, ?)").run(userId, toolName, channel);
}

export default db;

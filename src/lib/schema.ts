import { integer, sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegram_id: text("telegram_id").unique(),
  mcpize_key: text("mcpize_key").unique(),
  tier: text("tier", { enum: ["free", "pro"] }).notNull().default("free"),
  created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
  last_active_at: text("last_active_at").notNull().default(sql`(datetime('now'))`),
});

export const tracked_wallets = sqliteTable("tracked_wallets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wallet_address: text("wallet_address").notNull(),
  project_slug: text("project_slug").notNull(),
  added_at: text("added_at").notNull().default(sql`(datetime('now'))`),
});

export const claimed_airdrops = sqliteTable("claimed_airdrops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  project_slug: text("project_slug").notNull(),
  tokens_received: text("tokens_received"),
  usd_value: real("usd_value").default(0),
  claimed_at: text("claimed_at").notNull().default(sql`(datetime('now'))`),
});

export const tool_calls = sqliteTable("tool_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").references(() => users.id),
  channel: text("channel", { enum: ["mcp", "telegram"] }).notNull().default("mcp"),
  tool_name: text("tool_name").notNull(),
  called_at: text("called_at").notNull().default(sql`(datetime('now'))`),
});

export const task_completions = sqliteTable("task_completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  project_slug: text("project_slug").notNull(),
  task_id: text("task_id").notNull(),
  completed_at: text("completed_at").notNull().default(sql`(datetime('now'))`),
  notes: text("notes"),
});

export type User = typeof users.$inferSelect;
export type TrackedWallet = typeof tracked_wallets.$inferSelect;

import { Bot, InlineKeyboard } from "grammy";
import {
  searchAirdrops,
  getAirdropDetails,
  trackWallet,
  getWalletStatus,
  getPortfolio,
  getUpcomingSnapshotsList,
  getOrCreateUserByMcpizeKey,
} from "./tools.js";
import { checkSybilRisk } from "./lib/sybil.js";
import { upgradeUserToPro, linkMcpizeKey, getOrCreateUser } from "./lib/db.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PRO_PRICE_STARS = parseInt(process.env.PRO_PRICE_STARS || "750");

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

export const bot = new Bot(BOT_TOKEN);

// ============================================================================
// Helpers
// ============================================================================

function userId(telegramId: number): string {
  return `tg:${telegramId}`;
}

function tierBadge(tier: string) {
  return tier === "pro" ? "⭐ Pro" : "🆓 Free";
}

const mainKeyboard = new InlineKeyboard()
  .text("🔍 Search", "menu_search").text("📅 Snapshots", "menu_snapshots").row()
  .text("👛 Track Wallet", "menu_track").text("📊 Status", "menu_status").row()
  .text("💼 Portfolio", "menu_portfolio").text("⚠️ Sybil Risk", "menu_risk").row()
  .text("⭐ Upgrade to Pro", "upgrade_pro").text("🔗 Link MCPize", "menu_link");

// ============================================================================
// /start
// ============================================================================

bot.command("start", async (ctx) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await getOrCreateUser(userId(tgId));

  await ctx.reply(
    `👋 *Airdrop Intel*\n\n` +
    `Track crypto airdrops, monitor wallets, and check Sybil risk.\n\n` +
    `*Plan:* ${tierBadge(user.tier)}  |  Free: 1 project · Pro: unlimited\n\n` +
    `Use the buttons below to get started 👇`,
    { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
  );

  await ctx.reply("Choose an action:", { reply_markup: mainKeyboard });
});

// ============================================================================
// Inline keyboard button handlers
// ============================================================================

bot.callbackQuery("menu_search", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send me a keyword to search:\n\n`/search monad` — search by name\n`/search zk` — search by keyword\n`/search` — show all airdrops",
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("menu_snapshots", async (ctx) => {
  await ctx.answerCallbackQuery();
  const snapshots = getUpcomingSnapshotsList(90);
  if (snapshots.length === 0) return ctx.reply("No upcoming snapshots in the next 90 days.");
  const lines = snapshots.map((s) => {
    const icon = s.urgency === "urgent" ? "🔴" : s.urgency === "soon" ? "🟡" : "🟢";
    return `${icon} *${s.project_name}* — ${s.type}\n📅 ${s.date} (${s.days_remaining}d) · ${s.estimated_reward_usd}`;
  });
  await ctx.reply(`*Upcoming Snapshots & Deadlines:*\n\n` + lines.join("\n\n"), { parse_mode: "Markdown" });
});

bot.callbackQuery("menu_track", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send wallet address and project:\n\n`/track 0xABC...123 monad`\n\nAvailable projects: `monad`, `megaeth`, `aztec`, `somnia`, `starknet`",
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("menu_status", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = userId(ctx.from.id);
  const result = await getWalletStatus(uid);
  if (result.tracked_count === 0) {
    return ctx.reply("No wallets tracked yet.\n\nUse 👛 *Track Wallet* to add one.", { parse_mode: "Markdown" });
  }
  const lines = result.statuses.map((s) => {
    const icon = s.urgency === "urgent" ? "🔴" : s.urgency === "soon" ? "🟡" : "🟢";
    return `${icon} *${s.project_name}*\n\`${s.wallet.slice(0, 10)}...${s.wallet.slice(-6)}\`\n📅 ${s.deadline || "TBD"} (${s.days_until_deadline ?? "?"}d)`;
  });
  await ctx.reply(`*Your Wallets (${result.tracked_count}):*\n\n` + lines.join("\n\n"), { parse_mode: "Markdown" });
});

bot.callbackQuery("menu_portfolio", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = userId(ctx.from.id);
  const result = await getPortfolio(uid);
  if (result.total_projects === 0) {
    return ctx.reply("No projects tracked yet.\n\nUse 👛 *Track Wallet* to start.", { parse_mode: "Markdown" });
  }
  const projects = result.projects.map((p) =>
    `*${p.name}* — ${p.estimated_reward_usd}\n${p.wallets.length} wallet(s) · ${p.days_until_deadline ?? "?"}d left`
  ).join("\n\n");
  await ctx.reply(
    `*Portfolio — ${tierBadge(result.tier)}*\n\n` +
    `Projects: ${result.total_projects} · Wallets: ${result.total_wallets}\n` +
    `💰 Estimated: *${result.estimated_pending_usd}*\n\n` + projects,
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("menu_risk", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send wallet address to analyze:\n\n`/risk 0xABC...123`\n`/risk 0xABC...123 base` — on specific chain",
    { parse_mode: "Markdown" }
  );
});

bot.callbackQuery("menu_link", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send your MCPize API key to link accounts:\n\n`/link YOUR_MCPIZE_API_KEY`\n\nFind your key: MCPize Dashboard → Account → API Keys\n\nIf you have Pro on MCPize, it will unlock here automatically.",
    { parse_mode: "Markdown" }
  );
});

// ============================================================================
// /search
// ============================================================================

bot.command("search", async (ctx) => {
  const query = ctx.match?.trim() || "";

  const results = searchAirdrops({ query: query || undefined });

  if (results.length === 0) {
    return ctx.reply("No airdrops found. Try `/search monad` or `/search zk`", { parse_mode: "Markdown" });
  }

  const lines = results.map((a) => {
    const deadline = a.deadline ? `📅 ${a.deadline}` : "no deadline";
    const reward = `💰 ${a.estimated_reward_usd}`;
    return `*${a.name}* (${a.difficulty})\n${a.description.slice(0, 80)}...\n${deadline} ${reward}\n/details\\_${a.slug}`;
  });

  await ctx.reply(`*Active Airdrops (${results.length}):*\n\n` + lines.join("\n\n"), { parse_mode: "Markdown" });
});

// ============================================================================
// /details_<slug>
// ============================================================================

bot.hears(/^\/details_(\w+)$/, async (ctx) => {
  const slug = ctx.match[1];
  const project = getAirdropDetails(slug);

  if (!project) {
    return ctx.reply(`Project "${slug}" not found. Use /search to find projects.`);
  }

  const tasks = project.tasks.map((t, i) =>
    `${i + 1}. ${t.automated ? "🤖" : "👆"} *${t.title}*\n   ${t.description} (~${t.estimated_minutes}min)`
  ).join("\n\n");

  await ctx.reply(
    `*${project.name}*\n` +
    `${project.description}\n\n` +
    `💰 Reward: ${project.estimated_reward_usd}\n` +
    `⏱ Total: ~${project.total_estimated_minutes} min\n` +
    `📅 Deadline: ${project.deadline || "TBD"}\n\n` +
    `*Tasks:*\n${tasks}\n\n` +
    `🤖 = automated by Claude  👆 = do it yourself`,
    { parse_mode: "Markdown" }
  );
});

// ============================================================================
// /track
// ============================================================================

bot.command("track", async (ctx) => {
  const args = ctx.match?.trim().split(/\s+/) || [];

  if (args.length < 2) {
    return ctx.reply(
      "Usage: `/track <wallet> <project>`\n\nExample:\n`/track 0xABC...123 monad`",
      { parse_mode: "Markdown" }
    );
  }

  const [wallet, projectId] = args;
  const uid = userId(ctx.from!.id);

  const result = await trackWallet(uid, wallet, projectId);

  if (result.upgrade_required) {
    const keyboard = new InlineKeyboard().text(`⭐ Upgrade to Pro (${PRO_PRICE_STARS} Stars)`, "upgrade_pro");
    return ctx.reply(
      `🚫 *Free tier limit reached*\n\nFree plan allows 1 project. Upgrade to Pro for unlimited projects.`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  }

  if (!result.success) {
    return ctx.reply(`❌ ${result.message}`);
  }

  await ctx.reply(
    `✅ *Wallet tracked!*\n\n` +
    `Project: *${result.project_name}*\n` +
    `Wallet: \`${wallet}\`\n\n` +
    `Use /status to see progress.`,
    { parse_mode: "Markdown" }
  );
});

// ============================================================================
// /status
// ============================================================================

bot.command("status", async (ctx) => {
  const uid = userId(ctx.from!.id);
  const result = await getWalletStatus(uid);

  if (result.tracked_count === 0) {
    return ctx.reply("You have no tracked wallets yet.\n\nUse `/track <wallet> <project>` to start.", { parse_mode: "Markdown" });
  }

  const lines = result.statuses.map((s) => {
    const urgencyIcon = s.urgency === "urgent" ? "🔴" : s.urgency === "soon" ? "🟡" : "🟢";
    return `${urgencyIcon} *${s.project_name}*\n\`${s.wallet.slice(0, 10)}...${s.wallet.slice(-6)}\`\n📅 ${s.deadline || "TBD"} (${s.days_until_deadline ?? "?"}d)`;
  });

  await ctx.reply(`*Your Wallets (${result.tracked_count}):*\n\n` + lines.join("\n\n"), { parse_mode: "Markdown" });
});

// ============================================================================
// /portfolio
// ============================================================================

bot.command("portfolio", async (ctx) => {
  const uid = userId(ctx.from!.id);
  const result = await getPortfolio(uid);

  if (result.total_projects === 0) {
    return ctx.reply("No projects tracked yet.\n\nUse `/track <wallet> <project>` to start.", { parse_mode: "Markdown" });
  }

  const projects = result.projects.map((p) =>
    `*${p.name}* — ${p.estimated_reward_usd}\n` +
    `${p.wallets.length} wallet(s) · ${p.days_until_deadline ?? "?"}d left`
  ).join("\n\n");

  await ctx.reply(
    `*Portfolio — ${tierBadge(result.tier)}*\n\n` +
    `Projects: ${result.total_projects}\n` +
    `Wallets: ${result.total_wallets}\n` +
    `💰 Estimated: *${result.estimated_pending_usd}*\n\n` +
    projects,
    { parse_mode: "Markdown" }
  );
});

// ============================================================================
// /risk
// ============================================================================

bot.command("risk", async (ctx) => {
  const args = ctx.match?.trim().split(/\s+/) || [];

  if (!args[0] || !args[0].startsWith("0x")) {
    return ctx.reply(
      "Usage: `/risk <wallet> [chain]`\n\nExample:\n`/risk 0xABC...123 ethereum`",
      { parse_mode: "Markdown" }
    );
  }

  const [wallet, chain = "ethereum"] = args;

  await ctx.reply(`🔍 Analyzing wallet on ${chain}...`);

  const result = await checkSybilRisk(wallet, chain);

  const scoreBar = "█".repeat(Math.round(result.riskScore / 10)) + "░".repeat(10 - Math.round(result.riskScore / 10));
  const riskIcon = result.riskLevel === "low" ? "🟢" : result.riskLevel === "medium" ? "🟡" : "🔴";

  const risks = result.risks.length > 0
    ? result.risks.map((r) => `⚠️ ${r.description}`).join("\n")
    : "✅ No significant risks detected";

  const recs = result.recommendations.map((r) => `• ${r}`).join("\n");

  await ctx.reply(
    `${riskIcon} *Sybil Risk: ${result.riskScore}/100 (${result.riskLevel})*\n` +
    `\`${scoreBar}\`\n\n` +
    `📊 Stats:\n` +
    `• Transactions: ${result.txCount}\n` +
    `• Unique protocols: ${result.uniqueProtocols}\n` +
    `• Wallet age: ${result.walletAgeDays} days\n\n` +
    `*Risks:*\n${risks}\n\n` +
    `*Recommendations:*\n${recs}`,
    { parse_mode: "Markdown" }
  );
});

// ============================================================================
// /snapshots
// ============================================================================

bot.command("snapshots", async (ctx) => {
  const snapshots = getUpcomingSnapshotsList(90);

  if (snapshots.length === 0) {
    return ctx.reply("No upcoming snapshots in the next 90 days.");
  }

  const lines = snapshots.map((s) => {
    const icon = s.urgency === "urgent" ? "🔴" : s.urgency === "soon" ? "🟡" : "🟢";
    return `${icon} *${s.project_name}* — ${s.type}\n📅 ${s.date} (${s.days_remaining}d) · ${s.estimated_reward_usd}`;
  });

  await ctx.reply(`*Upcoming Snapshots & Deadlines:*\n\n` + lines.join("\n\n"), { parse_mode: "Markdown" });
});

// ============================================================================
// /upgrade
// ============================================================================

bot.command("upgrade", async (ctx) => {
  const uid = userId(ctx.from!.id);
  const user = await getOrCreateUser(uid);

  if (user.tier === "pro") {
    return ctx.reply("✅ You already have *Pro* plan! Unlimited projects enabled.", { parse_mode: "Markdown" });
  }

  const keyboard = new InlineKeyboard().text(`⭐ Pay ${PRO_PRICE_STARS} Stars (~$15/mo)`, "upgrade_pro");

  await ctx.reply(
    `⭐ *Upgrade to Pro*\n\n` +
    `*Free:* 1 tracked project\n` +
    `*Pro:* Unlimited projects + priority support\n\n` +
    `Price: *${PRO_PRICE_STARS} Telegram Stars* (~$15/mo)\n\n` +
    `Already paid on MCPize? Use /link to connect your account.`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ============================================================================
// Inline button: upgrade_pro → send invoice
// ============================================================================

bot.callbackQuery("upgrade_pro", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(userId(ctx.from.id));
  if (user.tier === "pro") {
    return ctx.reply("✅ You already have *Pro* plan! Unlimited projects enabled.", { parse_mode: "Markdown" });
  }
  await ctx.api.sendInvoice(
    ctx.chat!.id,
    "Airdrop Intel Pro",
    "Unlimited project tracking, Sybil risk checks, snapshot alerts. Monthly subscription.",
    "pro_monthly",
    "XTR", // Telegram Stars currency
    [{ label: "Pro Plan (1 month)", amount: PRO_PRICE_STARS }]
  );
});

// ============================================================================
// Pre-checkout: always approve
// ============================================================================

bot.on("pre_checkout_query", async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// ============================================================================
// Successful payment → upgrade tier
// ============================================================================

bot.on("message:successful_payment", async (ctx) => {
  const tgId = ctx.from!.id;
  const uid = userId(tgId);

  await upgradeUserToPro(uid);

  await ctx.reply(
    `🎉 *Payment successful!*\n\n` +
    `Welcome to *Pro* plan!\n` +
    `You now have unlimited project tracking.\n\n` +
    `Use /portfolio to see your dashboard.`,
    { parse_mode: "Markdown" }
  );
});

// ============================================================================
// /link — connect MCPize account
// ============================================================================

bot.command("link", async (ctx) => {
  const mcpizeKey = ctx.match?.trim();

  if (!mcpizeKey) {
    return ctx.reply(
      "Usage: `/link <your-mcpize-api-key>`\n\n" +
      "Find your key in the MCPize dashboard → Account → API Keys.\n\n" +
      "If you have an active Pro subscription on MCPize, linking will unlock Pro here too.",
      { parse_mode: "Markdown" }
    );
  }

  const tgId = ctx.from!.id;
  const uid = userId(tgId);

  // Check if the MCPize key belongs to a pro user
  const mcpizeUser = await getOrCreateUserByMcpizeKey(mcpizeKey);
  await linkMcpizeKey(uid, mcpizeKey);

  if (mcpizeUser.tier === "pro") {
    await upgradeUserToPro(uid);
    await ctx.reply(
      `✅ *MCPize account linked!*\n\n` +
      `Pro plan detected — you now have unlimited projects here too.`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(
      `✅ *MCPize account linked!*\n\n` +
      `Free plan detected. Upgrade on MCPize or use /upgrade here with Stars.`,
      { parse_mode: "Markdown" }
    );
  }
});

// ============================================================================
// Error handler
// ============================================================================

bot.catch((err) => {
  console.error("[Bot] Error:", err.message);
});

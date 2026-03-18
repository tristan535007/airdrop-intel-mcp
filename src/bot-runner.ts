import { bot } from "./bot.js";

console.log("🤖 Starting Airdrop Intel Telegram Bot...");
bot.start({
  onStart: (info) => {
    console.log(`✅ Bot @${info.username} is running`);
  },
});

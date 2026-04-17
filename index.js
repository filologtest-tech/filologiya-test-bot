const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error("BOT_TOKEN topilmadi!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.on("polling_error", (error) => {
    console.log("Polling error:", error.message);
});

bot.on("message", (msg) => {
    bot.sendMessage(msg.chat.id, "Ishlayapman ✅");
});

console.log("Bot started...");

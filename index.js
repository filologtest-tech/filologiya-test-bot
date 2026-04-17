const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

let users = {};

// START
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "Assalomu alaykum!\n\nTest ishlash uchun quyidagini tanlang:\n\n/pay - To‘lov qilish\n/test - Testni boshlash"
    );
});

// TO‘LOV
bot.onText(/\/pay/, (msg) => {
    users[msg.chat.id] = { paid: false };

    bot.sendMessage(
        msg.chat.id,
        "Testga kirish narxi: 15 000 so‘m.\n\nTo‘lov qilish uchun admin bilan bog‘laning:\n👉 @elmuradovic_1"
    );
});

// TEST
bot.onText(/\/test/, (msg) => {
    if (users[msg.chat.id] && users[msg.chat.id].paid) {
        bot.sendMessage(
            msg.chat.id,
            "Testni boshlash uchun link:\n👉 https://SIZNING_TEST_LINK"
        );
    } else {
        bot.sendMessage(
            msg.chat.id,
            "❌ Siz hali to‘lov qilmagansiz.\n\nAvval /pay ni bosing."
        );
    }
});

const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// 🔴 O‘ZINGNI ID QO‘Y
const ADMIN_ID = elmuradovic_1;

// ===== USERS =====
let users = {};
let payments = []; // log

// ===== FANLAR =====
const subjects = {
    adabiyot: { name: "Adabiyotshunoslik asoslari", link: "https://test1.com" },
    hozirgi_rus: { name: "Hozirgi rus tili", link: "https://test2.com" },
    rus_tarix: { name: "Rus adabiyoti tarixi", link: "https://test3.com" },
    praktikum: { name: "Rus tili praktikumi", link: "https://test4.com" },
    umumiy: { name: "Umumiy tilshunoslik", link: "https://test5.com" }
};

// ===== START =====
bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id;

    users[id] = {
        step: "name",
        name: "",
        surname: "",
        group: "",
        paidSubjects: {},
        pending: null
    };

    bot.sendMessage(id, "Ismingizni kiriting:");
});

// ===== RO‘YXAT =====
bot.on("message", (msg) => {
    const id = msg.chat.id;
    const text = msg.text;

    if (!users[id]) return;
    if (text === "/start") return;

    const user = users[id];

    if (user.step === "name") {
        user.name = text;
        user.step = "surname";
        return bot.sendMessage(id, "Familiya:");
    }

    if (user.step === "surname") {
        user.surname = text;
        user.step = "group";
        return bot.sendMessage(id, "Guruh:");
    }

    if (user.step === "group") {
        user.group = text;
        user.step = "done";

        bot.sendMessage(id,
            `✅ ${user.name} ${user.surname}\n${user.group}`
        );

        return showSubjects(id);
    }
});

// ===== FANLAR =====
function showSubjects(id) {
    const buttons = Object.keys(subjects).map(key => {
        const paid = users[id].paidSubjects[key];
        return [{
            text: `${paid ? "🔓" : "🔒"} ${subjects[key].name}`,
            callback_data: `subject_${key}`
        }];
    });

    bot.sendMessage(id, "Fan tanlang:", {
        reply_markup: { inline_keyboard: buttons }
    });
}

// ===== CALLBACK =====
bot.on("callback_query", (q) => {
    const id = q.message.chat.id;
    const data = q.data;

    // FAN
    if (data.startsWith("subject_")) {
        const key = data.split("_")[1];

        if (users[id].paidSubjects[key]) {
            return bot.sendMessage(id, subjects[key].link);
        }

        return bot.sendMessage(id,
            `💳 ${subjects[key].name}
Narxi: 15 000 so‘m

👉 Kartaga o‘tkazing:
9860160633231537

Ism: Safarboyev Umrbek`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ To‘lov qildim", callback_data: `check_${key}` }]
                    ]
                }
            }
        );
    }

    // TO‘LOV QILDIM
    if (data.startsWith("check_")) {
        const key = data.split("_")[1];

        // oldini olish
        if (users[id].pending) {
            return bot.sendMessage(id, "⏳ Oldingi to‘lov tekshirilmoqda");
        }

        users[id].pending = key;

        const time = new Date().toLocaleString();

        payments.push({
            userId: id,
            subject: key,
            time: time
        });

        bot.sendMessage(id, "⏳ Tekshirilmoqda...");

        // ADMIN GA XABAR
        bot.sendMessage(ADMIN_ID,
            `💰 Yangi to‘lov:

👤 ${users[id].name} ${users[id].surname}
🏫 ${users[id].group}
📚 ${subjects[key].name}
🕒 ${time}

Tasdiqlash:
/confirm ${id} ${key}`
        );
    }
});

// ===== ADMIN TASDIQLASH =====
bot.onText(/\/confirm (\d+) (.+)/, (msg, match) => {
    if (msg.chat.id != ADMIN_ID) return;

    const userId = match[1];
    const subject = match[2];

    if (!users[userId]) return;

    users[userId].paidSubjects[subject] = true;
    users[userId].pending = null;

    bot.sendMessage(userId, "✅ To‘lov tasdiqlandi!");
    showSubjects(userId);
});

// ===== LOG KO‘RISH =====
bot.onText(/\/payments/, (msg) => {
    if (msg.chat.id != ADMIN_ID) return;

    if (payments.length === 0) {
        return bot.sendMessage(msg.chat.id, "Bo‘sh");
    }

    let text = "📋 To‘lovlar:\n\n";

    payments.slice(-10).forEach(p => {
        text += `${p.userId} - ${subjects[p.subject].name} - ${p.time}\n`;
    });

    bot.sendMessage(msg.chat.id, text);
});

console.log("Bot started...");

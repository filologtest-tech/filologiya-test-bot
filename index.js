const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== CONFIG =====
const ADMIN_ID = 1755754970;
const CARD = "9860160633231537";
const OWNER = "Safarboyev Umrbek";

// ===== MONGODB =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB ulandi"))
.catch(err => console.log("Mongo error:", err));

// ===== MODEL =====
const userSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    surname: String,
    group: String,
    step: String,
    paidSubjects: Object,
    pending: String
});

const User = mongoose.model("User", userSchema);

// ===== FANLAR =====
const subjects = {
    adabiyot: { name: "Adabiyotshunoslik asoslari", link: "https://test1.com" },
    hozirgi_rus: { name: "Hozirgi rus tili", link: "https://test2.com" },
    rus_tarix: { name: "Rus adabiyoti tarixi", link: "https://test3.com" },
    praktikum: { name: "Rus tili praktikumi", link: "https://test4.com" },
    umumiy: { name: "Umumiy tilshunoslik", link: "https://test5.com" }
};

// ===== START =====
bot.onText(/\/start/, async (msg) => {
    const id = msg.chat.id;

    let user = await User.findOne({ userId: id });

    if (!user) {
        user = new User({
            userId: id,
            name: "",
            surname: "",
            group: "",
            step: "name",
            paidSubjects: {},
            pending: null
        });
    } else {
        user.step = "name";
    }

    await user.save();
    bot.sendMessage(id, "Ismingizni kiriting:");
});

// ===== TEXT =====
bot.on("message", async (msg) => {
    if (!msg.text) return;

    const id = msg.chat.id;
    const text = msg.text.trim();

    if (text === "/start") return;

    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (user.step === "name") {
        user.name = text;
        user.step = "surname";
        await user.save();
        return bot.sendMessage(id, "Familiya:");
    }

    if (user.step === "surname") {
        user.surname = text;
        user.step = "group";
        await user.save();
        return bot.sendMessage(id, "Guruh:");
    }

    if (user.step === "group") {
        user.group = text;
        user.step = "done";
        await user.save();

        bot.sendMessage(id, `✅ ${user.name} ${user.surname}\n${user.group}`);
        return showSubjects(id, user);
    }
});

// ===== FANLAR =====
function showSubjects(id, user) {
    const buttons = Object.keys(subjects).map(key => {
        const paid = user.paidSubjects?.[key];
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
bot.on("callback_query", async (q) => {
    const id = q.message.chat.id;
    const data = q.data;

    const user = await User.findOne({ userId: id });
    if (!user) return;

    // ===== FAN =====
    if (data.startsWith("subject_")) {
        const key = data.replace("subject_", ""); // ✅ FIX

        if (user.paidSubjects?.[key]) {
            return bot.sendMessage(id, subjects[key].link);
        }

        return bot.sendMessage(id,
`💳 ${subjects[key].name}
Narxi: 15 000 so‘m

👉 Kartaga o‘tkazing:
${CARD}

👤 ${OWNER}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ To‘lov qildim", callback_data: `check_${key}` }]
                ]
            }
        });
    }

    // ===== TO‘LOV =====
    if (data.startsWith("check_")) {
        const key = data.replace("check_", ""); // ✅ FIX

        if (user.pending) {
            return bot.sendMessage(id, "⏳ Oldingi to‘lov tekshirilmoqda");
        }

        user.pending = key;
        await user.save();

        return bot.sendMessage(id, "📸 Screenshot yuboring:");
    }

    // ===== TASDIQLASH =====
    if (data.startsWith("confirm_")) {
        if (id != ADMIN_ID) return;

        const parts = data.split("_");
        const userId = parts[1];
        const subject = parts.slice(2).join("_"); // ✅ FIX

        const u = await User.findOne({ userId });
        if (!u) return;

        u.paidSubjects[subject] = true;
        u.pending = null;
        await u.save();

        bot.sendMessage(userId, "✅ To‘lov tasdiqlandi!");
        showSubjects(userId, u);

        return bot.answerCallbackQuery(q.id, { text: "Tasdiqlandi ✅" });
    }

    // ===== RAD =====
    if (data.startsWith("reject_")) {
        if (id != ADMIN_ID) return;

        const parts = data.split("_");
        const userId = parts[1];

        const u = await User.findOne({ userId });
        if (!u) return;

        u.pending = null;
        await u.save();

        bot.sendMessage(userId, "❌ To‘lov rad etildi");

        return bot.answerCallbackQuery(q.id, { text: "Rad etildi ❌" });
    }
});

// ===== SCREENSHOT =====
bot.on("photo", async (msg) => {
    const id = msg.chat.id;

    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;

    const key = user.pending;
    const photo = msg.photo[msg.photo.length - 1].file_id;

    const time = new Date().toLocaleString();

    await bot.sendPhoto(ADMIN_ID, photo, {
        caption:
`💰 Yangi to‘lov:

👤 ${user.name} ${user.surname}
🏫 ${user.group}
📚 ${subjects[key].name}
🕒 ${time}`,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: `confirm_${id}_${key}` },
                    { text: "❌ Rad etish", callback_data: `reject_${id}_${key}` }
                ]
            ]
        }
    });

    bot.sendMessage(id, "⏳ Tekshirilmoqda...");
});

bot.on("polling_error", console.log);

console.log("Bot started...");

const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== CONFIG =====
const ADMIN_ID = 1755754970;
const CARD = "9860160633231537";
const OWNER = "Safarboyev Umrbek";

// ===== MONGO =====
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
    paidSubjects: { type: Object, default: {} },
    pending: String,
    actionToken: String
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
        user = new User({ userId: id, step: "name" });
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
        const paid = user.paidSubjects[key];
        return [{
            text: `${paid ? "🔓" : "🔒"} ${subjects[key].name}`,
            callback_data: `subject|${key}` // 🔥 xavfsiz format
        }];
    });

    bot.sendMessage(id, "Fan tanlang:", {
        reply_markup: { inline_keyboard: buttons }
    });
}

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
    const data = q.data;
    const fromId = q.from.id;

    // ===== ADMIN PANEL =====
    if (data === "admin_menu") {
        if (fromId !== ADMIN_ID) return;

        return bot.editMessageText("📊 Admin panel:", {
            chat_id: q.message.chat.id,
            message_id: q.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📋 To‘lovlar", callback_data: "admin_payments" }],
                    [{ text: "👥 Foydalanuvchilar", callback_data: "admin_users" }]
                ]
            }
        });
    }

    if (data === "admin_payments") {
        if (fromId !== ADMIN_ID) return;

        const users = await User.find({}).limit(10).sort({ _id: -1 });

        let text = "📋 So‘nggi foydalanuvchilar:\n\n";
        users.forEach(u => {
            text += `${u.name} ${u.surname} (${u.group})\n`;
        });

        return bot.sendMessage(q.message.chat.id, text);
    }

    if (data === "admin_users") {
        if (fromId !== ADMIN_ID) return;

        const users = await User.find().limit(10);

        let text = "👥 Foydalanuvchilar:\n\n";
        users.forEach(u => {
            text += `${u.name} ${u.surname}\n`;
        });

        return bot.sendMessage(q.message.chat.id, text);
    }

    // ===== FAN =====
    if (data.startsWith("subject|")) {
        const key = data.split("|")[1];

        const user = await User.findOne({ userId: q.from.id });

        if (user.paidSubjects[key]) {
            return bot.sendMessage(q.from.id, subjects[key].link);
        }

        return bot.sendMessage(q.from.id,
`💳 ${subjects[key].name}
Narxi: 15 000 so‘m

${CARD}
${OWNER}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ To‘lov qildim", callback_data: `check|${key}` }]
                ]
            }
        });
    }

    // ===== CHECK =====
    if (data.startsWith("check|")) {
        const key = data.split("|")[1];
        const user = await User.findOne({ userId: q.from.id });

        if (user.pending) {
            return bot.answerCallbackQuery(q.id, { text: "Kutilyapti..." });
        }

        user.pending = key;
        await user.save();

        return bot.sendMessage(q.from.id, "📸 Screenshot yuboring:");
    }

    // ===== CONFIRM =====
    if (data.startsWith("confirm|")) {
        if (fromId !== ADMIN_ID) return;

        const [_, userId, subject, token] = data.split("|");

        const user = await User.findOne({ userId });
        if (!user || user.actionToken !== token) {
            return bot.answerCallbackQuery(q.id, { text: "Allaqachon bajarilgan" });
        }

        user.paidSubjects[subject] = true;
        user.pending = null;
        user.actionToken = null;
        await user.save();

        await bot.sendMessage(userId, "✅ To‘lov tasdiqlandi!");
        showSubjects(userId, user);

        await bot.editMessageCaption(q.message.caption + "\n\n✅ TASDIQLANDI", {
            chat_id: q.message.chat.id,
            message_id: q.message.message_id,
            reply_markup: { inline_keyboard: [] }
        });

        return bot.answerCallbackQuery(q.id);
    }

    // ===== REJECT =====
    if (data.startsWith("reject|")) {
        if (fromId !== ADMIN_ID) return;

        const [_, userId, subject, token] = data.split("|");

        const user = await User.findOne({ userId });
        if (!user || user.actionToken !== token) {
            return bot.answerCallbackQuery(q.id, { text: "Allaqachon bajarilgan" });
        }

        user.pending = null;
        user.actionToken = null;
        await user.save();

        await bot.sendMessage(userId, "❌ To‘lov rad etildi");

        await bot.editMessageCaption(q.message.caption + "\n\n❌ RAD ETILDI", {
            chat_id: q.message.chat.id,
            message_id: q.message.message_id,
            reply_markup: { inline_keyboard: [] }
        });

        return bot.answerCallbackQuery(q.id);
    }
});

// ===== SCREENSHOT =====
bot.on("photo", async (msg) => {
    const id = msg.chat.id;

    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;

    const key = user.pending;
    const photo = msg.photo[msg.photo.length - 1].file_id;

    const token = crypto.randomBytes(6).toString("hex");
    user.actionToken = token;
    await user.save();

    await bot.sendPhoto(ADMIN_ID, photo, {
        caption:
`💰 Yangi to‘lov

👤 ${user.name} ${user.surname}
📚 ${subjects[key].name}`,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: `confirm|${id}|${key}|${token}` },
                    { text: "❌ Rad etish", callback_data: `reject|${id}|${key}|${token}` }
                ]
            ]
        }
    });

    bot.sendMessage(id, "⏳ Tekshirilmoqda...");
});

// ===== ADMIN =====
bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id !== ADMIN_ID) return;

    bot.sendMessage(msg.chat.id, "Admin panel", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Ochish", callback_data: "admin_menu" }]
            ]
        }
    });
});

bot.on("polling_error", console.log);

console.log("Bot started...");

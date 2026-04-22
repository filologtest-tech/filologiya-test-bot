const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

// ===== WEB SERVER (EXPRESS) SOZLAMALARI =====
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Bu yerda sizning serveringiz yoki domeningiz manzili bo'lishi kerak.
// Agar render.com yoki railway.app da ishlatsangiz, o'sha manzilni yozasiz.
// Hozircha lokal ishlatish uchun domen o'zgaruvchisini qoldiramiz.
const SERVER_URL = process.env.WEB_APP_URL || "https://sizning-domeningiz.com";

// Test sahifasi marshruti
app.get('/test', async (req, res) => {
    const { userId, subject } = req.query;

    if (!userId || !subject) {
        return res.status(400).send("Xato: Noto'g'ri havola kiritildi.");
    }

    try {
        const user = await User.findOne({ userId: Number(userId) });

        if (!user || !user.paidSubjects[subject]) {
            return res.status(403).send("Xato: Siz ushbu fanni sotib olmagansiz yoki ruxsatingiz yo'q.");
        }

        // Ruxsat bor bo'lsa, public papkasidagi test.html ni ochadi
        res.sendFile(path.join(__dirname, 'public', 'test.html'));
    } catch (err) {
        res.status(500).send("Serverda xatolik yuz berdi.");
    }
});

// ===== BOT SOZLAMALARI =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== CONFIG =====
const ADMIN_ID = 1755754970;
const CARD = "9860160633231537";
const OWNER = "Safarboyev Umrbek";

// ===== DB =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB ulandi"))
.catch(err => console.log(err));

// ===== MODEL =====
const userSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    surname: String,
    group: String,
    step: String,
    paidSubjects: { type: Object, default: {} },
    paidHistory: { type: Array, default: [] },
    pending: String,
    actionToken: String
});

const User = mongoose.model("User", userSchema);

// ===== FANLAR =====
const subjects = {
    adabiyot: { name: "Adabiyotshunoslik asoslari", type: "mini_app" },
    hozirgi_rus: { name: "Hozirgi rus tili", type: "mini_app" },
    rus_tarix: { name: "Rus adabiyoti tarixi", type: "mini_app" },
    praktikum: { name: "Rus tili praktikumi", type: "mini_app" },
    umumiy: { name: "Umumiy tilshunoslik", type: "mini_app" }
};

// ===== START =====
bot.onText(/\/start/, async (msg) => {
    const id = msg.chat.id;

    let user = await User.findOne({ userId: id });

    if (!user) user = new User({ userId: id });

    user.step = "name";
    await user.save();

    bot.sendMessage(id, "Assalomu alaykum! Ismingizni kiriting:");
});

// ===== TEXT =====
bot.on("message", async (msg) => {
    if (!msg.text) return;

    const id = msg.chat.id;
    const text = msg.text.trim();

    if (text === "/start" || text === "/admin") return;

    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (user.step === "name") {
        user.name = text;
        user.step = "surname";
        await user.save();
        return bot.sendMessage(id, "Familiyangizni kiriting:");
    }

    if (user.step === "surname") {
        user.surname = text;
        user.step = "group";
        await user.save();
        return bot.sendMessage(id, "Qaysi guruhda o'qiysiz?");
    }

    if (user.step === "group") {
        user.group = text;
        user.step = "done";
        await user.save();

        return showSubjects(id);
    }
});

// ===== FANLAR =====
async function showSubjects(id) {
    const user = await User.findOne({ userId: id });

    const buttons = Object.keys(subjects).map(key => {
        const paid = user.paidSubjects[key] === true;
        return [{
            text: `${paid ? "🔓" : "🔒"} ${subjects[key].name}`,
            callback_data: `subject|${key}`
        }];
    });

    buttons.push([{ text: "📚 Mening fanlarim", callback_data: "my_subjects" }]);

    bot.sendMessage(id, "Qaysi fandan test ishlashni xohlaysiz? Tanlang:", {
        reply_markup: { inline_keyboard: buttons }
    });
}

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
    const data = q.data;
    const id = q.from.id;

    const user = await User.findOne({ userId: id });

    // ===== USER FANLARI =====
    if (data === "my_subjects") {
        if (!user || Object.keys(user.paidSubjects).length === 0) {
            return bot.sendMessage(id, "❌ Siz hali hech qanday fanni sotib olmadingiz.");
        }

        let text = "📚 Sizning ruxsat berilgan fanlaringiz:\n\n";

        Object.keys(user.paidSubjects).forEach(k => {
            if (user.paidSubjects[k]) {
                text += `🔓 ${subjects[k].name}\n`;
            }
        });

        text += "\nTestni boshlash uchun asosiy menyudan fanni tanlang.";
        return bot.sendMessage(id, text);
    }

    // ===== FAN =====
    if (data.startsWith("subject|")) {
        const key = data.split("|")[1];

        // Agar to'lov qilingan bo'lsa - Mini App (Dinamik havola) yuborish
        if (user.paidSubjects[key] === true) {
            const dynamicUrl = `${SERVER_URL}/test?userId=${id}&subject=${key}`;
            
            return bot.sendMessage(id, `Siz ${subjects[key].name} fanini xarid qilgansiz! Testni boshlash uchun quyidagi tugmani bosing:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "▶️ Testni boshlash", web_app: { url: dynamicUrl } }]
                    ]
                }
            });
        }

        // Agar to'lov qilinmagan bo'lsa
        return bot.sendMessage(id,
`💳 ${subjects[key].name}
Narxi: 15 000 so‘m

Iltimos, ushbu karta raqamiga to'lov qiling:
${CARD}
(${OWNER})`,
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

        if (user.pending) {
            return bot.answerCallbackQuery(q.id, { text: "Bitta so'rovingiz kutilyapti. Iltimos, admin tasdiqlashini kuting." });
        }

        user.pending = key;
        await user.save();

        return bot.sendMessage(id, "📸 Iltimos, to'lov qilinganligini tasdiqlovchi chek (screenshot) yuboring:");
    }

    // ===== CONFIRM =====
    if (data.startsWith("confirm|")) {
        if (id !== ADMIN_ID) return;

        const [_, userId, subject, token] = data.split("|");

        const u = await User.findOne({ userId });

        if (!u || u.actionToken !== token) {
            return bot.answerCallbackQuery(q.id, { text: "Bu so'rov allaqachon bajarilgan yoki bekor qilingan." });
        }

        if (!u.paidSubjects) u.paidSubjects = {};

        u.paidSubjects[subject] = true;
        u.pending = null;
        u.actionToken = null;

        u.markModified("paidSubjects");

        u.paidHistory.push({
            subject,
            time: new Date().toLocaleString()
        });

        await u.save();

        await bot.sendMessage(userId, `✅ To‘lovingiz tasdiqlandi! Endi sizga '${subjects[subject].name}' fani bo'yicha testlar ochildi.`);
        await showSubjects(userId);

        await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id
            }
        );

        return bot.answerCallbackQuery(q.id);
    }

    // ===== REJECT =====
    if (data.startsWith("reject|")) {
        if (id !== ADMIN_ID) return;

        const [_, userId, subject, token] = data.split("|");

        const u = await User.findOne({ userId });

        if (!u || u.actionToken !== token) {
            return bot.answerCallbackQuery(q.id);
        }

        u.pending = null;
        u.actionToken = null;
        await u.save();

        await bot.sendMessage(userId, "❌ Kechirasiz, sizning to‘lovingiz rad etildi. Qayta urinib ko'ring yoki adminga yozing.");

        await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
                chat_id: q.message.chat.id,
                message_id: q.message.message_id
            }
        );

        return bot.answerCallbackQuery(q.id);
    }

    // ===== ADMIN STATS =====
    if (data === "admin_stats") {
        if (id !== ADMIN_ID) return;

        const users = await User.find();

        let totalSales = 0;
        users.forEach(u => totalSales += u.paidHistory.length);

        return bot.sendMessage(id,
`📊 Statistika

👥 Jami foydalanuvchilar: ${users.length} ta
💰 Jami tasdiqlangan to'lovlar: ${totalSales} ta`);
    }

    if (data === "admin_users") {
        if (id !== ADMIN_ID) return;

        const users = await User.find().limit(15);

        let text = "👥 Oxirgi ro'yxatdan o'tganlar:\n\n";
        users.forEach(u => {
            text += `- ${u.name} ${u.surname} (${u.group})\n`;
        });

        return bot.sendMessage(id, text);
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
`💰 Yangi to‘lov keldi!
👤 Ism/Guruh: ${user.name} ${user.surname} (${user.group})
📚 Fan: ${subjects[key].name}`,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: `confirm|${id}|${key}|${token}` },
                    { text: "❌ Rad etish", callback_data: `reject|${id}|${key}|${token}` }
                ]
            ]
        }
    });

    bot.sendMessage(id, "⏳ Chek qabul qilindi. Admin tekshirmoqda...");
});

// ===== ADMIN PANEL =====
bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id !== ADMIN_ID) return;

    bot.sendMessage(msg.chat.id, "👨‍💻 Boshqaruv paneli", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Umumiy statistika", callback_data: "admin_stats" }],
                [{ text: "👥 Foydalanuvchilar ro'yxati", callback_data: "admin_users" }]
            ]
        }
    });
});

bot.on("polling_error", console.log);

// ===== SERVERNI ISHGA TUSHIRISH =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Web server va Bot ${PORT}-portda ishga tushdi!`);
});

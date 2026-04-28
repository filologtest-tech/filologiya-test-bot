const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

const app = express();
// Fayllar asosiy papkada bo'lgani uchun:
app.use(express.static(__dirname));

// Railway Variables'dan havolani olamiz
const WEB_APP_URL = process.env.WEB_APP_URL;

// ===== DATABASE =====
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB ulandi"));

const userSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    surname: String,
    group: String,
    step: String,
    paidSubjects: { type: Object, default: {} },
    actionToken: String,
    pending: String
});
const User = mongoose.model("User", userSchema);

// ===== MINI APP SERVING =====
app.get('/test', async (req, res) => {
    const { userId, subject } = req.query;
    try {
        const user = await User.findOne({ userId: Number(userId) });
        // To'lovni tekshirish
        if (user && user.paidSubjects && user.paidSubjects[subject] === true) {
            return res.sendFile(path.join(__dirname, `${subject}.html`));
        }
        res.status(403).send("Ruxsat berilmagan. Avval fanni sotib oling.");
    } catch (e) {
        res.status(500).send("Server xatosi");
    }
});

// ===== BOT SETTINGS =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = 1755754970; // Sizning ID raqamingiz
const CARD = "9860160633231537";
const OWNER = "Safarboyev Umrbek";

const subjects = {
    adabiyot: { name: "Adabiyotshunoslik asoslari" },
    hozirgi_rus: { name: "Hozirgi rus tili" },
    rus_tarix: { name: "Rus adabiyoti tarixi" },
    praktikum: { name: "Rus tili praktikumi" },
    umumiy: { name: "Umumiy tilshunoslik" }
};

// ===== COMMANDS =====
bot.onText(/\/start/, async (msg) => {
    const id = msg.chat.id;
    let user = await User.findOne({ userId: id });
    if (!user) user = new User({ userId: id, paidSubjects: {} });
    user.step = "name";
    await user.save();
    bot.sendMessage(id, "Assalomu alaykum! Ismingizni kiriting:");
});

bot.on("message", async (msg) => {
    const id = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith("/")) return;
    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (user.step === "name") {
        user.name = text; user.step = "surname"; await user.save();
        return bot.sendMessage(id, "Familiyangizni kiriting:");
    }
    if (user.step === "surname") {
        user.surname = text; user.step = "group"; await user.save();
        return bot.sendMessage(id, "Guruh raqamingizni kiriting:");
    }
    if (user.step === "group") {
        user.group = text; user.step = "done"; await user.save();
        bot.sendMessage(id, "Muvaffaqiyatli ro'yxatdan o'tdingiz!");
        return showSubjects(id);
    }
});

// FANLAR MENYUSI (BELGILAR BILAN)
async function showSubjects(id) {
    const user = await User.findOne({ userId: id });
    const buttons = Object.keys(subjects).map(key => {
        // paidSubjects obyekt ekanini va ichida fan borligini tekshiramiz
        const isPaid = user.paidSubjects && user.paidSubjects[key] === true;
        return [{
            text: `${isPaid ? "✅" : "🔒"} ${subjects[key].name}`,
            callback_data: `sub|${key}`
        }];
    });
    bot.sendMessage(id, "Fanni tanlang:", { reply_markup: { inline_keyboard: buttons } });
}

// ===== CALLBACK HANDLER =====
bot.on("callback_query", async (q) => {
    const id = q.from.id;
    const data = q.data;
    bot.answerCallbackQuery(q.id).catch(() => {});

    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (data.startsWith("sub|")) {
        const key = data.split("|")[1];
        // SOTIB OLGAN BO'LSA
        if (user.paidSubjects && user.paidSubjects[key] === true) {
            const url = `${WEB_APP_URL}/test?userId=${id}&subject=${key}`;
            return bot.sendMessage(id, `🔓 ${subjects[key].name} fani ochiq. Testni boshlash uchun bosing:`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "▶️ Testni boshlash", web_app: { url: url } }]]
                }
            });
        }
        // SOTIB OLMAGAN BO'LSA
        return bot.sendMessage(id, `💳 ${subjects[key].name}\nNarxi: 15 000 so'm\n\nKarta: ${CARD}\nEga: ${OWNER}`, {
            reply_markup: { inline_keyboard: [[{ text: "✅ To'lov qildim", callback_data: `chk|${key}` }]] }
        });
    }

    if (data.startsWith("chk|")) {
        user.pending = data.split("|")[1];
        await user.save();
        bot.sendMessage(id, "📸 To'lov chekini (screenshot) yuboring:");
    }

    // ADMIN TASDIQLASHI
    if (data.startsWith("ok|") || data.startsWith("no|")) {
        if (id !== ADMIN_ID) return;
        const [action, uId, sub, tok] = data.split("|");
        const target = await User.findOne({ userId: Number(uId) });

        if (!target || target.actionToken !== tok) return;

        if (action === "ok") {
            if (!target.paidSubjects) target.paidSubjects = {};
            target.paidSubjects[sub] = true;
            target.markModified("paidSubjects"); // MongoDB uchun muhim!
            target.pending = null; target.actionToken = null;
            await target.save();
            
            await bot.sendMessage(uId, `✅ To'lov tasdiqlandi! ${subjects[sub].name} ochildi.`);
            showSubjects(uId); // Foydalanuvchiga yangi menyuni yuboramiz
        } else {
            target.pending = null; target.actionToken = null;
            await target.save();
            bot.sendMessage(uId, "❌ To'lov rad etildi.");
        }
        bot.deleteMessage(id, q.message.message_id).catch(() => {});
    }
});

// ===== PHOTO (CHEK) HANDLER =====
bot.on("photo", async (msg) => {
    const id = msg.chat.id;
    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;

    const token = crypto.randomBytes(3).toString("hex");
    user.actionToken = token;
    await user.save();

    bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
        caption: `💰 To'lov: ${user.name} ${user.surname}\n📚 Fan: ${subjects[user.pending].name}`,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: `ok|${id}|${user.pending}|${token}` },
                    { text: "❌ Rad etish", callback_data: `no|${id}|${user.pending}|${token}` }
                ]
            ]
        }
    });
    bot.sendMessage(id, "⏳ Chek qabul qilindi, tekshirilmoqda...");
});

app.listen(process.env.PORT || 3000);

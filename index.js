const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));

const SERVER_URL = process.env.WEB_APP_URL || "";

// ===== DATABASE =====
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ DB ulandi"))
    .catch(err => console.error("❌ DB xatosi:", err));

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

// ===== MINI APP ROUTE =====
app.get('/test', async (req, res) => {
    const { userId, subject } = req.query;
    try {
        const user = await User.findOne({ userId: Number(userId) });
        if (user && user.paidSubjects && user.paidSubjects[subject]) {
            return res.sendFile(path.join(__dirname, `${subject}.html`));
        }
        res.status(403).send("Ruxsat yo'q");
    } catch (e) { res.status(500).send("Xato"); }
});

// ===== BOT SETTINGS =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ⚠️ DIQQAT: Bu ID aynan sizniki ekanini tekshiring!
const ADMIN_ID = 1755754970; 

const subjects = {
    adabiyot: { name: "Adabiyotshunoslik asoslari" },
    hozirgi_rus: { name: "Hozirgi rus tili" },
    rus_tarix: { name: "Rus adabiyoti tarixi" },
    praktikum: { name: "Rus tili praktikumi" },
    umumiy: { name: "Umumiy tilshunoslik" }
};

// ===== START & REGISTRATION =====
bot.onText(/\/start/, async (msg) => {
    const id = msg.chat.id;
    let user = await User.findOne({ userId: id });
    if (!user) user = new User({ userId: id, paidSubjects: {} });
    user.step = "name";
    await user.save();
    bot.sendMessage(id, "Ismingizni kiriting:");
});

bot.on("message", async (msg) => {
    const id = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith("/")) return;
    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (user.step === "name") {
        user.name = text; user.step = "surname"; await user.save();
        return bot.sendMessage(id, "Familiyangiz:");
    }
    if (user.step === "surname") {
        user.surname = text; user.step = "group"; await user.save();
        return bot.sendMessage(id, "Guruh:");
    }
    if (user.step === "group") {
        user.group = text; user.step = "done"; await user.save();
        return showSubjects(id);
    }
});

async function showSubjects(id) {
    const user = await User.findOne({ userId: id });
    const buttons = Object.keys(subjects).map(key => {
        const isPaid = user.paidSubjects && user.paidSubjects[key] === true;
        return [{ text: `${isPaid ? "✅" : "🔒"} ${subjects[key].name}`, callback_data: `sub|${key}` }];
    });
    bot.sendMessage(id, "Fan tanlang:", { reply_markup: { inline_keyboard: buttons } });
}

// ===== CALLBACK HANDLER (TASDIQLASH QISMI) =====
bot.on("callback_query", async (q) => {
    const id = q.from.id;
    const data = q.data;

    // 1. Tugmani muzlashdan qutqarish
    bot.answerCallbackQuery(q.id).catch(() => {});

    console.log(`➡️ Tugma bosildi: ${data} | Bosgan ID: ${id}`);

    const user = await User.findOne({ userId: id });

    // Fan tanlash
    if (data.startsWith("sub|")) {
        const key = data.split("|")[1];
        if (user.paidSubjects && user.paidSubjects[key]) {
            const url = `${process.env.WEB_APP_URL}/test?userId=${id}&subject=${key}`;
            return bot.sendMessage(id, `🔓 Ochiq: ${subjects[key].name}`, {
                reply_markup: { inline_keyboard: [[{ text: "▶️ Testni boshlash", web_app: { url } }]] }
            });
        }
        return bot.sendMessage(id, `💳 To'lov: 15.000 so'm\n9860160633231537\nSafarboyev Umrbek`, {
            reply_markup: { inline_keyboard: [[{ text: "✅ To'lov qildim", callback_data: `chk|${key}` }]] }
        });
    }

    if (data.startsWith("chk|")) {
        user.pending = data.split("|")[1];
        await user.save();
        return bot.sendMessage(id, "📸 Chek (screenshot) yuboring:");
    }

    // TASDIQLASH LOGIKASI
    if (data.startsWith("ok|") || data.startsWith("no|")) {
        console.log("Checking Admin ID...");
        if (id !== ADMIN_ID) {
            console.log(`❌ Rad etildi: ${id} admin emas. Kutilgan ID: ${ADMIN_ID}`);
            return;
        }

        const [action, uId, sub, tok] = data.split("|");
        const target = await User.findOne({ userId: Number(uId) });

        if (!target || target.actionToken !== tok) {
            console.log("❌ Token xato yoki foydalanuvchi yo'q");
            return bot.sendMessage(ADMIN_ID, "Eskirgan so'rov.");
        }

        if (action === "ok") {
            if (!target.paidSubjects) target.paidSubjects = {};
            target.paidSubjects[sub] = true;
            target.markModified("paidSubjects");
            target.pending = null; target.actionToken = null;
            await target.save();
            bot.sendMessage(uId, `✅ ${subjects[sub].name} ochildi!`);
            bot.sendMessage(ADMIN_ID, "Tasdiqlandi.");
        } else {
            target.pending = null; target.actionToken = null;
            await target.save();
            bot.sendMessage(uId, "❌ To'lov rad etildi.");
            bot.sendMessage(ADMIN_ID, "Rad etildi.");
        }
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: id, message_id: q.message.message_id }).catch(() => {});
    }
});

// ===== PHOTO HANDLER =====
bot.on("photo", async (msg) => {
    const id = msg.chat.id;
    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;

    const token = crypto.randomBytes(3).toString("hex");
    user.actionToken = token;
    await user.save();

    console.log(`📸 Chek keldi: ${user.name} dan ${user.pending} uchun`);

    bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
        caption: `💰 To'lov: ${user.name}\n📚 Fan: ${subjects[user.pending].name}`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ Tasdiqlash", callback_data: `ok|${id}|${user.pending}|${token}` },
                { text: "❌ Rad etish", callback_data: `no|${id}|${user.pending}|${token}` }
            ]]
        }
    });
    bot.sendMessage(id, "⏳ Tekshirilmoqda...");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server ${PORT}da tayyor`));

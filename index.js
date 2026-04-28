const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));

// Havolani tozalash: bo'sh joylarni olib tashlaydi
const getBaseUrl = () => {
    let url = process.env.WEB_APP_URL || "";
    url = url.trim(); // Bo'sh joylarni tozalash
    if (url && !url.startsWith('http')) url = 'https://' + url;
    return url.replace(/\/$/, ""); // Oxiridagi slashni olib tashlaydi
};

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB ulandi"));

const userSchema = new mongoose.Schema({
    userId: Number, name: String, surname: String, group: String, step: String,
    paidSubjects: { type: Object, default: {} },
    actionToken: String, pending: String
});
const User = mongoose.model("User", userSchema);

app.get('/test', async (req, res) => {
    const { userId, subject } = req.query;
    const user = await User.findOne({ userId: Number(userId) });
    if (user && user.paidSubjects && user.paidSubjects[subject] === true) {
        return res.sendFile(path.join(__dirname, `${subject}.html`));
    }
    res.status(403).send("Ruxsat yo'q");
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = 1755754970; 
const CARD = "9860160633231537";
const OWNER = "Safarboyev Umrbek";

const subjects = {
    adabiyot: { name: "Adabiyotshunoslik asoslari" },
    hozirgi_rus: { name: "Hozirgi rus tili" },
    rus_tarix: { name: "Rus adabiyoti tarixi" },
    praktikum: { name: "Rus tili praktikumi" },
    umumiy: { name: "Umumiy tilshunoslik" }
};

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
    if (!msg.text || msg.text.startsWith("/")) return;
    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (user.step === "name") { user.name = msg.text; user.step = "surname"; await user.save(); return bot.sendMessage(id, "Familiyangizni kiriting:"); }
    if (user.step === "surname") { user.surname = msg.text; user.step = "group"; await user.save(); return bot.sendMessage(id, "Guruhni kiriting:"); }
    if (user.step === "group") { user.group = msg.text; user.step = "done"; await user.save(); return showSubjects(id); }
});

async function showSubjects(id) {
    const user = await User.findOne({ userId: id });
    const buttons = Object.keys(subjects).map(key => {
        const isPaid = user.paidSubjects && user.paidSubjects[key] === true;
        return [{ text: `${isPaid ? "✅" : "🔒"} ${subjects[key].name}`, callback_data: `sub|${key}` }];
    });
    bot.sendMessage(id, "Fan tanlang:", { reply_markup: { inline_keyboard: buttons } });
}

bot.on("callback_query", async (q) => {
    const id = q.from.id;
    const data = q.data;
    bot.answerCallbackQuery(q.id).catch(() => {});

    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (data.startsWith("sub|")) {
        const key = data.split("|")[1];
        if (user.paidSubjects && user.paidSubjects[key]) {
            const baseUrl = getBaseUrl();
            const url = `${baseUrl}/test?userId=${id}&subject=${key}`;
            
            return bot.sendMessage(id, `🔓 ${subjects[key].name} fani ochiq. Testni boshlang:`, {
                reply_markup: { inline_keyboard: [[{ text: "▶️ Testni boshlash", web_app: { url } }]] }
            }).catch(e => {
                bot.sendMessage(id, `❌ Xatolik: Havola noto'g'ri sozlangan. Hozirgi havola: ${baseUrl}`);
            });
        }
        return bot.sendMessage(id, `💳 ${subjects[key].name}\nNarxi: 15.000 so'm\n\nKarta: ${CARD}\nEga: ${OWNER}`, {
            reply_markup: { inline_keyboard: [[{ text: "✅ To'lov qildim", callback_data: `chk|${key}` }]] }
        });
    }

    if (data.startsWith("chk|")) {
        user.pending = data.split("|")[1];
        await user.save();
        return bot.sendMessage(id, "📸 Screenshot (chek) yuboring:");
    }

    if (data.startsWith("ok|") || data.startsWith("no|")) {
        if (id !== ADMIN_ID) return;
        const [action, uId, sub, tok] = data.split("|");
        const target = await User.findOne({ userId: Number(uId) });
        if (!target || target.actionToken !== tok) return;

        if (action === "ok") {
            if (!target.paidSubjects) target.paidSubjects = {};
            target.paidSubjects[sub] = true;
            target.markModified("paidSubjects");
            target.pending = null; target.actionToken = null;
            await target.save();
            await bot.sendMessage(uId, `✅ Tasdiqlandi! ${subjects[sub].name} ochildi.`);
            showSubjects(uId);
        } else {
            target.pending = null; target.actionToken = null;
            await target.save();
            bot.sendMessage(uId, "❌ To'lov rad etildi.");
        }
        
        // Rasm o'chmasligi uchun faqat tugmalarni olib tashlaymiz
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: id,
            message_id: q.message.message_id
        }).catch(() => {});
    }
});

bot.on("photo", async (msg) => {
    const id = msg.chat.id;
    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;
    const token = crypto.randomBytes(3).toString("hex");
    user.actionToken = token;
    await user.save();
    bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
        caption: `💰 To'lov cheki\n👤 Kimdan: ${user.name} ${user.surname}\n📚 Fan: ${subjects[user.pending].name}\n👥 Guruh: ${user.group}`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ Tasdiqlash", callback_data: `ok|${id}|${user.pending}|${token}` },
                { text: "❌ Rad etish", callback_data: `no|${id}|${user.pending}|${token}` }
            ]]
        }
    });
    bot.sendMessage(id, "⏳ Chek qabul qilindi, admin tekshirmoqda...");
});

app.listen(process.env.PORT || 3000);

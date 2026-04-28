const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

// ===== WEB SERVER (EXPRESS) SOZLAMALARI =====
const app = express();
// Fayllar asosiy papkada bo'lgani uchun __dirname ishlatamiz
app.use(express.static(__dirname));

const SERVER_URL = process.env.WEB_APP_URL || "https://sizning-domeningiz.com";

// ===== DB =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB ulandi"))
.catch(err => console.log("DB Xatosi:", err));

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

// Test sahifasi marshruti
app.get('/test', async (req, res) => {
    const { userId, subject } = req.query;
    if (!userId || !subject) return res.status(400).send("Xato: Ma'lumot yetarli emas.");

    try {
        const user = await User.findOne({ userId: Number(userId) });
        if (!user || !user.paidSubjects[subject]) {
            return res.status(403).send("Xato: Kirish taqiqlangan.");
        }

        const fileNames = {
            adabiyot: 'adabiyot.html',
            hozirgi_rus: 'hozirgi_rus.html',
            rus_tarix: 'rus_tarix.html',
            praktikum: 'praktikum.html',
            umumiy: 'umumiy.html'
        };

        const targetFile = fileNames[subject];
        if (!targetFile) return res.status(404).send("Fan topilmadi.");

        res.sendFile(path.join(__dirname, targetFile));
    } catch (err) {
        res.status(500).send("Server xatosi.");
    }
});

// ===== BOT =====
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

// ===== START =====
bot.onText(/\/start/, async (msg) => {
    const id = msg.chat.id;
    let user = await User.findOne({ userId: id });
    if (!user) user = new User({ userId: id });
    user.step = "name";
    await user.save();
    bot.sendMessage(id, "Assalomu alaykum! Ismingizni kiriting:");
});

// ===== MESSAGE =====
bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const id = msg.chat.id;
    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (user.step === "name") {
        user.name = msg.text;
        user.step = "surname";
        await user.save();
        return bot.sendMessage(id, "Familiyangizni kiriting:");
    }
    if (user.step === "surname") {
        user.surname = msg.text;
        user.step = "group";
        await user.save();
        return bot.sendMessage(id, "Guruhni kiriting:");
    }
    if (user.step === "group") {
        user.group = msg.text;
        user.step = "done";
        await user.save();
        return showSubjects(id);
    }
});

// ===== SHOW SUBJECTS =====
async function showSubjects(id) {
    const user = await User.findOne({ userId: id });
    const buttons = Object.keys(subjects).map(key => {
        const paid = user.paidSubjects && user.paidSubjects[key] === true;
        return [{
            text: `${paid ? "" : "🔒 "}${subjects[key].name}`,
            callback_data: `subject|${key}`
        }];
    });
    buttons.push([{ text: "📚 Mening fanlarim", callback_data: "my_subjects" }]);
    bot.sendMessage(id, "Fan tanlang:", { reply_markup: { inline_keyboard: buttons } });
}

// ===== CALLBACK QUERY =====
bot.on("callback_query", async (q) => {
    const id = q.from.id;
    const data = q.data;
    
    // Tugma bosilganda soat aylanib qolmasligi uchun darhol javob beramiz
    bot.answerCallbackQuery(q.id).catch(() => {});

    const user = await User.findOne({ userId: id });
    if (!user) return;

    if (data === "my_subjects") {
        let text = "📚 Sizning fanlaringiz:\n\n";
        let has = false;
        Object.keys(subjects).forEach(k => {
            if (user.paidSubjects && user.paidSubjects[k]) {
                text += `✅ ${subjects[k].name}\n`;
                has = true;
            }
        });
        if (!has) text = "❌ Sizda hali sotib olingan fanlar yo'q.";
        return bot.sendMessage(id, text);
    }

    if (data.startsWith("subject|")) {
        const key = data.split("|")[1];
        if (user.paidSubjects && user.paidSubjects[key] === true) {
            const dynamicUrl = `${SERVER_URL}/test?userId=${id}&subject=${key}`;
            return bot.sendMessage(id, `▶️ ${subjects[key].name} fani bo'yicha testni boshlash:`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "Testni boshlash", web_app: { url: dynamicUrl } }]]
                }
            });
        }
        return bot.sendMessage(id, `💳 ${subjects[key].name}\nNarxi: 15 000 so'm\n\nKarta: ${CARD}\nEga: ${OWNER}`, {
            reply_markup: { inline_keyboard: [[{ text: "✅ To'lov qildim", callback_data: `check|${key}` }]] }
        });
    }

    if (data.startsWith("check|")) {
        user.pending = data.split("|")[1];
        await user.save();
        return bot.sendMessage(id, "📸 Chek (screenshot) yuboring:");
    }

    if (data.startsWith("confirm|")) {
        if (id !== ADMIN_ID) return;
        const [_, uId, sub, tok] = data.split("|");
        const u = await User.findOne({ userId: uId });
        if (!u || u.actionToken !== tok) return;

        if (!u.paidSubjects) u.paidSubjects = {};
        u.paidSubjects[sub] = true;
        u.pending = null;
        u.actionToken = null;
        u.markModified("paidSubjects");
        await u.save();

        bot.sendMessage(uId, `✅ ${subjects[sub].name} ochildi!`);
        return showSubjects(uId);
    }
});

// ===== PHOTO =====
bot.on("photo", async (msg) => {
    const id = msg.chat.id;
    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;

    const token = crypto.randomBytes(4).toString("hex");
    user.actionToken = token;
    await user.save();

    bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
        caption: `💰 To'lov: ${user.name} ${user.surname}\n📚 Fan: ${subjects[user.pending].name}`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ Tasdiqlash", callback_data: `confirm|${id}|${user.pending}|${token}` },
                { text: "❌ Rad etish", callback_data: `reject|${id}|${user.pending}|${token}` }
            ]]
        }
    });
    bot.sendMessage(id, "⏳ Admin tekshirmoqda...");
});

// ===== ADMIN =====
bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id === ADMIN_ID) bot.sendMessage(ADMIN_ID, "Admin Panel");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda`));

bot.on("polling_error", (err) => console.log("Polling xatosi:"));

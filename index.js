const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const crypto = require('crypto');
const express = require('express');
const path = require('path');

// ===== WEB SERVER (EXPRESS) SOZLAMALARI =====
const app = express();
// Fayllar asosiy papkada bo'lgani uchun __dirname ishlatamiz
app.use(express.static(__dirname));

// Railway'dan keladigan asosiy domen manzili
const SERVER_URL = process.env.WEB_APP_URL;

// ===== MONGODB ULANISHI =====
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB muvaffaqiyatli ulandi"))
    .catch(err => console.log("Ma'lumotlar bazasida xatolik:", err));

// ===== MA'LUMOTLAR MODELI =====
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

// ===== MINI APP UCHUN YO'NALISH (ROUTE) =====
app.get('/test', async (req, res) => {
    const { userId, subject } = req.query;
    if (!userId || !subject) return res.status(400).send("Noto'g'ri havola.");

    try {
        const user = await User.findOne({ userId: Number(userId) });
        // Foydalanuvchi to'lov qilganini tekshirish
        if (!user || !user.paidSubjects || !user.paidSubjects[subject]) {
            return res.status(403).send("Xato: Siz bu fanni sotib olmagansiz.");
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
        res.status(500).send("Server xatosi yuz berdi.");
    }
});

// ===== BOT SOZLAMALARI =====
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

// ===== BOT COMMANDS =====

// START: Ro'yxatdan o'tishni boshlash
bot.onText(/\/start/, async (msg) => {
    const id = msg.chat.id;
    let user = await User.findOne({ userId: id });
    
    if (!user) {
        user = new User({ userId: id, paidSubjects: {} });
    }
    
    user.step = "name";
    await user.save();
    bot.sendMessage(id, "Xush kelibsiz! Ismingizni kiriting:");
});

// TEXT HANDLER: Ism, familiya va guruhni qabul qilish
bot.on("message", async (msg) => {
    const id = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith("/")) return;

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
        return bot.sendMessage(id, "Guruh raqamingizni kiriting:");
    }

    if (user.step === "group") {
        user.group = text;
        user.step = "done";
        await user.save();
        bot.sendMessage(id, "Ro'yxatdan o'tish muvaffaqiyatli yakunlandi!");
        return showSubjects(id);
    }
});

// FANLAR RO'YXATI: Qulf belgisini boshqarish bilan
async function showSubjects(id) {
    const user = await User.findOne({ userId: id });
    
    const buttons = Object.keys(subjects).map(key => {
        const isPaid = user.paidSubjects && user.paidSubjects[key] === true;
        return [{
            // Agar sotib olingan bo'lsa qulf belgisi chiqmaydi
            text: `${isPaid ? "" : "🔒 "}${subjects[key].name}`,
            callback_data: `subject|${key}`
        }];
    });

    buttons.push([{ text: "📚 Mening fanlarim", callback_data: "my_subjects" }]);

    bot.sendMessage(id, "Fanlardan birini tanlang:", {
        reply_markup: { inline_keyboard: buttons }
    });
}

// CALLBACK QUERY: Hamma tugmalar uchun mantiq
bot.on("callback_query", async (q) => {
    const id = q.from.id;
    const data = q.data;
    const msgId = q.message.message_id;

    // Tugma qotib qolmasligi uchun darhol javob qaytaramiz
    bot.answerCallbackQuery(q.id).catch(() => {});

    const user = await User.findOne({ userId: id });
    if (!user) return;

    // Mening fanlarim bo'limi
    if (data === "my_subjects") {
        let text = "📚 Siz xarid qilgan fanlar:\n\n";
        let hasSubject = false;
        
        Object.keys(subjects).forEach(k => {
            if (user.paidSubjects && user.paidSubjects[k]) {
                text += `✅ ${subjects[k].name}\n`;
                hasSubject = true;
            }
        });

        if (!hasSubject) text = "❌ Sizda hali sotib olingan fanlar mavjud emas.";
        return bot.sendMessage(id, text);
    }

    // Fan tanlanganda
    if (data.startsWith("subject|")) {
        const key = data.split("|")[1];
        
        // Agar sotib olingan bo'lsa - Mini App tugmasini chiqarish
        if (user.paidSubjects && user.paidSubjects[key] === true) {
            const dynamicUrl = `${SERVER_URL}/test?userId=${id}&subject=${key}`;
            return bot.sendMessage(id, `🔓 ${subjects[key].name} fani ochiq. Testni boshlashingiz mumkin:`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "▶️ Testni boshlash", web_app: { url: dynamicUrl } }]]
                }
            });
        }

        // Agar sotib olinmagan bo'lsa - To'lov ma'lumotlari
        return bot.sendMessage(id, 
            `💳 ${subjects[key].name}\nNarxi: 15 000 so'm\n\nTo'lov uchun karta:\n${CARD}\n${OWNER}`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: "✅ To'lov qildim", callback_data: `check|${key}` }]]
                }
            }
        );
    }

    // To'lov qildim tugmasi
    if (data.startsWith("check|")) {
        user.pending = data.split("|")[1];
        await user.save();
        return bot.sendMessage(id, "📸 To'lov chekini (screenshot) yuboring:");
    }

    // ADMIN: TASDIQLASH YOKI RAD ETISH
    if (data.startsWith("confirm|") || data.startsWith("reject|")) {
        if (id !== ADMIN_ID) return; // Begona odam ishlata olmaydi

        const [action, uId, sub, tok] = data.split("|");
        const target = await User.findOne({ userId: Number(uId) });

        if (!target || target.actionToken !== tok) {
            return bot.sendMessage(ADMIN_ID, "⚠️ Xato: Bu so'rov eskirgan yoki foydalanuvchi topilmadi.");
        }

        if (action === "confirm") {
            if (!target.paidSubjects) target.paidSubjects = {};
            target.paidSubjects[sub] = true;
            target.pending = null;
            target.actionToken = null;
            target.markModified("paidSubjects");
            target.paidHistory.push({ subject: sub, date: new Date().toLocaleString() });
            await target.save();

            bot.sendMessage(uId, `✅ To'lovingiz tasdiqlandi! '${subjects[sub].name}' fani ochildi.`);
            bot.sendMessage(ADMIN_ID, `✅ ${target.name} uchun ${sub} fani tasdiqlandi.`);
            showSubjects(uId); // Yangilangan ro'yxatni yuborish
        } else {
            target.pending = null;
            target.actionToken = null;
            await target.save();
            bot.sendMessage(uId, "❌ Kechirasiz, siz yuborgan to'lov cheki tasdiqlanmadi.");
            bot.sendMessage(ADMIN_ID, "❌ To'lov rad etildi.");
        }

        // Admin xabaridagi tugmalarni o'chirish
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: id, message_id: msgId }).catch(() => {});
    }

    // ADMIN STATS
    if (data === "admin_stats") {
        if (id !== ADMIN_ID) return;
        const users = await User.find();
        let sales = 0;
        users.forEach(u => sales += (u.paidHistory ? u.paidHistory.length : 0));
        bot.sendMessage(id, `📊 Statistika:\n\n👥 Azolar: ${users.length}\n💰 Jami sotuvlar: ${sales}`);
    }
});

// SCREENSHOT HANDLER: Adminga yuborish
bot.on("photo", async (msg) => {
    const id = msg.chat.id;
    const user = await User.findOne({ userId: id });
    if (!user || !user.pending) return;

    const key = user.pending;
    const token = crypto.randomBytes(4).toString("hex");
    user.actionToken = token;
    await user.save();

    bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, {
        caption: `💰 Yangi to'lov!\n👤 Ism: ${user.name} ${user.surname}\n📚 Fan: ${subjects[key].name}\n👥 Guruh: ${user.group}`,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: `confirm|${id}|${key}|${token}` },
                    { text: "❌ Rad etish", callback_data: `reject|${id}|${key}|${token}` }
                ]
            ]
        }
    });
    bot.sendMessage(id, "⏳ Chek qabul qilindi, admin tekshirmoqda...");
});

// ADMIN PANEL COMMAND
bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id !== ADMIN_ID) return;
    bot.sendMessage(ADMIN_ID, "👨‍💻 Admin Panel", {
        reply_markup: {
            inline_keyboard: [[{ text: "📊 Statistika", callback_data: "admin_stats" }]]
        }
    });
});

// ERROR HANDLING
bot.on("polling_error", (err) => console.log("Bot Polling Error:", err.message));

// SERVER START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda ishlamoqda...`);
});

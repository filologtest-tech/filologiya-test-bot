const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const app = express();

app.use(express.json());

const bot = new TelegramBot(token);

const PORT = process.env.PORT || 3000;
const URL = process.env.RAILWAY_STATIC_URL;

// ===== WEBHOOK =====
bot.setWebHook(`${URL}/bot${token}`);

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ===== USERS =====
let users = {};

// ===== FANLAR =====
const subjects = {
    adabiyot: {
        name: "Adabiyotshunoslik asoslari",
        price: 15000,
        link: "https://TEST_LINK_1"
    },
    hozirgi_rus: {
        name: "Hozirgi rus tili",
        price: 15000,
        link: "https://TEST_LINK_2"
    },
    rus_tarix: {
        name: "Rus adabiyoti tarixi",
        price: 15000,
        link: "https://TEST_LINK_3"
    },
    praktikum: {
        name: "Rus tili praktikumi",
        price: 15000,
        link: "https://TEST_LINK_4"
    },
    umumiy: {
        name: "Umumiy tilshunoslik",
        price: 15000,
        link: "https://TEST_LINK_5"
    }
};

// ===== START =====
bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id;

    users[id] = {
        paidSubjects: {}
    };

    bot.sendMessage(id, "Fan tanlang:");
    showSubjects(id);
});

// ===== FANLARNI KO‘RSATISH =====
function showSubjects(id) {
    const buttons = Object.keys(subjects).map(key => {
        const paid = users[id].paidSubjects[key];

        return [{
            text: `${paid ? "🔓" : "🔒"} ${subjects[key].name}`,
            callback_data: `subject_${key}`
        }];
    });

    bot.sendMessage(id, "Fanlar:", {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
}

// ===== BOSILGANDA =====
bot.on("callback_query", (q) => {
    const id = q.message.chat.id;
    const data = q.data;

    if (data.startsWith("subject_")) {
        const key = data.split("_")[1];

        if (users[id].paidSubjects[key]) {
            return bot.sendMessage(id, `Test link:\n${subjects[key].link}`);
        } else {
            return bot.sendMessage(id,
                `💰 Narxi: ${subjects[key].price} so‘m\n\nTo‘lov qilish uchun /pay ${key}`
            );
        }
    }
});

// ===== PAY (hozircha test rejim) =====
bot.onText(/\/pay (.+)/, (msg, match) => {
    const id = msg.chat.id;
    const subject = match[1];

    if (!subjects[subject]) {
        return bot.sendMessage(id, "Fan topilmadi");
    }

    // ⚠️ vaqtinchalik: avtomatik ochish (test uchun)
    users[id].paidSubjects[subject] = true;

    bot.sendMessage(id, `✅ To‘lov tasdiqlandi (test)\n\nFan ochildi`);
    showSubjects(id);
});

// ===== SERVER =====
app.listen(PORT, () => {
    console.log("Server running...");
});

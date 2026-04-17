const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ===== USERS =====
let users = {};

// ===== FANLAR =====
const subjects = {
    adabiyot: {
        name: "Adabiyotshunoslik asoslari",
        link: "https://test1.com"
    },
    hozirgi_rus: {
        name: "Hozirgi rus tili",
        link: "https://test2.com"
    },
    rus_tarix: {
        name: "Rus adabiyoti tarixi",
        link: "https://test3.com"
    },
    praktikum: {
        name: "Rus tili praktikumi",
        link: "https://test4.com"
    },
    umumiy: {
        name: "Umumiy tilshunoslik",
        link: "https://test5.com"
    }
};

// ===== START =====
bot.onText(/\/start/, (msg) => {
    const id = msg.chat.id;

    users[id] = {
        step: "name",
        name: "",
        surname: "",
        group: "",
        paidSubjects: {}
    };

    bot.sendMessage(id, "Ismingizni kiriting:");
});

// ===== MESSAGE (RO‘YXAT) =====
bot.on("message", (msg) => {
    const id = msg.chat.id;
    const text = msg.text;

    if (!users[id]) return;
    if (text === "/start") return;

    const user = users[id];

    if (user.step === "name") {
        user.name = text;
        user.step = "surname";
        return bot.sendMessage(id, "Familiyangizni kiriting:");
    }

    if (user.step === "surname") {
        user.surname = text;
        user.step = "group";
        return bot.sendMessage(id, "Guruhingizni kiriting:");
    }

    if (user.step === "group") {
        user.group = text;
        user.step = "done";

        bot.sendMessage(
            id,
            `✅ Ro‘yxatdan o‘tdingiz:\n\n👤 ${user.name} ${user.surname}\n🏫 ${user.group}`
        );

        return showSubjects(id);
    }
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

    bot.sendMessage(id, "Fan tanlang:", {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
}

// ===== FAN BOSILGANDA =====
bot.on("callback_query", (q) => {
    const id = q.message.chat.id;
    const data = q.data;

    if (data.startsWith("subject_")) {
        const key = data.split("_")[1];

        if (users[id].paidSubjects[key]) {
            return bot.sendMessage(
                id,
                `📚 Testga kirish:\n${subjects[key].link}`
            );
        } else {
            return bot.sendMessage(
                id,
                "❌ Bu fan uchun to‘lov qilinmagan.\n\n(To‘lov tizimi keyingi bosqichda qo‘shiladi)"
            );
        }
    }
});

console.log("Bot started...");

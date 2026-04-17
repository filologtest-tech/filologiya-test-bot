const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ====== SERVER (keyinchalik to‘lov uchun kerak bo‘ladi) ======
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server ishlayapti"));

// ====== USERS ======
let users = {};

// ====== FANLAR ======
const subjects = {
  adabiyot: { name: "Adabiyotshunoslik asoslari", price: 15000 },
  hozirgi_rus: { name: "Hozirgi rus tili. Tilsh asoslari", price: 15000 },
  rus_tarix: { name: "Rus adabiyoti tarixi", price: 15000 },
  praktikum: { name: "Rus tili praktikumi", price: 15000 },
  umumiy: { name: "Umumiy tilshunoslik", price: 15000 }
};

// ====== START ======
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  users[id] = {
    paidSubjects: {}
  };

  showSubjects(id);
});

// ====== FANLARNI CHIQARISH ======
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

// ====== TUGMA BOSILGANDA ======
bot.on('callback_query', (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  if (data.startsWith("subject_")) {
    const subject = data.split("_")[1];

    if (users[id].paidSubjects[subject]) {
      return bot.sendMessage(id, "✅ Bu fan ochiq (keyin link qo‘shamiz)");
    } else {
      return bot.sendMessage(id, "🔒 Bu fan yopiq. To‘lov qilish kerak");
    }
  }
});

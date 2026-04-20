const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ===== ADMIN =====
const ADMIN_ID = 1755754970;

// ===== MONGODB =====
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB ulandi"))
  .catch(err => console.log("MongoDB xato:", err));

// ===== SCHEMA =====
const userSchema = new mongoose.Schema({
  userId: Number,
  name: String,
  surname: String,
  group: String,
  step: String,
  paidSubjects: { type: Object, default: {} },
  pending: String
});

const paymentSchema = new mongoose.Schema({
  userId: Number,
  subject: String,
  time: String
});

const User = mongoose.model("User", userSchema);
const Payment = mongoose.model("Payment", paymentSchema);

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
    user = new User({
      userId: id,
      step: "name",
      name: "",
      surname: "",
      group: "",
      paidSubjects: {},
      pending: null
    });
  } else {
    user.step = "name";
  }

  await user.save();
  bot.sendMessage(id, "Ismingizni kiriting:");
});

// ===== MESSAGE =====
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (text === "/start") return;

  const user = await User.findOne({ userId: id });
  if (!user) return;

  // ===== SCREENSHOT =====
  if (msg.photo) {
    if (!user.pending) return;

    const key = user.pending;
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const time = new Date().toLocaleString();

    await new Payment({ userId: id, subject: key, time }).save();

    bot.sendMessage(id, "⏳ Adminga yuborildi, kuting...");

    bot.sendPhoto(ADMIN_ID, fileId, {
      caption: `💰 Yangi to‘lov:

👤 ${user.name} ${user.surname}
🏫 ${user.group}
📚 ${subjects[key].name}
🕒 ${time}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: `approve_${id}_${key}` },
            { text: "❌ Rad etish", callback_data: `reject_${id}` }
          ]
        ]
      }
    });

    return;
  }

  // ===== RO‘YXAT =====
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
    return showSubjects(id);
  }
});

// ===== FANLAR =====
async function showSubjects(id) {
  const user = await User.findOne({ userId: id });

  const buttons = Object.keys(subjects).map(key => {
    const paid = user.paidSubjects?.[key];
    return [{
      text: `${paid ? "🔓" : "🔒"} ${subjects[key].name}`,
      callback_data: `subject_${key}`
    }];
  });

  bot.sendMessage(id, "Fan tanlang:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  const user = await User.findOne({ userId: id });
  if (!user) return;

  // FAN
  if (data.startsWith("subject_")) {
    const key = data.replace("subject_", "");

    if (user.paidSubjects?.[key]) {
      return bot.sendMessage(id, subjects[key].link);
    }

    return bot.sendMessage(id,
      `💳 ${subjects[key].name}
Narxi: 15 000 so‘m

👉 Kartaga o‘tkazing:
9860160633231537

👤 Safarboyev Umrbek`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ To‘lov qildim", callback_data: `check_${key}` }]
          ]
        }
      }
    );
  }

  // TO‘LOV BOSILDI
  if (data.startsWith("check_")) {
    const key = data.replace("check_", "");

    if (user.pending) {
      return bot.sendMessage(id, "⏳ Oldingi to‘lov tekshirilmoqda");
    }

    user.pending = key;
    await user.save();

    return bot.sendMessage(id, "📸 Screenshot yuboring:");
  }

  // APPROVE
  if (data.startsWith("approve_")) {
    const [_, userId, subject] = data.split("_");
    const u = await User.findOne({ userId: Number(userId) });
    if (!u) return;

    u.paidSubjects[subject] = true;
    u.pending = null;
    await u.save();

    bot.sendMessage(userId, "✅ To‘lov tasdiqlandi!");
    showSubjects(userId);
  }

  // REJECT
  if (data.startsWith("reject_")) {
    const userId = Number(data.split("_")[1]);
    const u = await User.findOne({ userId });
    if (!u) return;

    u.pending = null;
    await u.save();

    bot.sendMessage(userId, "❌ To‘lov rad etildi");
  }
});

// ===== LOG =====
bot.onText(/\/payments/, async (msg) => {
  if (msg.chat.id != ADMIN_ID) return;

  const list = await Payment.find().sort({ _id: -1 }).limit(10);

  if (list.length === 0) {
    return bot.sendMessage(msg.chat.id, "Bo‘sh");
  }

  let text = "📋 To‘lovlar:\n\n";
  list.forEach(p => {
    text += `${p.userId} - ${subjects[p.subject].name} - ${p.time}\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});

console.log("Bot started...");

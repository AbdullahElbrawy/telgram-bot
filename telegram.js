// const TelegramBot = require('node-telegram-bot-api');
// const db = require('./database');
// const token = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw'; // استبدل 'YOUR_TELEGRAM_BOT_TOKEN' بالتوكن الخاص بك
// const bot = new TelegramBot(token, { polling: true });

// const calculateAccountAgePoints = (accountAge) => {
//     if (accountAge < 1) return 10;
//     if (accountAge < 2) return 20;
//     if (accountAge < 3) return 30;
//     return 50;
// };

// bot.onText(/\/start/, (msg) => {
//     const chatId = msg.chat.id;
//     const username = msg.from.username;

//     if (!username) {
//         bot.sendMessage(chatId, 'عذرًا، يجب أن يكون لديك اسم مستخدم على تلغرام لاستخدام هذا البوت.');
//         return;
//     }

//     const accountAge = new Date().getFullYear() - new Date(msg.from.date * 1000).getFullYear();
//     const points = calculateAccountAgePoints(accountAge);
//     const referralLink = `https://t.me/YOUR_BOT_USERNAME?start=${username}`;

//     db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
//         if (err) {
//             return console.error(err.message);
//         }
//         if (!row) {
//             db.run("INSERT INTO users (username, points, referral_link) VALUES (?, ?, ?)", [username, points, referralLink], (err) => {
//                 if (err) {
//                     return console.error(err.message);
//                 }
//                 bot.sendMessage(chatId, `مرحبا ${username}!\n\nنقاطك الحالية: ${points}\nرابط الإحالة الخاص بك: ${referralLink}`);
//             });
//         } else {
//             bot.sendMessage(chatId, `مرحبا ${username}!\n\nنقاطك الحالية: ${row.points}\nرابط الإحالة الخاص بك: ${row.referral_link}`);
//         }
//     });
// });

// bot.onText(/\/leaderboard/, (msg) => {
//     const chatId = msg.chat.id;
//     db.all("SELECT * FROM users ORDER BY points DESC", [], (err, rows) => {
//         if (err) {
//             return console.error(err.message);
//         }
//         let leaderboard = 'Leaderboard:\n';
//         rows.forEach((row, index) => {
//             leaderboard += `${index + 1}. ${row.username} - ${row.points} نقاط\n`;
//         });
//         bot.sendMessage(chatId, leaderboard);
//     });
// });

// bot.onText(/\/referral (.+)/, (msg, match) => {
//     const chatId = msg.chat.id;
//     const referrer = match[1];
//     const username = msg.from.username;

//     if (!username) {
//         bot.sendMessage(chatId, 'عذرًا، يجب أن يكون لديك اسم مستخدم على تلغرام لاستخدام هذا البوت.');
//         return;
//     }

//     db.get("SELECT * FROM users WHERE username = ?", [referrer], (err, row) => {
//         if (err) {
//             return console.error(err.message);
//         }
//         if (row) {
//             db.run("UPDATE users SET points = points + 10 WHERE username = ?", [referrer], (err) => {
//                 if (err) {
//                     return console.error(err.message);
//                 }
//                 db.run("INSERT INTO referrals (referrer, referred) VALUES (?, ?)", [referrer, username], (err) => {
//                     if (err) {
//                         return console.error(err.message);
//                     }
//                     bot.sendMessage(chatId, `شكرا لانضمامك عبر رابط الإحالة! ${referrer} حصل على 10 نقاط.`);
//                 });
//             });
//         } else {
//             bot.sendMessage(chatId, `المستخدم المحيل غير موجود.`);
//         }
//     });
// });


// -------------------
const TelegramBot = require('node-telegram-bot-api');
const token = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw'; // استبدل 'YOUR_TELEGRAM_BOT_TOKEN' بالتوكن الخاص بك
const bot = new TelegramBot(token, { polling: true });

const webAppUrl = 'https://telegram-h1hrf5b5u-sargaharreys-projects.vercel.app/'; // استبدل هذا بالرابط الفعلي لتطبيقك

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  const message = `Hello ${username}, click the button below to open the web app.`;

  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Open Web App', web_app: { url: webAppUrl } }]
      ]
    }
  });
});



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

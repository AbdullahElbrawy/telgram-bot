const express = require('express');
const axios = require('axios');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());

const TELEGRAM_API_URL = 'https://api.telegram.org';
const BOT_TOKEN = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw'; // Replace with your Telegram bot token
const webAppUrl = 'https://telegram-h1hrf5b5u-sargaharreys-projects.vercel.app/'; // Replace with the actual URL of your React app

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Telegram bot setup
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    const message = `Hello ${username}, click the button below to open the web app.`;

    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Open Web App', web_app: { url: `${webAppUrl}?chat_id=${chatId}` } }]
            ]
        }
    });
});

// Express API to get user data
app.get('/data/:chat_id', async (req, res) => {
    const chatId = req.params.chat_id;
    try {
        // Fetch user data from Telegram API
        const userInfoResponse = await axios.get(`${TELEGRAM_API_URL}/bot${BOT_TOKEN}/getChat?chat_id=${chatId}`);
        const userInfo = userInfoResponse.data.result;

        // Fetch updates to determine account age
        const updatesResponse = await axios.get(`${TELEGRAM_API_URL}/bot${BOT_TOKEN}/getUpdates`);
        const updates = updatesResponse.data.result;

        // Calculate account age based on the first message from the user
        const userMessages = updates.filter(update => update.message && update.message.chat.id == chatId);
        const accountAge = userMessages.length > 0 ? calculateAccountAge(userMessages[0].message.date) : 'Unknown';

        // Calculate leaderboard data from all users
        const leaderboard = calculateLeaderboard(updates);

        const data = {
            username: userInfo.username,
            accountAge: accountAge,
            catsCount: 707,
            community: { name: 'CATS COMMUNITY', bonus: 100 },
            leaderboard: leaderboard,
        };

        res.json(data);
    } catch (error) {
        console.error('Error fetching data from Telegram:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

const calculateAccountAge = (firstMessageDate) => {
    const firstMessageTimestamp = firstMessageDate * 1000; // Convert to milliseconds
    const accountCreationDate = new Date(firstMessageTimestamp);
    const currentDate = new Date();
    const ageInMilliseconds = currentDate - accountCreationDate;
    const ageInYears = ageInMilliseconds / (1000 * 60 * 60 * 24 * 365);
    return `${Math.floor(ageInYears)} years`;
};

const calculateLeaderboard = (updates) => {
    const userScores = {};

    updates.forEach(update => {
        if (update.message) {
            const userId = update.message.from.id;
            const username = update.message.from.username || `User ${userId}`;
            if (!userScores[userId]) {
                userScores[userId] = { username: username, score: 0 };
            }
            userScores[userId].score += 1; // Increment score for each message
        }
    });

    const leaderboard = Object.values(userScores)
        .sort((a, b) => b.score - a.score)
        .map((user, index) => ({
            rank: index + 1,
            name: user.username,
            score: user.score,
            medal: getMedal(index + 1),
        }));

    return leaderboard;
};

const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
};

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

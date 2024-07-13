// 6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const request = require('request');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw'; // Replace with your Telegram bot token
const webAppUrl = 'https://telegram-ten-beta.vercel.app/'; // Replace with the actual URL of your React app

// Initialize Telegram bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Setup SQLite database
const db = new sqlite3.Database(':memory:'); // Use an in-memory database for this example

// Create users table
db.run("CREATE TABLE users (username TEXT PRIMARY KEY, chat_id INTEGER, points INTEGER)");

// Handle /start command
bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1]; // Extract the username from the command

    const message = `Hello ${username}, click the button below to open the web app.`;

    // Store username and chatId in the database
    db.run("INSERT OR REPLACE INTO users (username, chat_id, points) VALUES (?, ?, COALESCE((SELECT points FROM users WHERE username = ?), 0))", [username, chatId, username], (err) => {
        if (err) {
            return console.error('Failed to store user data:', err);
        }
        console.log(`Stored/Updated user: ${username}, chatId: ${chatId}`);
    });

    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Open Web App', web_app: { url: `${webAppUrl}?username=${username}` } }]
            ]
        }
    });
});

// Endpoint to receive chat ID
app.post('/api/sendChatId', (req, res) => {
    const { username } = req.body;

    db.get("SELECT chat_id FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve user data' });
        }
        if (!row) {
            return res.status(404).json({ error: 'User not found' });
        }

        const chatId = row.chat_id;
        res.json({ chatId: chatId });
    });
});

// Get user data endpoint
app.get('/data/:username', (req, res) => {
    const username = req.params.username;

    db.get("SELECT chat_id, points FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve user data' });
        }
        if (!row) {
            return res.status(404).json({ error: 'User not found' });
        }

        const chatId = row.chat_id;
        axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${chatId}`)
            .then(userInfoResponse => {
                const userInfo = userInfoResponse.data.result;

                axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`)
                    .then(updatesResponse => {
                        const updates = updatesResponse.data.result;
                        const userMessages = updates.filter(update => update.message && update.message.chat.id == chatId);
                        const accountAge = userMessages.length > 0 ? calculateAccountAge(userMessages[0].message.date) : 'Unknown';

                        const leaderboard = calculateLeaderboard(updates);

                        const data = {
                            username: userInfo.username,
                            accountAge: accountAge,
                            points: row.points,
                            catsCount: 707,
                            community: { name: 'CATS COMMUNITY', bonus: 100 },
                            leaderboard: leaderboard,
                        };

                        res.json(data);
                    })
                    .catch(error => {
                        console.error('Error fetching updates from Telegram:', error);
                        res.status(500).json({ error: 'Failed to fetch updates' });
                    });
            })
            .catch(error => {
                console.error('Error fetching user data from Telegram:', error);
                res.status(500).json({ error: 'Failed to fetch user data' });
            });
    });
});

// Leaderboard endpoint
app.get('/leaderboard', (req, res) => {
    db.all("SELECT username, points FROM users ORDER BY points DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
        }
        res.json(rows);
    });
});

const calculateAccountAge = (firstMessageDate) => {
    const firstMessageTimestamp = firstMessageDate * 1000;
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
            userScores[userId].score += 1;
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

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

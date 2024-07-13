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
db.run("CREATE TABLE users (username TEXT PRIMARY KEY, chat_id INTEGER)");

// Function to get the latest message and detect the username
const detectUsername = () => {
    axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`)
        .then(response => {
            const updates = response.data.result;
            const lastUpdate = updates[updates.length - 1];
            if (lastUpdate && lastUpdate.message) {
                const chatId = lastUpdate.message.chat.id;
                const username = lastUpdate.message.from.username;

                if (username) {
                    // Store username and chatId in the database
                    db.run("INSERT OR REPLACE INTO users (username, chat_id) VALUES (?, ?)", [username, chatId], (err) => {
                        if (err) {
                            return console.error('Failed to store user data:', err);
                        }
                        console.log(`Stored/Updated user: ${username}, chatId: ${chatId}`);
                        
                        // Send the /start command with the detected username
                        const startMessage = `/start ${username}`;
                        request.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                            json: {
                                chat_id: chatId,
                                text: startMessage
                            }
                        }, (error, response, body) => {
                            if (error) {
                                console.error('Failed to send /start command:', error);
                            } else {
                                console.log('Successfully sent /start command:', body);
                            }
                        });
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error fetching updates from Telegram:', error);
        });
};

// Detect username when the server starts
detectUsername();

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    const message = `Hello ${username}, click the button below to open the web app.`;

    // Store username and chatId in the database
    db.run("INSERT OR REPLACE INTO users (username, chat_id) VALUES (?, ?)", [username, chatId], (err) => {
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

    db.get("SELECT chat_id FROM users WHERE username = ?", [username], (err, row) => {
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
                            points: calculatePoints(accountAge),
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

const calculateAccountAge = (firstMessageDate) => {
    const firstMessageTimestamp = firstMessageDate * 1000;
    const accountCreationDate = new Date(firstMessageTimestamp);
    const currentDate = new Date();
    const ageInMilliseconds = currentDate - accountCreationDate;
    const ageInYears = ageInMilliseconds / (1000 * 60 * 60 * 24 * 365);
    return `${Math.floor(ageInYears)} years`;
};

const calculatePoints = (accountAge) => {
    const ageInYears = parseInt(accountAge);
    if (ageInYears < 1) return 10;
    if (ageInYears < 2) return 20;
    if (ageInYears < 3) return 30;
    return 50;
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

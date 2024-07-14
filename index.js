
// const BOT_TOKEN = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw'; // Replace with your Telegram bot token
// const webAppUrl = 'https://telegram-front-three.vercel.app/'; // Replace with the actual URL of your React app
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const AsyncLock = require('async-lock');

const lock = new AsyncLock();
const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw'; // Replace with your Telegram bot token
const webAppUrl = 'https://telegram-front-three.vercel.app/'; // Replace with the actual URL of your React app

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const mongoUrl = 'mongodb+srv://sarga:sarga@cluster0.fjdnf.mongodb.net/'; // Replace with your MongoDB URL
const dbName = 'points';
let db, usersCollection;

// Initialize MongoDB connection
MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db(dbName);
        usersCollection = db.collection('users');
        console.log('Connected to MongoDB');
    })
    .catch(error => console.error('Failed to connect to MongoDB:', error));

const users = {}; // In-memory storage for user data

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    console.warn(msg);
    try {
        // Get chat information directly from the message
        const creationDate = new Date(msg.date * 1000); // Convert Unix timestamp to JavaScript Date object
        const currentDate = new Date();
        const accountAge = Math.floor((currentDate - creationDate) / (1000 * 60 * 60 * 24)); // Account age in days

        const username = msg.from.username || 'unknown user';

        const message = `Hello ${username}, your account is ${accountAge} days old. Click the button below to open the web app.`;
        console.warn(message, creationDate, currentDate, accountAge);

        // Store or update user data in the in-memory storage
        users[chatId] = {
            username: username,
            chatId: chatId,
            points: users[chatId] ? users[chatId].points : 0
        };

        // Save user data to MongoDB
        await usersCollection.updateOne(
            { chatId: chatId },
            { $set: { username: username, chatId: chatId, points: users[chatId].points } },
            { upsert: true }
        );

        bot.sendMessage(chatId, message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Open Web App', web_app: { url: `${webAppUrl}?username=${username}` } }]
                ]
            }
        });
    } catch (err) {
        bot.sendMessage(chatId, 'Failed to retrieve chat information. Please try again later.');
        console.error('Failed to retrieve chat information:', err);
    }
});

app.post('/api/sendChatId', (req, res) => {
    const { username } = req.body;

    for (const chatId in users) {
        if (users[chatId].username === username) {
            return res.json({ chatId: chatId });
        }
    }

    res.status(404).json({ error: 'User not found' });
});

app.get('/data/:username', (req, res) => {
    const username = req.params.username;

    let user = null;
    for (const chatId in users) {
        if (users[chatId].username === username) {
            user = users[chatId];
            break;
        }
    }

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${user.chatId}`)
        .then(userInfoResponse => {
            const userInfo = userInfoResponse.data.result;
            console.warn(userInfoResponse);
            lock.acquire('getUpdates', done => {
                axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`)
                    .then(updatesResponse => {
                        const updates = updatesResponse.data.result;
                        const userMessages = updates.filter(update => update.message && update.message.chat.id == user.chatId);
                        const accountAge = userMessages.length > 0 ? calculateAccountAge(userMessages[0].message.date) : 'Unknown';

                        const leaderboard = calculateLeaderboard(updates);

                        const data = {
                            username: userInfo.username,
                            accountAge: accountAge,
                            points: user.points,
                            catsCount: 707,
                            community: { name: 'CATS COMMUNITY', bonus: 100 },
                            leaderboard: leaderboard,
                        };

                        res.json(data);
                        done();
                    })
                    .catch(error => {
                        console.error('Error fetching updates from Telegram:', error);
                        res.status(500).json({ error: 'Failed to fetch updates' });
                        done();
                    });
            });
        })
        .catch(error => {
            console.error('Error fetching user data from Telegram:', error);
            res.status(500).json({ error: 'Failed to fetch user data' });
        });
});

app.get('/leaderboard', (req, res) => {
    usersCollection.find().sort({ points: -1 }).toArray((err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve leaderboard data' });
        }

        const leaderboard = users.map((user, index) => ({
            rank: index + 1,
            name: user.username,
            score: user.points,
            medal: getMedal(index + 1),
        }));

        res.json(leaderboard);
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

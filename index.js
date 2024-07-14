
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

const mongoUrl = 'mongodb+srv://sarga:A111a111@cluster0.fjdnf.mongodb.net/';
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

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    console.warn(msg);
    try {
        const creationDate = new Date(msg.date * 1000); // Convert Unix timestamp to JavaScript Date object
        const currentDate = new Date();
        const accountAge = Math.floor((currentDate - creationDate) / (1000 * 60 * 60 * 24)); // Account age in days

        const username = msg.from.username || 'unknown user';

        const message = `Hello ${username}, your account is ${accountAge} days old. Click the button below to open the web app.`;
        console.warn(message, creationDate, currentDate, accountAge);

        // Save user data to MongoDB
        await usersCollection.updateOne(
            { chatId: chatId },
            { $set: { username: username, chatId: chatId, points: 0, accountAge: accountAge } },
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

// Endpoint to retrieve chat ID by username
app.post('/api/sendChatId', async (req, res) => {
    const { username } = req.body;

    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const chatId = user.chatId;
        res.json({ chatId: chatId });
    } catch (error) {
        console.error('Error fetching user from MongoDB:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Endpoint to retrieve user data
app.get('/data/:username', async (req, res) => {
    const username = req.params.username;

    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const chatId = user.chatId;
        axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${chatId}`)
            .then(userInfoResponse => {
                const userInfo = userInfoResponse.data.result;

                lock.acquire('getUpdates', done => {
                    axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`)
                        .then(updatesResponse => {
                            const updates = updatesResponse.data.result;
                            const userMessages = updates.filter(update => update.message && update.message.chat.id == chatId);
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
    } catch (error) {
        console.error('Error fetching user from MongoDB:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Endpoint to retrieve leaderboard data
app.get('/leaderboard', async (req, res) => {
    try {
        const users = await usersCollection.find().sort({ points: -1 }).toArray();

        const leaderboard = users.map((user, index) => ({
            rank: index + 1,
            name: user.username,
            score: user.points,
            medal: getMedal(index + 1),
        }));

        res.json(leaderboard);
    } catch (error) {
        console.error('Failed to retrieve leaderboard data:', error);
        
    }
});

// Function to calculate account age in days
const calculateAccountAge = (firstMessageDate) => {
    const firstMessageTimestamp = firstMessageDate * 1000;
    const accountCreationDate = new Date(firstMessageTimestamp);
    const currentDate = new Date();
    const ageInMilliseconds = currentDate - accountCreationDate;
    const ageInDays = ageInMilliseconds / (1000 * 60 * 60 * 24);
    return `${Math.floor(ageInDays)} days`;
};

// Function to calculate leaderboard
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

// Function to get medal emoji based on rank
const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
};

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

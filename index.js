const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const AsyncLock = require('async-lock');
// const Coinbase = require('coinbase').Client;

const lock = new AsyncLock();
const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.Bot; // Replace with your Telegram bot token
const webAppUrl = process.env.Front; // Replace with the actual URL of your React app

const bot = new Telegraf(BOT_TOKEN);

const mongoUrl = process.env.Mongo;
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

const calculateTelegramAccountAge = (accountCreationDate) => {
    const currentDate = new Date();
    const creationDate = new Date(accountCreationDate * 1000); // Convert seconds to milliseconds

    const ageInMilliseconds = currentDate - creationDate;
    const ageInDays = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24));

    return ageInDays;
};

const spinWheel = () => {
    const prizes = [0, 10, 20, 50, 100]; // Define the possible prizes
    const randomIndex = Math.floor(Math.random() * prizes.length);
    return prizes[randomIndex];
};

const updateUserPoints = async (chatId, points) => {
    await usersCollection.updateOne(
        { chatId: chatId },
        { $inc: { points: points } },
        { upsert: true }
    );
};

// const client = new Coinbase({
//     apiKey: 'YOUR_API_KEY',
//     apiSecret: 'YOUR_API_SECRET'
// });

// const createWallet = async (userId) => {
//     const account = await client.createAccount({ name: `wallet-${userId}` });
//     return account.id;
// };

// const getWalletBalance = async (accountId) => {
//     const account = await client.getAccount(accountId);
//     return account.balance;
// };

bot.start(async (ctx) => {
    const chatId = ctx.message.chat.id;

    try {
        const accountAge = calculateTelegramAccountAge(ctx.message.date);
        const username = ctx.message.from.username || 'unknown user';

        const message = `Hello ${username}, your account is ${accountAge} days old. Click the button below to open the web app.`;

        // Save user data to MongoDB
        await usersCollection.updateOne(
            { chatId: chatId },
            { $set: { username: username, chatId: chatId, points: 0, accountAge: accountAge } },
            { upsert: true }
        );

        ctx.reply(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Open Web App', web_app: { url: `${webAppUrl}?username=${username}&age=${accountAge}` } }]
                ]
            }
        });
    } catch (err) {
        ctx.reply('Failed to retrieve chat information. Please try again later.');
        console.error('Failed to retrieve chat information:', err);
    }
});

bot.command('spin', async (ctx) => {
    const chatId = ctx.message.chat.id;

    const user = await usersCollection.findOne({ chatId: chatId });
    const lastSpinDate = user ? user.lastSpinDate : null;
    const currentDate = new Date().toDateString();

    if (lastSpinDate === currentDate) {
        return ctx.reply("You've already spun the wheel today. Come back tomorrow!");
    }

    const points = spinWheel();
    await updateUserPoints(chatId, points);

    await usersCollection.updateOne(
        { chatId: chatId },
        { $set: { lastSpinDate: currentDate } },
        { upsert: true }
    );

    ctx.reply(`You spun the wheel and won ${points} points!`);
});

// bot.command('wallet', async (ctx) => {
//     const chatId = ctx.message.chat.id;

//     let user = await usersCollection.findOne({ chatId: chatId });
//     if (!user || !user.walletId) {
//         const walletId = await createWallet(chatId);
//         await usersCollection.updateOne(
//             { chatId: chatId },
//             { $set: { walletId: walletId } },
//             { upsert: true }
//         );
//         user = { ...user, walletId };
//     }

//     const balance = await getWalletBalance(user.walletId);
//     ctx.reply(`Your wallet balance is ${balance.amount} ${balance.currency}`);
// });

// Remaining code for endpoints and server initialization
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

app.get('/data/:username/:accountAge?', async (req, res) => {
    const username = req.params.username;
    const accountAge = req.params.accountAge ? parseInt(req.params.accountAge) : null;

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

                            const leaderboard = calculateLeaderboard(updates);

                            const data = {
                                username: userInfo.username,
                                accountAge: accountAge !== null ? accountAge : user.accountAge,
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

bot.launch();

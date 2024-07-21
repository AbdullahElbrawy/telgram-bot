require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const AsyncLock = require('async-lock');
const data = require('./data.json'); // Import the JSON data

const lock = new AsyncLock();
const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.Bot;
const webAppUrl = process.env.Front;
const mongoUrl = process.env.Mongo;

if (!BOT_TOKEN || !webAppUrl || !mongoUrl) {
    console.error("Missing required environment variables. Please check your .env file.");
    process.exit(1);
}

const dbName = 'points';
let db, usersCollection;

// Initialize MongoDB connection
MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db(dbName);
        usersCollection = db.collection('users');
        console.log('Connected to MongoDB');

        const PORT = 3000;
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(error => console.error('Failed to connect to MongoDB:', error));

// Utility functions
const getMonthNumber = (monthName) => {
  const months = {
    "Jan": 0,
    "Feb": 1,
    "Mar": 2,
    "Apr": 3,
    "May": 4,
    "Jun": 5,
    "Jul": 6,
    "Aug": 7,
    "Sep": 8,
    "Oct": 9,
    "Nov": 10,
    "Dec": 11
  };
  return months[monthName];
};

const generateDateList = (data) => {
  const dateList = [];
  for (const year in data) {
    for (const month in data[year]) {
      const value = data[year][month];
      const monthNumber = getMonthNumber(month);
      const date = new Date(year, monthNumber, 1);
      dateList.push({ date, value });
    }
  }
  return dateList;
};

const dateList = generateDateList(data);

const calculateAge = (creationDate) => {
  const now = new Date();
  const created = new Date(creationDate);
  const diff = now - created;
  const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  return age;
};

const getAccountCreationDate = (chatId) => {
  const hash = chatId % dateList.length;
  return dateList[hash].date;
};

const sendMessage = async (chatId, text, reply_markup = {}) => {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      reply_markup: reply_markup
    });
  } catch (error) {
    console.error('Error sending message:', error);
  }
};

// Endpoint to handle the Telegram bot's webhook
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  const message = req.body.message;

  if (message.text === '/start') {
    await handleStartCommand(message);
  } else if (message.text === '/spin') {
    await handleSpinCommand(message);
  } else {
    await sendMessage(message.chat.id, `You sent the command: ${message.text}`);
  }

  res.sendStatus(200);
});

const handleStartCommand = async (message) => {
  const chatId = message.chat.id;
  try {
    const creationDate = getAccountCreationDate(chatId);
    const accountAge = calculateAge(creationDate);
    const username = message.from.username || 'unknown user';

    const text = `Hello ${username}, your account is ${accountAge} days old. Click the button below to open the web app.`;

    // Save user data to MongoDB
    await usersCollection.updateOne(
      { chatId: chatId },
      { $set: { username: username, chatId: chatId, points: 0, accountAge: accountAge } },
      { upsert: true }
    );

    const replyMarkup = {
      inline_keyboard: [
        [{ text: 'Open Web App', web_app: { url: `${webAppUrl}?username=${username}&age=${accountAge}` } }]
      ]
    };

    await sendMessage(chatId, text, replyMarkup);
  } catch (err) {
    await sendMessage(chatId, 'Failed to retrieve chat information. Please try again later.');
    console.error('Failed to retrieve chat information:', err);
  }
};

const handleSpinCommand = async (message) => {
  const chatId = message.chat.id;

  const user = await usersCollection.findOne({ chatId: chatId });
  const lastSpinDate = user ? user.lastSpinDate : null;
  const currentDate = new Date().toDateString();

  if (lastSpinDate === currentDate) {
    return sendMessage(chatId, "You've already spun the wheel today. Come back tomorrow!");
  }

  const points = spinWheel();
  await updateUserPoints(chatId, points);

  await usersCollection.updateOne(
    { chatId: chatId },
    { $set: { lastSpinDate: currentDate } },
    { upsert: true }
  );

  await sendMessage(chatId, `You spun the wheel and won ${points} points!`);
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
  if (!usersCollection) {
    return res.status(500).json({ error: 'Database connection is not established yet. Please try again later.' });
  }

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

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// const express = require('express');
// const bodyParser = require('body-parser');
// const db = require('./database');
// const app = express();
// const port = 3001;

// app.use(bodyParser.json());

// // عرض النقاط للمستخدم
// app.get('/points/:username', (req, res) => {
//     const username = req.params.username;
//     db.get("SELECT points FROM users WHERE username = ?", [username], (err, row) => {
//         if (err) {
//             res.status(500).send(err.message);
//         } else {
//             res.json({ username: username, points: row ? row.points : 0 });
//         }
//     });
// });

// // عرض لوحة المتصدرين
// app.get('/leaderboard', (req, res) => {
//     db.all("SELECT username, points FROM users ORDER BY points DESC", [], (err, rows) => {
//         if (err) {
//             res.status(500).send(err.message);
//         } else {
//             res.json(rows);
//         }
//     });
// });

// app.listen(port, () => {
//     console.log(`Server is running at http://localhost:${port}`);
// });

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const TELEGRAM_API_URL = 'https://api.telegram.org';
const BOT_TOKEN = '6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw';

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

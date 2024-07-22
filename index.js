const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const AsyncLock = require("async-lock");

const { getAccountCreationDate, getPoints } = require("./AgeAccount");

const lock = new AsyncLock();
const app = express();
app.use(cors());
app.use(express.json());

const dbName = "points";
const webAppUrl = "https://telegram-front-three.vercel.app/";

let db, usersCollection;

// Initialize MongoDB connection
MongoClient.connect(
  "mongodb+srv://sarga:A111a111@cluster0.fjdnf.mongodb.net/",
  { useNewUrlParser: true, useUnifiedTopology: true }
)
  .then((client) => {
    db = client.db(dbName);
    usersCollection = db.collection("users");
    console.log("Connected to MongoDB");

    const PORT = 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => console.error("Failed to connect to MongoDB:", error));

const TelegramBot = require("node-telegram-bot-api");

const token = "YOUR_TELEGRAM_BOT_TOKEN";
const bot = new TelegramBot(token, { polling: true });

const sendMessage = async (userId, text, reply_markup = {}) => {
  console.log(
    "Sending message to chat ID:",
    userId,
    "Text:",
    text,
    "Reply Markup:",
    reply_markup
  );
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: userId,
      text: text,
      reply_markup: reply_markup,
    });
  } catch (error) {
    console.error("Error sending message:", error);
  }
};

// Command: /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const referredBy = match[1]; // Get referral ID if present
  console.log("User ID: ", userId, "Referred By: ", referredBy);

  try {
    const username = msg.from.username || "unknown user";
    const existingUser = await usersCollection.findOne({ userId: userId });

    if (existingUser) {
      const text = `Hello ${existingUser.username}, Registered in ${existingUser.accountAge}. 
      and have points ${existingUser.points}.
      Click the button below to open the web app.`;

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "Open Web App",
              web_app: {
                url: `${webAppUrl}?username=${existingUser.username}&age=${existingUser.accountAge}`,
              },
            },
          ],
        ],
      };

      await sendMessage(userId, text, replyMarkup);
    } else {
      const creationDate = getAccountCreationDate(userId);
      const myPoints = getPoints(creationDate);

      console.log(username, creationDate, myPoints);

      const text = `Hello ${username}, Registered in ${creationDate}. 
      and have points ${myPoints}.
      Click the button below to open the web app.`;

      const userDoc = {
        username: username,
        userId: userId,
        points: myPoints || 0,
        accountAge: creationDate,
        referredBy: referredBy || null,
        hasSpun: false, // Initialize spin flag
      };

      // Save user data to MongoDB
      await usersCollection.updateOne(
        { userId: userId },
        { $set: userDoc },
        { upsert: true }
      );

      if (referredBy) {
        // Award bonus points to the referrer
        await usersCollection.updateOne(
          { userId: referredBy },
          { $inc: { points: 10 } }
        );
        const referrer = await usersCollection.findOne({ userId: referredBy });
        if (referrer) {
          await sendMessage(
            referredBy,
            `You have received 10 bonus points for referring ${username}. Your total points are now ${referrer.points + 10}.`
          );
        }
      }

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "Open Web App",
              web_app: {
                url: `${webAppUrl}?username=${username}&age=${creationDate}`,
              },
            },
          ],
        ],
      };

      await sendMessage(userId, text, replyMarkup);
    }
  } catch (err) {
    await sendMessage(
      userId,
      "Failed to retrieve chat information. Please try again later."
    );
    console.error("Failed to retrieve chat information:", err);
  }
});

// Command: /menu
bot.onText(/\/menu/, (msg) => {
  const userId = msg.chat.id;
  const menuOptions = {
    reply_markup: {
      keyboard: [["/hello", "/goodbye", "/spin"]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };

  bot.sendMessage(userId, "Choose an option:", menuOptions);
});

// Command: /hello
bot.onText(/\/hello/, (msg) => {
  const userId = msg.chat.id;
  bot.sendMessage(userId, "Hello! 👋");
});

// Command: /goodbye
bot.onText(/\/goodbye/, (msg) => {
  const userId = msg.chat.id;
  bot.sendMessage(userId, "Goodbye! 👋");
});

// Command: /spin
bot.onText(/\/spin/, async (msg) => {
  const userId = msg.chat.id;

  try {
    const user = await usersCollection.findOne({ userId: userId });

    if (!user) {
      bot.sendMessage(userId, "You need to register first by using /start.");
      return;
    }

    if (user.hasSpun) {
      bot.sendMessage(userId, "You have already used your spin.");
      return;
    }

    const bonusPoints = spinForPoints();
    await usersCollection.updateOne(
      { userId: userId },
      { $inc: { points: bonusPoints }, $set: { hasSpun: true } }
    );

    bot.sendMessage(
      userId,
      `Congratulations! You have won ${bonusPoints} bonus points. Your total points are now ${
        user.points + bonusPoints
      }.`
    );
  } catch (error) {
    console.error("Failed to process spin:", error);
    bot.sendMessage(userId, "Failed to process spin. Please try again later.");
  }
});

// RESTful APIs
app.post("/api/sendChatId", async (req, res) => {
  const { username } = req.body;

  try {
    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user.userId;
    res.json({ userId: userId });
  } catch (error) {
    console.error("Error fetching user from MongoDB:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.get("/data/:username/:accountAge?", async (req, res) => {
  if (!usersCollection) {
    return res.status(500).json({
      error:
        "Database connection is not established yet. Please try again later.",
    });
  }

  const username = req.params.username;
  const accountAge = req.params.accountAge
    ? parseInt(req.params.accountAge)
    : null;

  try {
    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user.userId;

    axios
      .get(`https://api.telegram.org/bot${token}/getChat?chat_id=${userId}`)
      .then((userInfoResponse) => {
        const userInfo = userInfoResponse.data.result;

        lock.acquire("getUpdates", (done) => {
          axios
            .get(`https://api.telegram.org/bot${token}/getUpdates`)
            .then((updatesResponse) => {
              const updates = updatesResponse.data.result;
              const userMessages = updates.filter(
                (update) => update.message && update.message.chat.id == userId
              );

              const leaderboard = calculateLeaderboard(updates);

              const data = {
                username: userInfo.username,
                accountAge: accountAge !== null ? accountAge : user.accountAge,
                points: user.points,
                catsCount: 707,
                community: { name: "CATS COMMUNITY", bonus: 100 },
                leaderboard: leaderboard,
              };

              res.json(data);
              done();
            })
            .catch((error) => {
              console.error("Error fetching updates from Telegram:", error);
              res.status(500).json({ error: "Failed to fetch updates" });
              done();
            });
        });
      })
      .catch((error) => {
        console.error("Error fetching user data from Telegram:", error);
        res.status(500).json({ error: "Failed to fetch user data" });
      });
  } catch (error) {
    console.error("Error fetching user from MongoDB:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.get("/leaderboard", async (req, res) => {
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
    console.error("Failed to retrieve leaderboard data:", error);
  }
});

const calculateLeaderboard = (updates) => {
  const userScores = {};

  updates.forEach((update) => {
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
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
};

const spinForPoints = () => {
  const pointsArray = [10, 20, 50, 100]; // Different points a user can win
  const randomIndex = Math.floor(Math.random() * pointsArray.length);
  return pointsArray[randomIndex];
};

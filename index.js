const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const AsyncLock = require("async-lock");
const crypto = require("crypto");
const moment = require("moment");

const { getAccountCreationDate, getPoints } = require("./AgeAccount");

const lock = new AsyncLock();
const app = express();
app.use(cors());
app.use(express.json());

const dbName = "points";
const webAppUrl = "https://telegram-front-three.vercel.app/";

let db, usersCollection;

// Initialize MongoDB connection
const initMongoDB = async () => {
  try {
    const client = await MongoClient.connect(
      "mongodb+srv://sarga:A111a111@cluster0.fjdnf.mongodb.net/",
      { useNewUrlParser: true, useUnifiedTopology: true }
    );
    db = client.db(dbName);
    usersCollection = db.collection("users");
    console.log("Connected to MongoDB");

    const PORT = 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
};

initMongoDB();

const TelegramBot = require("node-telegram-bot-api");

const token = "6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw";
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
    console.error("Error sending message:", error.response ? error.response.data : error.message);
  }
};

// Generate a unique referral code
const generateReferralCode = () => {
  return crypto.randomBytes(4).toString("hex");
};

// Command: /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const referralCode = match[1]; // Get referral code if present
  console.log("User ID: ", userId, "Referred By: ", referralCode);

  try {
    const username = msg.from.username || "unknown user";

    if (!usersCollection) {
      throw new Error("Database connection not initialized");
    }

    const existingUser = await usersCollection.findOne({ userId: userId });

    if (existingUser) {
      const text = `Hello ${existingUser.username}, Registered in ${existingUser.accountAge}. 
      and have points ${existingUser.points}.
      Your referral link is: ${webAppUrl}?ref=${existingUser.referralCode}`;

      await sendMessage(userId, text);
    } else {
      const creationDate = getAccountCreationDate(userId);
      const myPoints = getPoints(creationDate);
      const newReferralCode = generateReferralCode();

      console.log(username, creationDate, myPoints);

      const text = `Hello ${username}, Registered in ${creationDate}. 
      and have points ${myPoints}.
      Your referral link is: ${webAppUrl}?ref=${newReferralCode}`;

      const userDoc = {
        username: username,
        userId: userId,
        points: myPoints || 0,
        accountAge: creationDate,
        referredBy: referralCode || null,
        hasSpun: false, // Initialize spin flag
        referralCode: newReferralCode, // Set referral code
        lastSpinDate: null, // Initialize last spin date
        luckySpin: [], // Initialize lucky
      };

      // Save user data to MongoDB
      await usersCollection.updateOne(
        { userId: userId },
        { $set: userDoc },
        { upsert: true }
      );

      if (referralCode) {
        // Award bonus points to the referrer
        const referrer = await usersCollection.findOne({
          referralCode: referralCode,
        });
        if (referrer) {
          await usersCollection.updateOne(
            { userId: referrer.userId },
            { $inc: { points: 10 } }
          );
          await sendMessage(
            referrer.userId,
            `You have received 10 bonus points for referring ${username}. Your total points are now ${
              referrer.points + 10
            }.`
          );
        }
      }

      await sendMessage(userId, text);
    }
  } catch (err) {
    await sendMessage(
      userId,
      "Failed to retrieve chat information. Please try again later."
    );
    console.error("Failed to retrieve chat information:", err);
  }
});

// RESTful APIs
app.post("/api/sendChatId", async (req, res) => {
  const { username } = req.body;

  try {
    if (!usersCollection) {
      throw new Error("Database connection not initialized");
    }

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

// New endpoint to handle user registration with referral code
app.post("/api/register", async (req, res) => {
  const { username, referralCode } = req.body;
  const userId = crypto.randomBytes(4).toString("hex"); // Generate a unique userId for this example

  try {
    if (!usersCollection) {
      throw new Error("Database connection not initialized");
    }

    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const creationDate = getAccountCreationDate(userId);
    const myPoints = getPoints(creationDate);
    const newReferralCode = generateReferralCode();

    const userDoc = {
      username: username,
      userId: userId,
      points: myPoints || 0,
      accountAge: creationDate,
      referredBy: referralCode || null,
      hasSpun: false,
      referralCode: newReferralCode,
      lastSpinDate: null,
      luckySpin: [], // Initialize lucky
    };

    // Save user data to MongoDB
    await usersCollection.updateOne(
      { userId: userId },
      { $set: userDoc },
      { upsert: true }
    );

    if (referralCode) {
      // Award bonus points to the referrer
      const referrer = await usersCollection.findOne({
        referralCode: referralCode,
      });
      if (referrer) {
        await usersCollection.updateOne(
          { userId: referrer.userId },
          { $inc: { points: 10 } }
        );
        await sendMessage(
          referrer.userId,
          `You have received 10 bonus points for referring ${username}. Your total points are now ${
            referrer.points + 10
          }.`
        );
      }
    }

    res.json({ message: "Registration successful", user: userDoc });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/api/spin", async (req, res) => {
  const { userId, bonusPoints } = req.body;

  try {
    if (!usersCollection) {
      throw new Error("Database connection not initialized");
    }

    const user = await usersCollection.findOne({ userId: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const today = moment().startOf("day").format("YYYY-MM-DD");

    // Check if today's date is already in the luckySpin array
    const hasSpunToday =
      user.luckySpin && user.luckySpin.some((spin) => spin.date === today);

    if (hasSpunToday) {
      return res
        .status(400)
        .json({ error: "You have already used your spin today." });
    }

    // Update the user's luckySpin array and points
    const newSpinEntry = { date: today, bonusPoints: bonusPoints };
    await usersCollection.updateOne(
      { userId: userId },
      {
        $inc: { points: bonusPoints },
        $push: { luckySpin: newSpinEntry },
      }
    );
    console.log("User spun successfully:", newSpinEntry);
    res.json({
      message: `Congratulations! You have won ${bonusPoints} bonus points.`,
      totalPoints: user.points + bonusPoints,
    });
  } catch (error) {
    console.error("Failed to process spin:", error);
    res
      .status(500)
      .json({ error: "Failed to process spin. Please try again later." });
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

    // Determine if the user can spin today
    const today = moment().startOf("day").format("YYYY-MM-DD");

    console.log("User:", user);
    console.log("Today:", today);

    const hasUserSpunToday =
      user.luckySpin && user.luckySpin.some((spin) => spin.date === today);
    const hasSpunToday = hasUserSpunToday;

    axios
      .get(`https://api.telegram.org/bot${token}/getChat?chat_id=${userId}`)
      .then((userInfoResponse) => {
        const userInfo = userInfoResponse.data.result;

        console.log("User Info:", userInfo);

        lock.acquire("getUpdates", (done) => {
          axios
            .get(`https://api.telegram.org/bot${token}/getUpdates`)
            .then((updatesResponse) => {
              const updates = updatesResponse.data.result;
              const userMessages = updates.filter(
                (update) => update.message && update.message.chat.id == userId
              );
              const data = {
                username: userInfo.username,
                accountAge: accountAge !== null ? accountAge : user.accountAge,
                points: user.points,
                community: { name: "Lions COMMUNITY", bonus: 100 },
                userId: userInfo.id,
                hasSpunToday: hasSpunToday,
                luckySpin: user.luckySpin,
                // Include the flagKey in the response
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

app.post("/leaderboard", async (req, res) => {
  const { userId } = req.body;

  try {
    if (!usersCollection) {
      throw new Error("Database connection not initialized");
    }

    const users = await usersCollection.find().sort({ points: -1 }).toArray();
    const user = await usersCollection.findOne({ userId: userId });

    let userRank = -1;
    const leaderboard = users.map((user, index) => {
      if (user.userId === userId) {
        userRank = index + 1;
      }
      return {
        rank: index + 1,
        name: user.username,
        score: user.points,
        medal: getMedal(index + 1),
        userId: user.userId,
      };
    });

    const leaderboardUser = {
      rank: userRank,
      name: user ? user.username : null,
      score: user ? user.points : null,
      medal: userRank !== -1 ? getMedal(userRank) : null,
      userId: userId,
    };

    res.json({ leaderboard, leaderboardUser });
  } catch (error) {
    console.error("Failed to retrieve leaderboard data:", error);
    res.status(500).json({ message: "Failed to retrieve leaderboard data" });
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

// const spinForPoints = () => {
//   const pointsArray = [10, 20, 50, 100]; // Different points a user can win
//   const randomIndex = Math.floor(Math.random() * pointsArray.length);
//   return pointsArray[randomIndex];
// };

app.listen(3001);

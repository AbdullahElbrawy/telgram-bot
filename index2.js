const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const moment = require('moment');

// MongoDB connection details
const uri = "mongodb+srv://sarga:A111a111@cluster0.fjdnf.mongodb.net/";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Telegram bot token
const bot = new Telegraf('6774203452:AAHCea16A3G4j6CY1FmZuXpYoHHttYbD6Gw');

async function getAccountAge(userId) {
  try {
    await client.connect();
    const database = client.db('BOT');
    const usersCollection = database.collection('BOT');

    // Find the user in the database
    const user = await usersCollection.findOne({ user_id: userId });

    if (!user) {
      return 'User not found';
    }

    const joinDate = user.join_date;
    const accountAge = moment().diff(moment(joinDate), 'days');
    
    return `Account Age: ${accountAge} days`;
  } catch (error) {
    console.error(error);
    return 'Error occurred while fetching account age';
  } finally {
    await client.close();
  }
}


bot.start(async (ctx) => {
  const userId = ctx.message.from.id;
  const accountAgeMessage = await getAccountAge(userId);
  ctx.reply(accountAgeMessage);
});


bot.launch();

console.log('Bot is running...');

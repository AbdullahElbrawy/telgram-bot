const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bot_database.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, points INTEGER, referral_link TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS referrals (referrer TEXT, referred TEXT)");
});

module.exports = db;

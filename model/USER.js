const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    chatId: { type: Number, required: true, unique: true },
    points: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

module.exports = User;

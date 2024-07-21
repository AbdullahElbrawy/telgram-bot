const data = require('./data.json'); // Import the JSON data

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

module.exports = { calculateAge, getAccountCreationDate };
